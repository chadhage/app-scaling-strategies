'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { FakeOS, buildTree } = require('./support/fake-os.cjs');
const { loadImplementation } = require('./support/impl.cjs');

const { snapshotTree, terminateOwned } = loadImplementation().tree;
const pids = (list) => list.map((item) => item.pid).sort((x, y) => x - y);
const sorted = (...processes) => processes.map((p) => p.pid).sort((x, y) => x - y);
const KEYS = ['alreadyGone', 'errors', 'refused', 'survivors', 'terminated'];

async function setup(options) {
  const os = new FakeOS(options);
  const t = buildTree(os);
  const snapshot = await snapshotTree(t.root.pid, os.adapters());
  return { os, t, snapshot };
}

test('the owned tree is terminated parent first with its recorded identities and nothing else is touched', async () => {
  const { os, t, snapshot } = await setup();
  const sibling = os.spawn(os.selfPid);
  const stranger = os.spawn(4);
  const result = await terminateOwned(snapshot, { timeoutMs: 5000, adapters: os.adapters() });
  assert.deepEqual(Object.keys(result).sort(), KEYS);
  assert.deepEqual(pids(result.terminated), sorted(t.root, t.a, t.b, t.c, t.a1, t.b1, t.c1));
  for (const key of ['alreadyGone', 'survivors', 'refused', 'errors']) assert.deepEqual(result[key], []);
  assert.deepEqual(os.killBatches[0].map((identity) => identity.pid), [t.root, t.a, t.b, t.c, t.a1, t.b1, t.c1].map((p) => p.pid));
  for (const identity of os.killBatches.flat()) assert.equal(identity.createdAt, snapshot.entries.find((e) => e.pid === identity.pid).createdAt);
  assert.deepEqual([...os.table.keys()].sort((x, y) => x - y), [os.selfPid, sibling.pid, stranger.pid].sort((x, y) => x - y));
  assert.equal(os.killBatches.length, 1);
  assert.equal(os.listCalls, 3, 'snapshot, verification before the kill and one confirming list');
});

test('an orphan recorded while its parent lived is terminated and its exited parent is already gone', async () => {
  const { os, t, snapshot } = await setup();
  os.exit(t.c.pid);
  const result = await terminateOwned(snapshot, { timeoutMs: 5000, adapters: os.adapters() });
  assert.deepEqual(pids(result.alreadyGone), [t.c.pid]);
  assert.deepEqual(pids(result.terminated), sorted(t.root, t.a, t.b, t.a1, t.b1, t.c1));
  assert.ok(!os.table.has(t.c1.pid), 'the orphan is gone');
});

test('processes that already exited are listed as already gone without any kill and without throwing', async () => {
  const { os, t, snapshot } = await setup();
  for (const process of Object.values(t)) os.exit(process.pid);
  const result = await terminateOwned(snapshot, { adapters: os.adapters() });
  assert.deepEqual(pids(result.alreadyGone), sorted(...Object.values(t)));
  assert.equal(os.killBatches.length, 0);
  assert.deepEqual(result.errors, []);
});

test('a live pid with another creation time is refused and never killed (pid reuse)', async () => {
  const { os, t, snapshot } = await setup();
  os.exit(t.a1.pid);
  const holder = os.put(t.a1.pid, 4, os.created());
  const result = await terminateOwned(snapshot, { timeoutMs: 5000, adapters: os.adapters() });
  assert.deepEqual(pids(result.refused), [t.a1.pid]);
  assert.equal(result.refused[0].reason, 'identity-mismatch');
  assert.ok(!os.killedPids().includes(t.a1.pid));
  assert.equal(os.table.get(t.a1.pid), holder, 'the younger holder of the pid survives');
  assert.equal(result.terminated.length, 6);
});

test('a pid reused between verification and kill is refused by the adapter outcome', async () => {
  const { os, t, snapshot } = await setup();
  os.beforeKill = () => {
    os.exit(t.a1.pid);
    os.put(t.a1.pid, 4, os.created());
  };
  const result = await terminateOwned(snapshot, { timeoutMs: 5000, adapters: os.adapters() });
  assert.deepEqual(pids(result.refused), [t.a1.pid]);
  assert.equal(result.refused[0].reason, 'identity-mismatch');
  assert.ok(os.table.has(t.a1.pid));
  assert.equal(result.survivors.length, 0);
});

test('a process that exits between verification and kill is already gone, not terminated', async () => {
  const { os, t, snapshot } = await setup();
  os.beforeKill = () => os.exit(t.a.pid);
  const result = await terminateOwned(snapshot, { timeoutMs: 5000, adapters: os.adapters() });
  assert.deepEqual(pids(result.alreadyGone), [t.a.pid]);
  assert.equal(result.terminated.length, 6);
});

test('a refused kill is an error and a survivor and is not retried', async () => {
  const { os, t, snapshot } = await setup();
  os.table.get(t.b.pid).denied = true;
  const result = await terminateOwned(snapshot, { timeoutMs: 5000, adapters: os.adapters() });
  assert.deepEqual(pids(result.survivors), [t.b.pid]);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].pid, t.b.pid);
  assert.equal(result.errors[0].code, 'ERR_KILL');
  assert.match(result.errors[0].message, /access denied/);
  assert.equal(os.killBatches.length, 1);
  assert.equal(result.terminated.length, 6);
});

test('a process that survives every kill is reported at the deadline instead of looping', async () => {
  const { os, t, snapshot } = await setup();
  os.table.get(t.c1.pid).immortal = true;
  const result = await terminateOwned(snapshot, { timeoutMs: 200, adapters: os.adapters() });
  assert.deepEqual(pids(result.survivors), [t.c1.pid]);
  assert.ok(result.errors.some((error) => error.code === 'ERR_DEADLINE'));
  assert.ok(os.clockMs <= 200 + 30, `bounded by the deadline, took ${os.clockMs} ms`);
  assert.ok(os.killBatches.length >= 2, 'it retried while time remained');
});

test('a process that dies after a survived outcome is terminated', async () => {
  const { os, t, snapshot } = await setup();
  os.table.get(t.b.pid).survivesOnce = true;
  const result = await terminateOwned(snapshot, { timeoutMs: 5000, adapters: os.adapters() });
  assert.equal(result.terminated.length, 7);
  assert.deepEqual(result.survivors, []);
  assert.equal(os.killBatches.length, 1);
});

test('a failing list or kill adapter is reported, every entry stays a survivor and nothing is retried forever', async () => {
  const first = await setup();
  first.os.failList = new Error('boom');
  const listed = await terminateOwned(first.snapshot, { adapters: first.os.adapters() });
  assert.equal(listed.errors[0].code, 'ERR_LIST');
  assert.equal(listed.survivors.length, 7);
  assert.equal(first.os.killBatches.length, 0);
  const second = await setup();
  second.os.failKill = new Error('helper hung');
  const killed = await terminateOwned(second.snapshot, { adapters: second.os.adapters() });
  assert.equal(killed.errors[0].code, 'ERR_KILL');
  assert.equal(killed.survivors.length, 7);
  assert.equal(second.os.killBatches.length, 1);
  const third = await setup();
  third.os.killBogus = [];
  const silent = await terminateOwned(third.snapshot, { adapters: third.os.adapters() });
  assert.equal(silent.errors.length, 7);
  assert.ok(silent.errors.every((error) => /no outcome/.test(error.message)));
  const fourth = await setup();
  fourth.os.listBogus = [{ pid: 0, ppid: 0, createdAt: '1' }];
  const bogus = await terminateOwned(fourth.snapshot, { adapters: fourth.os.adapters() });
  assert.equal(bogus.errors[0].code, 'ERR_LIST');
});

test('a slow list is cut off by the deadline and nothing is killed after it', async () => {
  const { os, snapshot } = await setup({ listCostMs: 400 });
  const before = os.clockMs;
  const result = await terminateOwned(snapshot, { timeoutMs: 300, adapters: os.adapters() });
  assert.equal(os.killBatches.length, 0);
  assert.equal(result.survivors.length, 7);
  assert.ok(result.errors.some((error) => error.code === 'ERR_DEADLINE'));
  assert.ok(os.clockMs - before <= 400);
});

test('children found alive under a verified owned process during termination are adopted and terminated', async () => {
  const { os, t, snapshot } = await setup();
  let late;
  os.beforeList = (call) => {
    if (call === 2) late = os.spawn(t.a1.pid);
  };
  const result = await terminateOwned(snapshot, { timeoutMs: 5000, adapters: os.adapters() });
  assert.ok(pids(result.terminated).includes(late.pid));
  assert.equal(result.terminated.length, 8);
  assert.ok(!os.table.has(late.pid));
});

test('the caller, its ancestors and unreadable processes are refused with a reason and never killed', async () => {
  const os = new FakeOS();
  const parent = os.put(31, 4, os.created());
  const self = os.put(os.selfPid, 31, os.created());
  const unreadable = os.put(2000, 4, null);
  const entry = (p, createdAt) => ({ pid: p.pid, ppid: p.ppid, createdAt: createdAt || p.createdAt, depth: 0 });
  const snapshot = { version: 1, rootPid: 31, capturedAtMs: 0, entries: [entry(parent), entry(self), entry(unreadable, '123')] };
  const result = await terminateOwned(snapshot, { adapters: os.adapters() });
  assert.deepEqual(result.refused.map((item) => [item.pid, item.reason]).sort((x, y) => x[0] - y[0]),
    [[31, 'protected'], [2000, 'unverifiable'], [os.selfPid, 'protected']].sort((x, y) => x[0] - y[0]));
  assert.equal(os.killBatches.length, 0);
  assert.equal(os.table.size, 3);
});

test('invalid snapshots, timeouts and adapters are rejected before anything runs', async () => {
  const { os, snapshot } = await setup();
  const good = os.adapters();
  const entry = snapshot.entries[0];
  const bad = [null, { version: 2, entries: [] }, { version: 1, entries: 'x' },
    { version: 1, entries: [{ ...entry, pid: 0 }] }, { version: 1, entries: [{ ...entry, createdAt: 'x' }] },
    { version: 1, entries: [{ ...entry, ppid: -1 }] }, { version: 1, entries: [entry, entry] }];
  for (const invalid of bad) await assert.rejects(terminateOwned(invalid, { adapters: good }), { code: 'ERR_INVALID_ARG' });
  for (const timeoutMs of [0, -1, NaN, '5', Infinity]) await assert.rejects(terminateOwned(snapshot, { timeoutMs, adapters: good }), { code: 'ERR_INVALID_ARG' });
  for (const adapters of [undefined, {}, { ...good, kill: null }]) await assert.rejects(terminateOwned(snapshot, { adapters }), { code: 'ERR_INVALID_ARG' });
  await assert.rejects(terminateOwned(snapshot), { code: 'ERR_INVALID_ARG' });
  assert.equal(os.killBatches.length, 0);
});
