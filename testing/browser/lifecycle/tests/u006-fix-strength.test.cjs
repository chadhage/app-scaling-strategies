'use strict';

// U006 fix F4 (test strength): the survivors of the systematic mutation run over close.cjs and session.cjs, each pinned by a named test below.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImplementation } = require('./u006-support-impl.cjs');
const { makeSession, wrap, World } = require('./u006-support-sealed.cjs');
const { drive, settle, quiesce, optionsFor, FakeOpener } = require('./u005-support-world.cjs');

const { startSession } = loadImplementation().session;
const { wrapSession } = loadImplementation().close;
const T = { timeout: 20000 };
const closeOf = async (world, wrapped) => (await drive(world.clock, settle(wrapped.close()))).value;
const ids = (items) => items.map((item) => item.pid).sort((a, b) => a - b);
const rowsOf = (world) => [...world.os.table.values()].map(({ pid, ppid, createdAt }) => ({ pid, ppid, createdAt }));

// A session whose crashpad cannot be killed (immortal) and leaves the table `leaveAt` ms into the virtual close. rewrite(after, rows) may change any table read:
// `after` counts the reads since the kill passes ended (0 before, 1 = the confirming read, 2 = the re-read).
async function stuckCrashpad({ leaveAt = Infinity, rewrite = (after, rows) => rows, session = {}, options = {}, prepare = () => {} } = {}) {
  const world = new World();
  const made = await makeSession(world, { keep: 'crashpad', ...session });
  const crashpad = made.opener.crashpad;
  world.os.table.get(crashpad.pid).immortal = true;
  prepare(world, made);
  let after = 0;
  let ran = false;
  const run = made.owned.run.bind(made.owned);
  made.owned.run = async (limit) => { const result = await run(limit); ran = true; return result; };
  world.behaviors.list = () => {
    if (ran) after += 1;
    if (world.clock.now() >= leaveAt) world.os.exit(crashpad.pid);
    return Promise.resolve(rewrite(after, rowsOf(world)));
  };
  const out = await closeOf(world, wrap(world, made, { terminateMs: 20000, listMs: 5000, exitSettleMs: 2000, ...options }));
  return { world, made, crashpad, out, readsAfterRun: () => after };
}

test('F7: no re-read happens when the confirming table could not be read; a readable one that lists a survivor is followed by exactly one re-read', T, async () => {
  const unreadable = await stuckCrashpad({ rewrite: (after, rows) => { if (after === 1) throw new Error('confirming read failed'); return rows; } });
  assert.equal(unreadable.out.ok, false);
  assert.equal(unreadable.out.error.confirmed, false);
  assert.deepEqual(unreadable.out.error.exiting, []);
  assert.equal(unreadable.readsAfterRun(), 1, 'only the failed confirming read: no re-read');
  const stays = await stuckCrashpad();
  assert.equal(stays.out.ok, false);
  assert.equal(stays.out.error.confirmed, true);
  assert.equal(stays.readsAfterRun(), 2, 'the confirming read and exactly one re-read');
});

test('F7: a stranger that took the pid of an exiting process is not that process (identity, never a bare pid)', T, async () => {
  const stranger = (after, rows, pid) => (after === 2 ? rows.concat([{ pid, ppid: 4, createdAt: '999' }]) : rows);
  let reused = null;
  const { out, crashpad } = await stuckCrashpad({ leaveAt: 21000, rewrite: (after, rows) => stranger(after, rows, reused), prepare: (world, made) => { reused = made.opener.crashpad.pid; } });
  assert.equal(out.ok, true, 'the same pid with another creation time is another process');
  assert.deepEqual(ids(out.value.exiting), [crashpad.pid]);
  assert.deepEqual(out.value.survivors, []);
});

test('F7: the re-read recomputes clean from the new table: an unverifiable process that is still listed keeps it unclean, one that left does not', T, async () => {
  for (const leaves of [false, true]) {
    let hidden = null;
    const { out, crashpad, world } = await stuckCrashpad({
      leaveAt: 21000,
      prepare: (w, made) => { hidden = w.os.put(777000, made.opener.root.pid, null); },
      rewrite: (after, rows) => rows,
    });
    const outcome = out.ok ? out.value : out.error;
    assert.deepEqual(ids(outcome.exiting), [crashpad.pid]);
    assert.equal(outcome.unverifiable.length, 1);
    assert.equal(outcome.unverifiable[0].stillListed, true, 'it stays listed in this world');
    assert.equal(out.ok, false);
    if (leaves) {
      world.os.exit(hidden.pid);
      assert.equal(world.os.table.has(hidden.pid), false);
    }
  }
  const world = new World();
  const made = await makeSession(world, { keep: 'crashpad' });
  const crashpad = made.opener.crashpad;
  world.os.table.get(crashpad.pid).immortal = true;
  const hidden = world.os.put(777000, made.opener.root.pid, null);
  world.behaviors.list = () => {
    if (world.clock.now() >= 21000) { world.os.exit(crashpad.pid); world.os.exit(hidden.pid); }
    return Promise.resolve(rowsOf(world));
  };
  const out = await closeOf(world, wrap(world, made, { terminateMs: 20000, listMs: 5000, exitSettleMs: 2000 }));
  assert.equal(out.ok, true, 'clean once the unverifiable process left too');
  assert.equal(out.value.unverifiable[0].stillListed, false);
  assert.deepEqual(ids(out.value.exiting), [crashpad.pid]);
});

test('F7: a refused identity that is still listed keeps the close unclean after the re-read', T, async () => {
  let renderer = null;
  const { out, crashpad } = await stuckCrashpad({
    leaveAt: 21000,
    session: {},
    options: { graceful: async () => {} },
    prepare: (world, made) => { renderer = made.opener.renderer; },
    rewrite: (after, rows) => (after === 0 ? rows.map((row) => (row.pid === renderer.pid ? { ...row, createdAt: null } : row)) : rows),
  });
  assert.equal(out.ok, false);
  assert.ok(out.error.refused.some((item) => item.pid === renderer.pid && item.reason === 'unverifiable'), JSON.stringify(out.error.refused));
  assert.deepEqual(ids(out.error.exiting), [crashpad.pid]);
  assert.equal(out.error.survivors.length, 0);
  assert.equal(out.error.clean, false);
});

test('the texts: the rejection says what is left, the graceful timeout and a graceful failure are described', T, async () => {
  const survivors = await stuckCrashpad();
  assert.match(survivors.out.error.message, /did not leave a clean state \(survivors 1, unconfirmed 0, unverifiable still listed 0, scratch removed\)/);
  assert.equal(survivors.out.error.gracefulError, null);
  const world = new World();
  const made = await makeSession(world, { context: 'fail' });
  const failed = await closeOf(world, wrap(world, made));
  assert.equal(failed.ok, true);
  assert.equal(failed.value.graceful, 'failed');
  assert.match(failed.value.gracefulError, /close failed/);
  assert.equal(failed.value.sealedError, failed.value.gracefulError);
  const other = new World();
  const stuck = await makeSession(other, { context: 'stuck' });
  const timeout = await closeOf(other, wrap(other, stuck, { gracefulMs: 1000 }));
  assert.equal(timeout.value.gracefulError, 'the graceful close did not settle within 1000 ms');
});

test('startSession: the outcome of a close during an expired or failed startup carries every field', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const handle = startSession(opener.open, { gracefulMs: 1000, settleMs: 3000, ...optionsFor(world, opener) });
  await quiesce();
  opener.buildTo('launch');
  assert.equal((await drive(world.clock, settle(handle.ready))).value.error.code, 'ERR_STARTUP_DEADLINE');
  const closed = (await drive(world.clock, settle(handle.close()))).value;
  assert.equal(closed.ok, true);
  for (const [key, expected] of [['startup', 'ERR_STARTUP_DEADLINE'], ['innerSettled', true], ['graceExpired', false], ['lateSession', 'none'], ['lateCloseError', null], ['clean', true]]) assert.deepEqual(closed.value[key], expected, key);
  const failed = new World();
  const boom = new FakeOpener(failed);
  const plain = startSession(boom.open, { gracefulMs: 1000, settleMs: 3000, ...optionsFor(failed, boom) });
  await quiesce();
  boom.fail(new Error('plain failure'));
  await quiesce();
  const outcome = (await drive(failed.clock, settle(plain.close()))).value;
  assert.deepEqual([outcome.value.startup, outcome.value.clean, outcome.value.confirmed, outcome.value.survivors], ['failed', true, true, []]);
});

test('the outcome fields are exact: no error text on a clean close, the sealed error of a forced termination never leaks into scratchError, an unsettled cleanup has no sealed error', T, async () => {
  const world = new World();
  const normal = await closeOf(world, wrap(world, await makeSession(world)));
  assert.equal(normal.ok, true);
  assert.deepEqual([normal.value.gracefulError, normal.value.sealedError, normal.value.scratchError], [null, null, null]);
  const forcedWorld = new World();
  const forced = await closeOf(forcedWorld, wrap(forcedWorld, await makeSession(forcedWorld, { context: 'stuck' }), { gracefulMs: 1000 }));
  assert.equal(forced.ok, true);
  assert.equal(forced.value.scratch, 'removed');
  assert.equal(forced.value.scratchError, null, 'a Target closed after the forced termination is not a scratch failure');
  assert.match(forced.value.sealedError, /Target closed/);
  const neverWorld = new World();
  const never = await closeOf(neverWorld, wrap(neverWorld, await makeSession(neverWorld, { rm: 'never' }), { settleMs: 3000 }));
  assert.equal(never.ok, false);
  assert.equal(never.error.name, 'CloseError');
  assert.equal(never.error.code, 'ERR_CLOSE_FAILED');
  assert.deepEqual([never.error.scratch, never.error.sealed, never.error.sealedError, never.error.scratchError], ['unconfirmed', 'unsettled', null, null]);
  assert.match(never.error.gracefulError, /the graceful close did not settle within \d+ ms/, 'the graceful close itself never settled: that is the timeout, not a failure');
});

test('F7: a close that leaves no survivor neither waits for exitSettleMs nor reads the table again', T, async () => {
  const elapsed = [];
  const reads = [];
  for (const exitSettleMs of [2000, 500000]) {
    const world = new World();
    const made = await makeSession(world);
    const startedAt = world.clock.now();
    const listsBefore = world.listCalls;
    const out = await closeOf(world, wrap(world, made, { terminateMs: 20000, listMs: 5000, exitSettleMs }));
    assert.equal(out.ok, true);
    assert.deepEqual(out.value.exiting, []);
    elapsed.push(world.clock.now() - startedAt);
    reads.push(world.listCalls - listsBefore);
  }
  assert.equal(elapsed[0], elapsed[1], 'the virtual time of a close without a survivor does not depend on exitSettleMs');
  assert.equal(reads[0], reads[1], 'and it reads the table the same number of times');
});

test('F7: a different process that carries the creation time of the exiting one is not the survivor (identity is pid AND creation time)', T, async () => {
  let created = null;
  const { out, crashpad } = await stuckCrashpad({
    leaveAt: 21000,
    prepare: (world, made) => { created = world.os.table.get(made.opener.crashpad.pid).createdAt; },
    rewrite: (after, rows) => (after === 2 ? rows.concat([{ pid: 777000, ppid: 4, createdAt: created }]) : rows),
  });
  assert.equal(out.ok, true);
  assert.deepEqual(ids(out.value.exiting), [crashpad.pid]);
  assert.deepEqual(out.value.survivors, []);
});

// The refused entries decide `clean` after the re-read only when they still block: an identity-mismatch is a stranger on a recycled pid (listed by definition, never ours),
// and a refused process that has left the table is no longer in the way.
test('F7: a refused identity-mismatch whose pid is listed (a stranger) does not block, and a refused unverifiable process that has left the table does not block', T, async () => {
  let renderer = null;
  const mismatch = await stuckCrashpad({
    leaveAt: 21000,
    options: { graceful: async () => {} },
    prepare: (world, made) => { renderer = made.opener.renderer; },
    rewrite: (after, rows) => rows.map((row) => (row.pid === renderer.pid ? { ...row, createdAt: '999999' } : row)),
  });
  const refused = (mismatch.out.ok ? mismatch.out.value : mismatch.out.error).refused;
  assert.ok(refused.some((item) => item.pid === renderer.pid && item.reason === 'identity-mismatch'), JSON.stringify(refused));
  assert.equal(mismatch.out.ok, true, JSON.stringify(mismatch.out.error && { survivors: mismatch.out.error.survivors, refused: mismatch.out.error.refused }));
  const left = await stuckCrashpad({
    leaveAt: 21000,
    options: { graceful: async () => {} },
    prepare: (world, made) => { renderer = made.opener.renderer; },
    rewrite: (after, rows) => (after === 0 ? rows.map((row) => (row.pid === renderer.pid ? { ...row, createdAt: null } : row)) : rows.filter((row) => row.pid !== renderer.pid)),
  });
  const refusedLeft = (left.out.ok ? left.out.value : left.out.error).refused;
  assert.ok(refusedLeft.some((item) => item.pid === renderer.pid && item.reason === 'unverifiable'), JSON.stringify(refusedLeft));
  assert.equal(left.out.ok, true, JSON.stringify(left.out.error && { survivors: left.out.error.survivors, refused: left.out.error.refused }));
});

test('K24: a graceful close that fails after the close could not even start its timer is not an unhandled rejection', T, async () => {
  const world = new World();
  const made = await makeSession(world);
  const clock = Object.create(world.clock, { setTimeout: { value: () => { throw new Error('timer refused'); } } });
  const wrapped = wrapSession(made.session, { clock, graceful: () => Promise.reject(new Error('graceful failed late')) });
  await assert.rejects(wrapped.close(), /timer refused/);
  for (let round = 0; round < 6; round += 1) await quiesce();
});

test('SR7: the clock option must provide setTimeout and clearTimeout, and REPORT_KEYS is frozen', T, async () => {
  const world = new World();
  const made = await makeSession(world);
  const noClear = { setTimeout: () => {} };
  const noSet = { clearTimeout: () => {} };
  for (const bad of [null, 0, 'x', {}, noClear, noSet]) assert.throws(() => wrapSession(made.session, { clock: bad }), (error) => error.code === 'ERR_INVALID_ARG' && /clock must provide setTimeout and clearTimeout/.test(error.message), String(bad));
  assert.equal(typeof wrapSession(made.session, { clock: world.clock }).close, 'function');
  assert.equal(typeof wrapSession(made.session, { clock: undefined }).close, 'function', 'no clock option means the clock of the owned tree');
  const { REPORT_KEYS } = loadImplementation().close;
  assert.equal(Object.isFrozen(REPORT_KEYS), true);
  assert.equal(REPORT_KEYS.length, 9);
});

test('a startup that fails with a foreign error that merely carries a settled property is "nothing to close", and that property is never awaited', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const handle = startSession(opener.open, { gracefulMs: 1000, settleMs: 3000, ...optionsFor(world, opener) });
  await quiesce();
  opener.fail(Object.assign(new Error('foreign failure'), { settled: new Promise(() => {}) }));
  await quiesce();
  const closed = await drive(world.clock, settle(handle.close()));
  assert.equal(closed.value.ok, true);
  assert.deepEqual([closed.value.value.startup, closed.value.value.clean], ['failed', true]);
});
