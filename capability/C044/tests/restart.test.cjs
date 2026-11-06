'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');
const cursors = require('../cursor.js');
const { openLog } = require('../store.cjs');
const { openStream, fixtureContext, scratchDirectory, root } = require('./support.cjs');

const fixtureFile = path.join(root, 'tests', 'fixture-server.cjs');
const clean = (env) => { const copy = { ...env }; delete copy.NODE_TEST_CONTEXT; return copy; };

function startServer(dir, epoch = 3) {
  const child = spawn(process.execPath, [fixtureFile, dir, String(epoch)], { env: clean(process.env), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const state = { child, stdout: '', stderr: '', exit: null, signal: null, exited: false, origin: null };
  const wake = [];
  const poke = () => wake.splice(0).forEach((fn) => fn());
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    state.stdout += chunk;
    if (!state.origin && state.stdout.includes('\n')) state.origin = JSON.parse(state.stdout.split('\n')[0]).origin;
    poke();
  });
  child.stderr.on('data', (chunk) => { state.stderr += chunk; poke(); });
  child.on('exit', (code, signal) => { state.exit = code; state.signal = signal; state.exited = true; poke(); });
  state.waitFor = (predicate, label) => new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error(`Timed out waiting for ${label}`)), 20000);
    const check = () => { if (predicate(state)) { clearTimeout(timer); done(state); } else wake.push(check); };
    check();
  });
  state.kill = async () => {
    if (!state.exited) child.kill();
    await state.waitFor((value) => value.exited, 'process exit');
  };
  return state;
}

const json = async (origin, route) => (await fetch(`${origin}${route}`)).json();

test('a server process killed in the middle of the run restores its run and event log and every acknowledged event survives', async () => {
  const scratch = scratchDirectory();
  const servers = [];
  try {
    const first = startServer(scratch.directory);
    servers.push(first);
    await first.waitFor((state) => state.origin, 'first server');
    const client = await openStream(first.origin);
    await client.waitFor((value) => value.events.length >= 25, 'twenty-five acknowledged events');
    const acknowledged = client.events.map((event) => event);
    const last = acknowledged.at(-1);
    client.destroy();
    let detachedHead = 0;
    for (let turn = 0; detachedHead < last.data.seq + 3; turn++) {
      assert.ok(turn < 2000, 'the run must keep producing while no client is attached');
      detachedHead = (await json(first.origin, '/run.json')).run.headSeq;
    }
    await first.kill();
    assert.ok(first.signal !== null || first.exit !== 0, 'the process was killed, not stopped gracefully');

    const persisted = openLog(scratch.directory, fixtureContext());
    try {
      assert.ok(persisted.restored.events.length >= acknowledged.length, 'no acknowledged event is missing from the persisted log');
      assert.deepEqual(persisted.restored.events.slice(0, acknowledged.length).map((event) => event.data), acknowledged.map((event) => event.data));
      persisted.restored.events.forEach((event, index) => assert.equal(event.seq, index + 1));
    } finally {
      persisted.close();
    }
    const head = persisted.restored.events.length;

    const second = startServer(scratch.directory);
    servers.push(second);
    await second.waitFor((state) => state.origin, 'restarted server');
    const snapshot = await json(second.origin, '/run.json');
    assert.equal(snapshot.restore.persisted, true);
    assert.equal(snapshot.restore.restoredEvents, head);
    assert.equal(snapshot.restore.created, false);
    assert.deepEqual([snapshot.context.runId, snapshot.context.epoch], ['synthetic-run-001', 3]);
    assert.ok(snapshot.run.headSeq >= head, 'the run continues, it does not restart');

    const resumed = await openStream(second.origin, '/stream', { 'Last-Event-ID': last.id });
    await resumed.waitFor((value) => value.events.length >= 15, 'events after the cursor');
    const seqs = resumed.seqs();
    assert.equal(seqs[0], last.data.seq + 1, 'resume starts at the next event after the restart');
    seqs.forEach((seq, index) => assert.equal(seq, seqs[0] + index, 'no gap and no duplicate'));
    assert.ok(seqs.includes(head + 1), 'production continued at the next sequence after the restored head');
    const original = persisted.restored.events.find((event) => event.seq === seqs[0]);
    assert.deepEqual(resumed.events[0].data, original.data, 'an event produced before the kill is replayed with identical data');
    resumed.destroy();
    await second.kill();
  } finally {
    for (const server of servers) await server.kill();
    scratch.remove();
  }
});

test('a new epoch keeps the old log immutable and answers an old-epoch cursor with a typed failure, never an empty stream', async () => {
  const scratch = scratchDirectory();
  const servers = [];
  try {
    const first = startServer(scratch.directory, 2);
    servers.push(first);
    await first.waitFor((state) => state.origin, 'epoch 2 server');
    const old = await openStream(first.origin);
    await old.waitFor((value) => value.events.length >= 5, 'epoch 2 events');
    const oldCursor = old.events.at(-1).id;
    old.destroy();
    await first.kill();

    const next = startServer(scratch.directory, 3);
    servers.push(next);
    await next.waitFor((state) => state.origin, 'epoch 3 server');
    const snapshot = await json(next.origin, '/run.json');
    assert.deepEqual(snapshot.restore.knownEarlierEpochs, [2]);
    assert.equal(snapshot.restore.created, true);
    const refused = await openStream(next.origin, '/stream', { 'Last-Event-ID': oldCursor });
    assert.equal(refused.status, 409);
    const body = await refused.json();
    assert.equal(body.error.code, 'CURSOR_EPOCH_MISMATCH');
    assert.equal(cursors.inspectFailure(body).error.code, 'CURSOR_EPOCH_MISMATCH');
    assert.deepEqual(refused.events, []);
    const fresh = await openStream(next.origin);
    await fresh.waitFor((value) => value.events.length >= 3, 'epoch 3 events');
    assert.deepEqual(fresh.events.slice(0, 3).map((event) => [event.data.epoch, event.data.seq]), [[3, 1], [3, 2], [3, 3]]);
    fresh.destroy();
    await next.kill();

    const regressed = startServer(scratch.directory, 2);
    servers.push(regressed);
    await regressed.waitFor((state) => state.exited, 'refusal to go back to epoch 2');
    assert.notEqual(regressed.exit, 0);
    assert.match(regressed.stderr, /STALE_EPOCH/);
    assert.equal(regressed.origin, null, 'no listener was started for a regressed epoch');
  } finally {
    for (const server of servers) await server.kill();
    scratch.remove();
  }
});
