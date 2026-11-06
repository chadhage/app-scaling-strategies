'use strict';

// U005 fix F5 (test strength), startup.cjs side: the survivors of the systematic mutation run over startup.cjs, each pinned by a named test below.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImplementation } = require('./u005-support-impl.cjs');
const { World, FakeOpener, drive, quiesce, elapse, settle, begin, optionsFor } = require('./u005-support-world.cjs');

const { startup } = loadImplementation();
const { StartupError } = startup;
const T = { timeout: 20000 };
const outcome = (world, promise) => drive(world.clock, settle(promise)).then((result) => result.value);
const LISTS = ['terminated', 'alreadyGone', 'refused', 'survivors', 'failed', 'unverifiable', 'unconfirmed', 'errors'];

function heldBaseline(world) {
  const held = { release: null, fail: null };
  world.behaviors.list = (call, n) => (n === 1 ? new Promise((resolve, reject) => { held.release = () => resolve(world.defaultList()); held.fail = (error) => reject(error); }) : world.defaultList());
  return held;
}

test('StartupError: a bare error is not clean and carries empty lists, every detail is carried over and a watched open is never clean', T, () => {
  const bare = new StartupError('ERR_X', 'm');
  assert.deepEqual([bare.code, bare.name, bare.deadlineMs, bare.phase, bare.watching, bare.settled, bare.clean, bare.confirmed], ['ERR_X', 'StartupError', null, 'unknown', false, null, false, false]);
  for (const key of LISTS) assert.deepEqual(bare[key], [], key);
  assert.equal(bare.cause, undefined);
  const cause = new Error('c');
  const settled = Promise.resolve();
  const report = { confirmed: true, clean: true, terminated: [{ pid: 1, createdAt: '1' }], alreadyGone: [], refused: [], survivors: [], failed: [], unverifiable: [], unconfirmed: [], errors: [] };
  const full = new StartupError('ERR_Y', 'n', { cause, deadlineMs: 5, phase: 'new page', watching: false, settled, report });
  assert.deepEqual([full.cause, full.deadlineMs, full.phase, full.settled, full.clean, full.confirmed], [cause, 5, 'new page', settled, true, true]);
  assert.deepEqual(full.terminated, report.terminated);
  assert.equal(new StartupError('ERR_Z', 'n', { report, watching: true }).clean, false);
});

test('without adapters the startup builds guarded adapters from adapterOptions, and the clock option beats the adapters clock', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const start = startup.startBounded(opener.open, { deadlineMs: 1000, graceMs: 5000, pollMs: 100, terminateMs: 20000, listMs: 5000, lock: startup.createLock(), adapterOptions: { inner: world.inner, clock: world.clock, selfPid: world.os.selfPid } });
  await quiesce();
  opener.buildTo('launch');
  opener.succeed();
  assert.equal((await outcome(world, start)).ok, true);

  const other = new World();
  const second = new FakeOpener(other);
  const used = { set: 0 };
  const clock = { now: () => other.clock.now(), setTimeout: (fn, ms) => { used.set += 1; return other.clock.setTimeout(fn, ms); }, clearTimeout: (handle) => other.clock.clearTimeout(handle), sleep: (ms) => other.clock.sleep(ms) };
  const pending = begin(other, second, { clock });
  await quiesce();
  second.buildTo('launch');
  second.succeed();
  assert.equal((await outcome(other, pending)).ok, true);
  assert.ok(used.set >= 1, 'the supplied clock set the deadline timer');
});

test('the poll interval defaults to 250 ms', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const error = (await outcome(world, begin(world, opener, { pollMs: undefined, graceMs: 1000 }))).error;
  await drive(world.clock, error.settled);
  assert.ok(world.clock.requested.includes(250));
});

test('the watch: a settled open ends it at once without grace expiry, an unclean sweep keeps the final outcome unclean, a broken adapter is listed with its code', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const error = (await outcome(world, begin(world, opener, { graceMs: 5000 }))).error;
  await elapse(world.clock, 300);
  opener.fail(new Error('late failure'));
  const final = (await drive(world.clock, error.settled)).value;
  assert.equal(final.graceExpired, false);
  assert.equal(final.innerSettled, true);
  assert.ok(world.clock.now() < 1000 + 2000, 'the watch did not run on to the end of the grace period');
  assert.equal(final.clean, true);

  const stubborn = new World();
  const holding = new FakeOpener(stubborn);
  const rejected = (await outcome(stubborn, begin(stubborn, holding, { graceMs: 5000 }))).error;
  holding.buildTo('launch');
  stubborn.os.table.get(holding.root.pid).immortal = true;
  holding.autoReject = false;
  holding.fail(new Error('settled, but a process cannot be ended'));
  const unclean = (await drive(stubborn.clock, rejected.settled)).value;
  assert.equal(unclean.innerSettled, true);
  assert.ok(unclean.survivors.length >= 1);
  assert.equal(unclean.clean, false, 'a settled open does not make a sweep with survivors clean');

  for (const [thrown, expected] of [[new Error('sleep broke'), 'ERR_ADAPTER'], [Object.assign(new Error('x'), { code: 'ERR_CUSTOM' }), 'ERR_CUSTOM']]) {
    const broken = new World();
    const adapters = broken.adapters();
    adapters.sleep = async () => { throw thrown; };
    const pending = new FakeOpener(broken);
    const first = (await outcome(broken, begin(broken, pending, { adapters }))).error;
    const result = (await drive(broken.clock, first.settled)).value;
    assert.ok(result.errors.some((item) => item.code === expected && item.message === thrown.message), expected);
    assert.equal(result.clean, false);
  }
});

test('the messages tell an abort from a deadline, and an open that finished in the same tick as the abort is still watched and its late session closed', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const deadline = (await outcome(world, begin(world, opener, {}))).error;
  assert.match(deadline.message, /did not open within 1000 ms \(phase: before launch\)/);
  assert.equal(deadline.code, 'ERR_STARTUP_DEADLINE');

  const other = new World();
  const aborting = new FakeOpener(other);
  const controller = new AbortController();
  const start = begin(other, aborting, { signal: controller.signal, deadlineMs: 600000 });
  await quiesce();
  aborting.buildTo('launch');
  aborting.succeed();
  controller.abort();
  const error = (await outcome(other, start)).error;
  assert.equal(error.code, 'ERR_STARTUP_ABORTED');
  assert.match(error.message, /was aborted \(phase: launch\)/);
  assert.equal(error.watching, true, 'the open had settled with a session, so the watch still has a session to close');
  const final = (await drive(other.clock, error.settled)).value;
  assert.equal(final.lateSession, 'closed');
  assert.equal(aborting.sessionCloses, 1);
});

test('a session without a new child process is refused clean when its close worked; a failed open that left an unreadable process is a failed startup', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const start = begin(world, opener);
  await quiesce();
  opener.succeed();
  const refused = (await outcome(world, start)).error;
  assert.equal(refused.code, 'ERR_STARTUP_UNOWNED');
  assert.equal(refused.clean, true);
  assert.equal(opener.sessionCloses, 1);

  const left = new World();
  const failing = new FakeOpener(left);
  const pending = begin(left, failing);
  await quiesce();
  const stray = left.os.put(2000, left.os.selfPid, null);
  let reads = 0;
  left.behaviors.list = () => {
    reads += 1;
    const rows = [...left.os.table.values()].map(({ pid, ppid, createdAt }) => ({ pid, ppid, createdAt }));
    if (reads === 1) left.os.exit(stray.pid);
    return Promise.resolve(rows);
  };
  failing.fail(new Error('the open failed'));
  const error = (await outcome(left, pending)).error;
  assert.equal(error.code, 'ERR_STARTUP_FAILED', 'an unreadable process was seen, so the failure is not rethrown as if nothing happened');
  assert.equal(error.cause.message, 'the open failed');
});

test('a plain error of the open frees the lock for the next startup', T, async () => {
  const world = new World();
  const lock = startup.createLock();
  const first = new FakeOpener(world);
  const second = new FakeOpener(world);
  const a = begin(world, first, { lock });
  const b = begin(world, second, { lock });
  await quiesce();
  first.fail(new Error('plain'));
  assert.equal((await outcome(world, a)).error.message, 'plain');
  await quiesce();
  assert.equal(second.calls.length, 1, 'the second startup got the lock');
  second.buildTo('launch');
  second.succeed();
  assert.equal((await outcome(world, b)).ok, true);
});

test('without an injected opener the sealed helper is the default (loaded through require) and receives the path or the server', T, async () => {
  const sealed = require.resolve('../../isolated.cjs');
  const previous = require.cache[sealed];
  const calls = [];
  const fake = {
    openIsolatedLesson: (relative) => { calls.push(['lesson', relative]); return Promise.reject(Object.assign(new Error('fake sealed lesson'), { code: 'ERR_FAKE_LESSON' })); },
    openIsolatedLoopback: (relative, server) => { calls.push(['loopback', relative, server]); return Promise.reject(Object.assign(new Error('fake sealed loopback'), { code: 'ERR_FAKE_LOOPBACK' })); },
  };
  require.cache[sealed] = { id: sealed, filename: sealed, loaded: true, exports: fake };
  try {
    const world = new World();
    const lesson = await outcome(world, startup.openLessonBounded('capability\\C009\\index.html', optionsFor(world, new FakeOpener(world))));
    assert.equal(lesson.error.code, 'ERR_FAKE_LESSON');
    const other = new World();
    const server = { fake: 'server' };
    const loopback = await outcome(other, startup.openLoopbackBounded('capability\\C009\\index.html', server, optionsFor(other, new FakeOpener(other))));
    assert.equal(loopback.error.code, 'ERR_FAKE_LOOPBACK');
    assert.deepEqual(calls, [['lesson', 'capability\\C009\\index.html'], ['loopback', 'capability\\C009\\index.html', server]]);
  } finally {
    if (previous) require.cache[sealed] = previous;
    else delete require.cache[sealed];
  }
});

test('the abort listener is added once and a signal that is already aborted does not wait for the lock holder', T, async () => {
  const world = new World();
  const seen = [];
  const signal = { aborted: false, addEventListener: (type, fn, opts) => seen.push([type, opts]), removeEventListener: () => {} };
  const opener = new FakeOpener(world);
  const start = begin(world, opener, { signal });
  assert.deepEqual(seen, [['abort', { once: true }]]);
  await quiesce();
  opener.buildTo('launch');
  opener.succeed();
  assert.equal((await outcome(world, start)).ok, true);

  const busy = new World();
  const lock = startup.createLock();
  await lock.acquire();
  const controller = new AbortController();
  controller.abort();
  const before = busy.clock.now();
  const rejected = await outcome(busy, begin(busy, new FakeOpener(busy), { lock, signal: controller.signal }));
  assert.equal(rejected.error.code, 'ERR_STARTUP_ABORTED');
  assert.equal(busy.clock.now(), before);
  assert.equal(busy.listCalls, 0);
});

test('an abort that arrives right after the baseline answer is still honoured, and a baseline that fails after the abort is not an unhandled rejection', T, async () => {
  const world = new World();
  const held = heldBaseline(world);
  const opener = new FakeOpener(world);
  const controller = new AbortController();
  const start = begin(world, opener, { signal: controller.signal });
  await quiesce();
  held.release();
  controller.abort();
  assert.equal((await outcome(world, start)).error.code, 'ERR_STARTUP_ABORTED');
  assert.equal(opener.calls.length, 0);

  const failing = new World();
  const late = heldBaseline(failing);
  const second = new FakeOpener(failing);
  const stop = new AbortController();
  const pending = begin(failing, second, { signal: stop.signal });
  await quiesce();
  stop.abort();
  assert.equal((await outcome(failing, pending)).error.code, 'ERR_STARTUP_ABORTED');
  late.fail(new Error('the abandoned baseline read failed later'));
  for (let round = 0; round < 6; round += 1) await quiesce();
});

test('StartupError carries an own cause property only when a cause was given', T, () => {
  assert.equal(Object.hasOwn(new StartupError('ERR_X', 'm'), 'cause'), false);
  assert.equal(Object.hasOwn(new StartupError('ERR_X', 'm', { cause: new Error('c') }), 'cause'), true);
});

test('an error inside the watch loop makes the final report unclean even when the open has settled by then, and the error is carried', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const guarded = world.adapters();
  const broken = { ...guarded, sleep: async () => { opener.fail(new Error('settled while the watch slept')); throw new Error('the sleep adapter broke'); } };
  const error = (await outcome(world, begin(world, opener, { adapters: broken }))).error;
  assert.equal(error.code, 'ERR_STARTUP_DEADLINE');
  const final = (await drive(world.clock, error.settled)).value;
  assert.equal(final.innerSettled, true);
  assert.equal(final.clean, false);
  assert.ok(final.errors.some((item) => item.message === 'the sleep adapter broke'), JSON.stringify(final.errors));
});

test('an open that settles during the first poll sleep costs no poll sweep: three table reads in all', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const error = (await outcome(world, begin(world, opener, { graceMs: 5000 }))).error;
  opener.fail(new Error('settled during the sleep'));
  const final = (await drive(world.clock, error.settled)).value;
  assert.equal(final.innerSettled, true);
  assert.equal(world.listCalls, 3, 'the baseline, the sweep of the rejection and the final sweep');
});

test('an unowned session with an unreadable table is refused UNCLEAN, a failed open with an unclean sweep is a failed startup, an unreadable baseline is a clean rejection', T, async () => {
  const unreadableAfterBaseline = (world) => {
    let reads = 0;
    world.behaviors.list = () => { reads += 1; return reads === 1 ? world.defaultList() : Promise.reject(new Error('table gone')); };
  };
  const world = new World();
  const opener = new FakeOpener(world);
  unreadableAfterBaseline(world);
  const start = begin(world, opener);
  await quiesce();
  opener.succeed();
  const unowned = (await outcome(world, start)).error;
  assert.equal(unowned.code, 'ERR_STARTUP_UNOWNED');
  assert.equal(unowned.clean, false);

  const other = new World();
  const failing = new FakeOpener(other);
  unreadableAfterBaseline(other);
  const pending = begin(other, failing);
  await quiesce();
  failing.fail(new Error('the open failed'));
  const failed = (await outcome(other, pending)).error;
  assert.equal(failed.code, 'ERR_STARTUP_FAILED');
  assert.equal(failed.cause.message, 'the open failed');

  const none = new World();
  const never = new FakeOpener(none);
  none.behaviors.list = () => Promise.reject(new Error('no table'));
  const baseline = (await outcome(none, begin(none, never))).error;
  assert.equal(baseline.code, 'ERR_STARTUP_BASELINE');
  assert.equal(baseline.clean, true);
  assert.equal(never.calls.length, 0);
});

test('the abort signal is re-checked after the lock and after the baseline, and an event that leaves signal.aborted false is still an abort', T, async () => {
  const idle = () => ({ aborted: false, addEventListener() {}, removeEventListener() {} });
  const lockWorld = new World();
  const lockOpener = new FakeOpener(lockWorld);
  const flipping = idle();
  const base = startup.createLock();
  const afterLock = (await outcome(lockWorld, begin(lockWorld, lockOpener, { signal: flipping, lock: { acquire: async () => { flipping.aborted = true; return base.acquire(); } } }))).error;
  assert.equal(afterLock.code, 'ERR_STARTUP_ABORTED');
  assert.match(afterLock.message, /before it started/);
  assert.equal(lockOpener.calls.length, 0);

  const baselineWorld = new World();
  const baselineOpener = new FakeOpener(baselineWorld);
  const quiet = idle();
  baselineWorld.behaviors.list = () => { quiet.aborted = true; return baselineWorld.defaultList(); };
  const afterBaseline = (await outcome(baselineWorld, begin(baselineWorld, baselineOpener, { signal: quiet }))).error;
  assert.equal(afterBaseline.code, 'ERR_STARTUP_ABORTED');
  assert.match(afterBaseline.message, /while the baseline was read/);
  assert.equal(baselineOpener.calls.length, 0);

  const eventWorld = new World();
  const eventOpener = new FakeOpener(eventWorld);
  let fire = null;
  heldBaseline(eventWorld);
  const eventOnly = { aborted: false, addEventListener: (type, fn) => { fire = fn; }, removeEventListener() {} };
  const pending = begin(eventWorld, eventOpener, { signal: eventOnly });
  await quiesce();
  fire();
  const afterEvent = (await outcome(eventWorld, pending)).error;
  assert.equal(afterEvent.code, 'ERR_STARTUP_ABORTED');
  assert.match(afterEvent.message, /while the baseline was read/);
  assert.equal(eventOpener.calls.length, 0);
});
