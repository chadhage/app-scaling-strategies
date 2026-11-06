'use strict';

// U005 startup tests, flow side: success, failures inside the deadline, validation and caps, the per-process lock, option wiring.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImplementation } = require('./u005-support-impl.cjs');
const { World, FakeOpener, drive, quiesce, settle, begin, optionsFor } = require('./u005-support-world.cjs');

const { startup, owned } = loadImplementation();
const { StartupError } = startup;
const T = { timeout: 20000 };
const ids = (items) => items.map((item) => item.pid).sort((a, b) => a - b);
const outcome = (world, promise) => drive(world.clock, settle(promise)).then((result) => result.value);

test('a startup inside the deadline returns the session with the owned tree and kills nothing', T, async () => {
  const world = new World();
  const earlier = world.os.spawn(world.os.selfPid, { name: 'msedge.exe' });
  const opener = new FakeOpener(world);
  const start = begin(world, opener);
  await quiesce();
  opener.buildTo('navigation');
  opener.succeed();
  const result = await outcome(world, start);
  assert.equal(result.ok, true);
  const session = result.value;
  assert.ok(session.owned, 'the session carries the owned tree');
  assert.equal(typeof session.close, 'function');
  assert.equal(session.browserVersion, '156.0.0.0');
  assert.equal(typeof session.page.title, 'function');
  assert.deepEqual(session.owned.roots, [{ pid: opener.root.pid, createdAt: opener.root.createdAt }]);
  assert.deepEqual(ids(session.owned.recorded()), ids(opener.processes));
  assert.deepEqual(world.killRequests, []);
  assert.equal(world.has(earlier), true);
  assert.equal(world.clock.pending(), 0);
});

test('an open that fails inside the deadline with nothing left rethrows the original error unchanged', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const start = begin(world, opener);
  await quiesce();
  const boom = new Error('navigation failed');
  opener.fail(boom);
  const result = await outcome(world, start);
  assert.equal(result.error, boom);
  assert.equal(world.clock.pending(), 0);
});

test('an opener that throws synchronously is treated like a rejection and is still swept for leftovers', T, async () => {
  const world = new World();
  const boom = new Error('sync');
  const result = await outcome(world, startup.startBounded(() => { throw boom; }, optionsFor(world, new FakeOpener(world))));
  assert.equal(result.error, boom);
  assert.equal(world.listCalls, 2);
});

test('an open that fails but leaves a browser behind is swept by identity and reported', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  opener.autoReject = false;
  const start = begin(world, opener);
  await quiesce();
  opener.buildTo('launch');
  const boom = new Error('cleanup failed too');
  opener.fail(boom);
  const result = await outcome(world, start);
  assert.ok(result.error instanceof StartupError);
  assert.equal(result.error.code, 'ERR_STARTUP_FAILED');
  assert.equal(result.error.cause, boom);
  assert.equal(result.error.clean, true);
  assert.deepEqual(ids(result.error.terminated), ids(opener.processes));
  assert.deepEqual(opener.alive(), []);
});

test('a session without a new child process of the caller is closed and refused, never returned unowned', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const start = begin(world, opener);
  await quiesce();
  opener.succeed();
  const result = await outcome(world, start);
  assert.equal(result.error.code, 'ERR_STARTUP_UNOWNED');
  assert.equal(result.error.cause.code, 'ERR_NO_OWNED_ROOT');
  assert.equal(opener.sessionCloses, 1);
});

test('a session whose process table cannot be read after the open is closed and refused', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  let calls = 0;
  world.behaviors.list = () => { calls += 1; return calls === 2 ? Promise.reject(new Error('helper died')) : world.defaultList(); };
  const start = begin(world, opener);
  await quiesce();
  opener.buildTo('launch');
  opener.succeed();
  const result = await outcome(world, start);
  assert.equal(result.error.code, 'ERR_STARTUP_UNOWNED');
  assert.equal(opener.sessionCloses, 1);
  assert.deepEqual(opener.alive(), []);
});

test('a process table that cannot be read before the open fails closed before anything is launched', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  world.behaviors.list = () => new Promise(() => {});
  const lock = startup.createLock();
  const result = await outcome(world, begin(world, opener, { lock }));
  assert.equal(result.error.code, 'ERR_STARTUP_BASELINE');
  assert.equal(opener.calls.length, 0);
  world.behaviors.list = null;
  const next = new FakeOpener(world);
  const again = begin(world, next, { lock });
  await quiesce();
  next.buildTo('launch');
  next.succeed();
  assert.equal((await outcome(world, again)).ok, true);
});

test('F9 at startup: deadlines are validated before the lock or the opener are touched and capped at 2147483647 ms', T, async () => {
  for (const bad of [0, -5, NaN, Infinity, '5', undefined, null]) {
    const world = new World();
    const opener = new FakeOpener(world);
    const result = await outcome(world, begin(world, opener, { deadlineMs: bad }));
    assert.equal(result.error.code, 'ERR_INVALID_ARG', String(bad));
    assert.equal(opener.calls.length, 0);
  }
  for (const name of ['graceMs', 'pollMs', 'terminateMs', 'listMs']) {
    const world = new World();
    const result = await outcome(world, begin(world, new FakeOpener(world), { [name]: 0 }));
    assert.equal(result.error.code, 'ERR_INVALID_ARG', name);
  }
  const world = new World();
  const opener = new FakeOpener(world);
  const start = begin(world, opener, { deadlineMs: 2 ** 40 });
  await quiesce();
  assert.ok(world.clock.requested.includes(2147483647));
  assert.equal(Math.max(...world.clock.requested), 2147483647);
  opener.buildTo('launch');
  opener.succeed();
  assert.equal((await outcome(world, start)).ok, true);
});

test('two concurrent startups are serialised and each records only its own browser', T, async () => {
  const world = new World();
  const lock = startup.createLock();
  const first = new FakeOpener(world);
  const second = new FakeOpener(world);
  const a = begin(world, first, { lock });
  const b = begin(world, second, { lock });
  await quiesce();
  assert.equal(first.calls.length, 1);
  assert.equal(second.calls.length, 0);
  first.buildTo('navigation');
  first.succeed();
  const sessionA = (await outcome(world, a)).value;
  await quiesce();
  assert.equal(second.calls.length, 1);
  second.buildTo('navigation');
  second.succeed();
  const sessionB = (await outcome(world, b)).value;
  assert.deepEqual(ids(sessionA.owned.recorded()), ids(first.processes));
  assert.deepEqual(ids(sessionB.owned.recorded()), ids(second.processes));
  assert.deepEqual(world.killRequests, []);
});

test('the default lock is shared per process and a call after a timeout works once the first cleanup ended', T, async () => {
  const world = new World();
  const lock = startup.createLock();
  const first = new FakeOpener(world);
  const second = new FakeOpener(world);
  const a = begin(world, first, { lock });
  const b = begin(world, second, { lock });
  await quiesce();
  const error = (await outcome(world, a)).error;
  assert.equal(error.code, 'ERR_STARTUP_DEADLINE');
  await quiesce();
  assert.equal(second.calls.length, 0);
  first.fail(new Error('aborted'));
  await drive(world.clock, error.settled);
  await quiesce();
  assert.equal(second.calls.length, 1);
  second.buildTo('launch');
  second.succeed();
  assert.equal((await outcome(world, b)).ok, true);
  assert.equal(startup.createLock() === startup.createLock(), false);
  assert.equal(typeof startup.defaultLock().acquire, 'function');
  assert.equal(startup.defaultLock(), startup.defaultLock());
});

test('the opener is injectable for the lesson and the loopback entry points and the sealed helper is the default', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const server = { fake: 'server' };
  const lesson = startup.openLessonBounded('testing\\browser\\fixtures\\counter.html', { ...optionsFor(world, opener), opener: opener.open });
  await quiesce();
  opener.buildTo('launch');
  opener.succeed();
  assert.equal((await outcome(world, lesson)).ok, true);
  assert.deepEqual(opener.calls[0], ['testing\\browser\\fixtures\\counter.html']);

  const other = new World();
  const spy = new FakeOpener(other);
  const loopback = startup.openLoopbackBounded('capability\\x\\index.html', server, { ...optionsFor(other, spy), opener: spy.open });
  await quiesce();
  spy.buildTo('launch');
  spy.succeed();
  assert.equal((await outcome(other, loopback)).ok, true);
  assert.deepEqual(spy.calls[0], ['capability\\x\\index.html', server]);

  const worldA = new World();
  const viaLesson = new FakeOpener(worldA);
  const defaulted = startup.openLessonBounded('a.html', { ...optionsFor(worldA, viaLesson), loadSealed: () => ({ openIsolatedLesson: viaLesson.open }) });
  await quiesce();
  viaLesson.buildTo('launch');
  viaLesson.succeed();
  assert.equal((await outcome(worldA, defaulted)).ok, true);
  const worldB = new World();
  const viaLoopback = new FakeOpener(worldB);
  const defaultedLoopback = startup.openLoopbackBounded('b.html', server, { ...optionsFor(worldB, viaLoopback), loadSealed: () => ({ openIsolatedLoopback: viaLoopback.open }) });
  await quiesce();
  viaLoopback.buildTo('launch');
  viaLoopback.succeed();
  assert.equal((await outcome(worldB, defaultedLoopback)).ok, true);
  assert.deepEqual(viaLoopback.calls[0], ['b.html', server]);
});

test('the phase is unknown when the opener cannot report one, and the error shape is stable', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const start = begin(world, opener, { getPhase: undefined });
  await quiesce();
  opener.buildTo('launch');
  const error = (await outcome(world, start)).error;
  assert.equal(error.phase, 'unknown');
  for (const key of ['code', 'deadlineMs', 'phase', 'clean', 'watching', 'terminated', 'alreadyGone', 'refused', 'survivors', 'failed', 'unverifiable', 'unconfirmed', 'errors', 'settled']) {
    assert.ok(key in error, key);
  }
  assert.ok(error instanceof Error);
  assert.equal(typeof error.message, 'string');
  await drive(world.clock, error.settled);
  assert.ok(owned.MAX_TIMER_MS);
});
