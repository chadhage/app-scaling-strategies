'use strict';

// U005 startup tests, part 2: a phase probe that throws, a broken timer during the watch, an abandoned open, the default lock.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImplementation } = require('./u005-support-impl.cjs');
const { World, FakeOpener, drive, elapse, quiesce, settle, begin } = require('./u005-support-world.cjs');

const T = { timeout: 20000 };
const { StartupError } = loadImplementation().startup;
const expireError = async (world, start) => (await drive(world.clock, settle(start))).value.error;

test('an abort signal ends the owned tree like an expiry and rejects with ERR_STARTUP_ABORTED', T, async () => {
  const world = new World();
  const lookAlike = world.foreign('msedge.exe', 5000);
  const opener = new FakeOpener(world);
  const controller = new AbortController();
  const start = begin(world, opener, { signal: controller.signal, deadlineMs: 600000 });
  await quiesce();
  opener.buildTo('new page');
  controller.abort();
  const error = await expireError(world, start);
  assert.ok(error instanceof StartupError);
  assert.equal(error.code, 'ERR_STARTUP_ABORTED');
  assert.equal(error.phase, 'new page');
  assert.equal(error.clean, true);
  assert.deepEqual(error.terminated.map((item) => item.pid).sort(), opener.processes.map((item) => item.pid).sort());
  assert.deepEqual(opener.alive(), []);
  assert.equal(world.has(lookAlike), true);
  await drive(world.clock, error.settled);
  assert.equal(world.clock.pending(), 0);
});

test('a signal that is already aborted launches nothing and reads nothing', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const error = await expireError(world, begin(world, opener, { signal: AbortSignal.abort() }));
  assert.equal(error.code, 'ERR_STARTUP_ABORTED');
  assert.equal(error.clean, true);
  assert.equal(opener.calls.length, 0);
  assert.equal(world.listCalls, 0);
});

test('an abort after the session was returned changes nothing, and an invalid signal is refused up front', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const controller = new AbortController();
  const start = begin(world, opener, { signal: controller.signal });
  await quiesce();
  opener.buildTo('launch');
  opener.succeed();
  const session = (await drive(world.clock, settle(start))).value.value;
  controller.abort();
  await quiesce();
  assert.deepEqual(world.killRequests, []);
  assert.equal(opener.alive().length, opener.processes.length);
  assert.ok(session.owned);
  for (const bad of [{}, null, 'abort']) {
    const refused = await expireError(world, begin(world, new FakeOpener(world), { signal: bad }));
    assert.equal(refused.code, 'ERR_INVALID_ARG');
  }
});

test('a phase probe that throws cannot mask the cleanup: the phase is unknown', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const start = begin(world, opener, { getPhase: () => { throw new Error('probe broke'); } });
  await quiesce();
  opener.buildTo('launch');
  const error = await expireError(world, start);
  assert.equal(error.phase, 'unknown');
  assert.equal(error.clean, true);
  await drive(world.clock, error.settled);
});

test('a timer that breaks while watching ends the watch with an unclean final outcome and still frees the lock', T, async () => {
  const world = new World();
  const lock = loadImplementation().startup.createLock();
  const opener = new FakeOpener(world);
  const start = begin(world, opener, { lock });
  await quiesce();
  const error = await expireError(world, start);
  world.clock.sleep = () => Promise.reject(new Error('timer broke'));
  const final = (await drive(world.clock, error.settled)).value;
  assert.equal(final.clean, false);
  assert.equal(final.innerSettled, false);
  assert.ok(final.errors.some((item) => /timer broke/.test(item.message)));
  const next = new FakeOpener(world);
  const again = begin(world, next, { lock });
  await quiesce();
  next.buildTo('launch');
  next.succeed();
  assert.equal((await drive(world.clock, settle(again))).value.ok, true);
});

test('an open abandoned after the grace period has its late session closed, and only its own', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  opener.autoReject = false;
  const start = begin(world, opener);
  await quiesce();
  const error = await expireError(world, start);
  const final = (await drive(world.clock, error.settled)).value;
  assert.equal(final.graceExpired, true);
  assert.equal(opener.sessionCloses, 0);
  opener.succeed();
  await elapse(world.clock, 10);
  assert.equal(opener.sessionCloses, 1);
  assert.deepEqual(world.killRequests, []);
});

test('without a lock option the process-wide lock is used and released', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const start = begin(world, opener, { lock: undefined });
  await quiesce();
  opener.buildTo('launch');
  opener.succeed();
  assert.equal((await drive(world.clock, settle(start))).value.ok, true);
  const second = new FakeOpener(world);
  const again = begin(world, second, { lock: undefined });
  await quiesce();
  second.buildTo('launch');
  second.succeed();
  assert.equal((await drive(world.clock, settle(again))).value.ok, true);
});

test('a session without an owned root whose close also fails is refused and not clean', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  opener.closeError = new Error('scratch busy');
  const start = begin(world, opener);
  await quiesce();
  opener.succeed();
  const error = (await drive(world.clock, settle(start))).value.error;
  assert.equal(error.code, 'ERR_STARTUP_UNOWNED');
  assert.equal(error.clean, false);
  assert.equal(opener.sessionCloses, 1);
});
