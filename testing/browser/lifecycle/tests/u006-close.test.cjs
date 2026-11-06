'use strict';

// U006 tests: a close() that cannot hang. Fake sealed close (context.close, browser.close, scratch removal) over the U005 fake world.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImplementation } = require('./u006-support-impl.cjs');
const { makeSession, wrap, World } = require('./u006-support-sealed.cjs');
const { drive, settle } = require('./u005-support-world.cjs');

const { CloseError } = loadImplementation().close;
const T = { timeout: 20000 };
const ids = (items) => items.map((item) => item.pid).sort((a, b) => a - b);
const closeOf = async (world, wrapped) => (await drive(world.clock, settle(wrapped.close()))).value;
const ownedKeys = (made) => new Set(made.owned.recorded().map((entry) => `${entry.pid}:${entry.createdAt}`));

test('a normal close leaves nothing, kills nothing and removes the scratch once', T, async () => {
  const world = new World();
  const lookAlike = world.foreign();
  const made = await makeSession(world);
  const out = await closeOf(world, wrap(world, made));
  assert.equal(out.ok, true);
  assert.equal(out.value.graceful, 'closed');
  assert.equal(out.value.sealed, 'settled');
  assert.equal(out.value.scratch, 'removed');
  assert.equal(out.value.clean, true);
  assert.deepEqual(out.value.terminated, []);
  assert.equal(out.value.alreadyGone.length, made.opener.processes.length);
  assert.deepEqual(world.killRequests, []);
  assert.equal(made.sealed.calls.rm, 1);
  assert.equal(world.has(lookAlike), true);
  assert.equal(world.clock.pending(), 0);
});

test('a graceful close that succeeds but leaves an owned process behind still ends it, by identity', T, async () => {
  const world = new World();
  const lookAlike = world.foreign();
  const made = await makeSession(world, { keep: 'crashpad' });
  const out = await closeOf(world, wrap(world, made));
  assert.equal(out.ok, true);
  assert.equal(out.value.graceful, 'closed');
  assert.deepEqual(ids(out.value.terminated), [made.opener.crashpad.pid]);
  assert.equal(out.value.alreadyGone.length, made.opener.processes.length - 1);
  assert.equal(out.value.clean, true);
  assert.deepEqual(world.killRequests.map((item) => item.pid), [made.opener.crashpad.pid]);
  assert.deepEqual(made.opener.alive(), []);
  assert.equal(world.has(lookAlike), true);
});

for (const stuck of ['context', 'browser']) {
  test(`a stuck ${stuck}.close() is bounded, the owned tree is ended by identity, then the sealed cleanup still runs`, T, async () => {
    const world = new World();
    const lookAlike = world.foreign('msedge.exe', 5000);
    const owner = world.os.spawn(world.os.selfPid, { name: 'msedge.exe' });
    const made = await makeSession(world, { [stuck]: 'stuck' });
    const out = await closeOf(world, wrap(world, made));
    assert.equal(out.ok, true, JSON.stringify(out.error && out.error.message));
    assert.equal(out.value.graceful, 'timeout');
    assert.equal(out.value.sealed, 'settled');
    assert.equal(out.value.scratch, 'removed');
    assert.equal(out.value.clean, true);
    assert.deepEqual(ids(out.value.terminated), ids(made.opener.processes));
    assert.equal(made.sealed.calls.rm, 1);
    assert.deepEqual(made.opener.alive(), []);
    assert.equal(world.has(lookAlike), true);
    assert.equal(world.has(owner), true);
    const keys = ownedKeys(made);
    assert.ok(world.killRequests.length >= 1 && world.killRequests.every((item) => keys.has(`${item.pid}:${item.createdAt}`)));
    assert.ok(world.clock.t >= 1000);
    assert.equal(world.clock.pending(), 0);
  });
}

test('a failed scratch removal is reported, not hidden, and the tree is still reported gone', T, async () => {
  for (const modes of [{ rm: 'fail' }, { context: 'stuck', rm: 'fail' }, { rm: 'fail-syscall' }, { rm: 'fail-code' }]) {
    const world = new World();
    const made = await makeSession(world, modes);
    const out = await closeOf(world, wrap(world, made));
    assert.equal(out.ok, false);
    assert.ok(out.error instanceof CloseError);
    assert.equal(out.error.code, 'ERR_CLOSE_FAILED');
    assert.equal(out.error.scratch, 'failed');
    assert.match(out.error.scratchError, /EBUSY|operation failed/);
    assert.equal(out.error.clean, false);
    assert.equal(made.sealed.calls.rm, 1);
    assert.deepEqual(made.opener.alive(), []);
    assert.equal(out.error.terminated.length + out.error.alreadyGone.length, made.opener.processes.length);
  }
});

test('a sealed cleanup that never settles is reported as unconfirmed after the bounded wait', T, async () => {
  const world = new World();
  const made = await makeSession(world, { browser: 'never' });
  const out = await closeOf(world, wrap(world, made));
  assert.equal(out.ok, false);
  assert.equal(out.error.graceful, 'timeout');
  assert.equal(out.error.sealed, 'unsettled');
  assert.equal(out.error.scratch, 'unconfirmed');
  assert.equal(out.error.clean, false);
  assert.deepEqual(ids(out.error.terminated), ids(made.opener.processes));
  assert.ok(world.clock.t >= 1000 + 3000);
});

test('a never-settling graceful seam is bounded; the sealed close is never reached, so the scratch is unconfirmed', T, async () => {
  const world = new World();
  const made = await makeSession(world);
  const out = await closeOf(world, wrap(world, made, { graceful: () => new Promise(() => {}) }));
  assert.equal(out.error.graceful, 'timeout');
  assert.equal(out.error.scratch, 'unconfirmed');
  assert.equal(made.sealed.calls.close, 0);
  assert.deepEqual(ids(out.error.terminated), ids(made.opener.processes));
});

test('survivors, an access-denied kill and a lying kill adapter reject with a typed error that lists them', T, async () => {
  const world = new World();
  const made = await makeSession(world, { context: 'stuck' });
  world.os.table.get(made.opener.root.pid).immortal = true;
  world.os.table.get(made.opener.crashpad.pid).denied = true;
  const out = await closeOf(world, wrap(world, made, { terminateMs: 2000 }));
  assert.ok(out.error instanceof CloseError);
  assert.deepEqual(ids(out.error.survivors), ids([made.opener.root, made.opener.crashpad]));
  assert.deepEqual(ids(out.error.failed), [made.opener.crashpad.pid]);
  assert.equal(out.error.clean, false);
  assert.equal(ids(out.error.terminated).includes(made.opener.root.pid), false);
  const keys = ownedKeys(made);
  assert.ok(world.killRequests.every((item) => keys.has(`${item.pid}:${item.createdAt}`)));

  const liar = new World();
  const second = await makeSession(liar, { context: 'stuck' });
  liar.behaviors.kill = (identities) => identities.map(({ pid, createdAt }) => ({ pid, createdAt, outcome: 'killed' }));
  const lied = await closeOf(liar, wrap(liar, second, { terminateMs: 2000 }));
  assert.deepEqual(lied.error.terminated, []);
  assert.deepEqual(ids(lied.error.survivors), ids(second.opener.processes));
});

test('a close after the browser died does not hang, reports the tree already gone and lets the scratch removal run', T, async () => {
  const world = new World();
  const made = await makeSession(world, { context: 'dead' });
  made.opener.exitAll();
  const out = await closeOf(world, wrap(world, made));
  assert.equal(out.ok, true);
  assert.equal(out.value.graceful, 'failed');
  assert.equal(out.value.gracefulError, 'Target closed');
  assert.equal(out.value.alreadyGone.length, made.opener.processes.length);
  assert.equal(out.value.scratch, 'removed');
  assert.deepEqual(world.killRequests, []);
  assert.equal(made.sealed.calls.rm, 1);
});

test('a second close and concurrent closes share one promise and the first outcome, a rejection included', T, async () => {
  const world = new World();
  const made = await makeSession(world, { context: 'stuck' });
  const wrapped = wrap(world, made);
  const first = wrapped.close();
  const callers = [wrapped.close(), wrapped.close(), wrapped.close()];
  assert.ok(callers.every((promise) => promise === first));
  const value = await drive(world.clock, settle(first));
  const lists = world.listCalls;
  const kills = world.killRequests.length;
  assert.equal(value.value.ok, true);
  assert.equal(wrapped.close(), first);
  assert.deepEqual((await settle(wrapped.close())).value, value.value.value);
  assert.equal(world.listCalls, lists);
  assert.equal(world.killRequests.length, kills);
  assert.equal(made.sealed.calls.close, 1);

  const other = new World();
  const failing = await makeSession(other, { rm: 'fail' });
  const bad = wrap(other, failing);
  const a = bad.close();
  const b = bad.close();
  assert.equal(a, b);
  const outcome = await drive(other.clock, settle(a));
  assert.equal(outcome.value.ok, false);
  assert.equal((await settle(bad.close())).error, outcome.value.error);
  assert.equal(failing.sealed.calls.rm, 1);
});

test('hostile adapters cannot hang the close: a table that never answers and a kill that never settles', T, async () => {
  const world = new World();
  const made = await makeSession(world, { context: 'stuck' });
  world.behaviors.list = () => new Promise(() => {});
  const out = await closeOf(world, wrap(world, made));
  assert.equal(out.ok, false);
  assert.equal(out.error.clean, false);
  assert.equal(out.error.confirmed, false);
  assert.deepEqual(out.error.terminated, []);
  assert.equal(world.clock.pending(), 0);

  const other = new World();
  const second = await makeSession(other, { context: 'stuck' });
  other.behaviors.kill = () => new Promise(() => {});
  const stuckKill = await closeOf(other, wrap(other, second, { terminateMs: 2000 }));
  assert.equal(stuckKill.ok, false);
  assert.deepEqual(stuckKill.error.terminated, []);
  assert.deepEqual(ids(stuckKill.error.survivors), ids(second.opener.processes));
});

test('F9: invalid deadlines and sessions that do not come from the bounded startup are refused, timers are capped', T, async () => {
  const world = new World();
  const made = await makeSession(world);
  for (const name of ['gracefulMs', 'terminateMs', 'listMs', 'settleMs']) {
    for (const bad of [0, -1, NaN, Infinity, '5', null]) {
      assert.throws(() => wrap(world, made, { [name]: bad }), (error) => error.code === 'ERR_INVALID_ARG', `${name} ${String(bad)}`);
    }
  }
  const { wrapSession } = loadImplementation().close;
  for (const bad of ['x', 5, null]) assert.throws(() => wrap(world, made, { graceful: bad }), (error) => error.code === 'ERR_INVALID_ARG');
  for (const bad of [null, {}, { close() {} }, { close() {}, owned: {} }, { owned: made.owned }]) {
    assert.throws(() => wrapSession(bad, {}), (error) => error.code === 'ERR_INVALID_ARG');
  }
  const stuck = await makeSession(world, { context: 'stuck' });
  const closing = wrap(world, stuck, { gracefulMs: 2 ** 40 }).close();
  closing.catch(() => {});
  await drive(world.clock, settle(closing)).catch(() => {});
  assert.ok(world.clock.requested.includes(2147483647));
  assert.equal(Math.max(...world.clock.requested), 2147483647);
});
