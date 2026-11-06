'use strict';

// U006 tests, session side: closing during an unfinished startup, a failed or expired startup, the convenience openers.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImplementation } = require('./u006-support-impl.cjs');
const { World, FakeOpener, drive, quiesce, settle, optionsFor } = require('./u005-support-world.cjs');
const u005 = require('./u005-support-impl.cjs');

const { startSession, openLessonSession, openLoopbackSession } = loadImplementation().session;
const T = { timeout: 20000 };
const ids = (items) => items.map((item) => item.pid).sort((a, b) => a - b);
const options = (world, opener, extra = {}) => ({ gracefulMs: 1000, settleMs: 3000, ...optionsFor(world, opener, extra) });
const outcome = (world, promise) => drive(world.clock, settle(promise)).then((result) => result.value);

test('invalid options are refused before anything is launched', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  assert.throws(() => startSession(opener.open, options(world, opener, { gracefulMs: 0 })), (error) => error.code === 'ERR_INVALID_ARG');
  const lesson = await outcome(world, openLessonSession('a.html', { ...options(world, opener, { settleMs: -1 }), opener: opener.open }));
  assert.equal(lesson.error.code, 'ERR_INVALID_ARG');
  const loopback = await outcome(world, openLoopbackSession('a.html', {}, { ...options(world, opener, { gracefulMs: Infinity }), opener: opener.open }));
  assert.equal(loopback.error.code, 'ERR_INVALID_ARG');
  assert.equal(opener.calls.length, 0);
});

test('a caller signal aborts the startup too, and the options reach the session close', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const controller = new AbortController();
  const handle = startSession(opener.open, options(world, opener, { signal: controller.signal, deadlineMs: 600000 }));
  await quiesce();
  opener.buildTo('launch');
  controller.abort();
  assert.equal((await outcome(world, handle.ready)).error.code, 'ERR_STARTUP_ABORTED');
  assert.deepEqual(opener.alive(), []);

  const other = new World();
  const second = new FakeOpener(other);
  let used = 0;
  const kept = startSession(second.open, options(other, second, { graceful: async () => { used += 1; } }));
  await quiesce();
  second.buildTo('launch');
  second.succeed();
  const session = (await outcome(other, kept.ready)).value;
  const closed = await outcome(other, session.close());
  assert.equal(used, 1);
  assert.equal(second.sessionCloses, 0);
  assert.equal(closed.value.graceful, 'closed');
  assert.deepEqual(ids(closed.value.terminated), ids(second.processes));
});

test('close() during an unfinished startup aborts it, ends its tree, frees the lock and says so', T, async () => {
  const world = new World();
  const lookAlike = world.foreign('msedge.exe', 5000);
  const opener = new FakeOpener(world);
  const lock = u005.loadImplementation().startup.createLock();
  const handle = startSession(opener.open, options(world, opener, { lock, deadlineMs: 600000 }));
  await quiesce();
  opener.buildTo('new page');
  const closed = await outcome(world, handle.close());
  assert.equal(closed.ok, true);
  assert.equal(closed.value.startup, 'ERR_STARTUP_ABORTED');
  assert.equal(closed.value.clean, true);
  assert.deepEqual(ids(closed.value.terminated), ids(opener.processes));
  const ready = await outcome(world, handle.ready);
  assert.equal(ready.error.code, 'ERR_STARTUP_ABORTED');
  assert.equal(world.has(lookAlike), true);
  assert.equal(handle.close(), handle.close());
  const next = new FakeOpener(world);
  const second = startSession(next.open, options(world, next, { lock }));
  await quiesce();
  next.buildTo('launch');
  next.succeed();
  assert.equal((await outcome(world, second.ready)).ok, true);
});

test('close() after the startup produced a session is the bounded close of that session', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const handle = startSession(opener.open, options(world, opener));
  await quiesce();
  opener.buildTo('navigation');
  opener.succeed();
  const session = (await outcome(world, handle.ready)).value;
  assert.equal(typeof session.close, 'function');
  assert.ok(session.owned);
  const closed = await outcome(world, handle.close());
  assert.equal(closed.ok, true);
  assert.equal(closed.value.clean, true);
  assert.equal(closed.value.graceful, 'closed');
  assert.equal(opener.sessionCloses, 1);
  assert.deepEqual(opener.alive(), []);
  assert.equal(session.close(), session.close());
});

test('close() on a startup that failed by itself has nothing to close and says so', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const handle = startSession(opener.open, options(world, opener));
  await quiesce();
  const boom = new Error('navigation failed');
  opener.fail(boom);
  assert.equal((await outcome(world, handle.ready)).error, boom);
  const closed = await outcome(world, handle.close());
  assert.equal(closed.ok, true);
  assert.equal(closed.value.startup, 'failed');
  assert.equal(closed.value.clean, true);
});

test('close() on a startup that expired waits for the watch and reports its final outcome', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const handle = startSession(opener.open, options(world, opener));
  await quiesce();
  opener.buildTo('launch');
  const ready = await outcome(world, handle.ready);
  assert.equal(ready.error.code, 'ERR_STARTUP_DEADLINE');
  const closed = await outcome(world, handle.close());
  assert.equal(closed.ok, true);
  assert.equal(closed.value.startup, 'ERR_STARTUP_DEADLINE');
  assert.equal(closed.value.innerSettled, true);
  assert.deepEqual(opener.alive(), []);

  const other = new World();
  const stuck = new FakeOpener(other);
  const hanging = startSession(stuck.open, options(other, stuck));
  await quiesce();
  const failed = await outcome(other, hanging.close());
  assert.equal(failed.ok, false);
  assert.equal(failed.error.code, 'ERR_CLOSE_FAILED');
  assert.equal(failed.error.startup, 'ERR_STARTUP_ABORTED');
  assert.equal(failed.error.clean, false);
});

test('the convenience openers pass their arguments to the injected opener and return a bounded session', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const server = { fake: 'server' };
  const lesson = openLessonSession('testing\\browser\\fixtures\\counter.html', { ...options(world, opener), opener: opener.open });
  await quiesce();
  opener.buildTo('launch');
  opener.succeed();
  const session = (await outcome(world, lesson)).value;
  assert.deepEqual(opener.calls[0], ['testing\\browser\\fixtures\\counter.html']);
  assert.ok(session.owned);
  assert.equal((await outcome(world, session.close())).ok, true);

  const other = new World();
  const spy = new FakeOpener(other);
  const loopback = openLoopbackSession('capability\\x\\index.html', server, { ...options(other, spy), opener: spy.open });
  await quiesce();
  spy.buildTo('launch');
  spy.succeed();
  assert.equal((await outcome(other, loopback)).ok, true);
  assert.deepEqual(spy.calls[0], ['capability\\x\\index.html', server]);
});
