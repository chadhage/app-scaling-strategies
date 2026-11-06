'use strict';

// U005 fix F2 (rev-U005 minor): an abort is honoured at EVERY await. The listener is attached before the first one, the wait for the
// per-process lock and the baseline table read are raced against it, and the signal is re-checked after each of them, so an abort during the
// baseline or while queued behind another startup is never lost and never waits for the lock holder. Controllable baseline and lock
// adapters on the virtual clock (hermetic: no wall clock, nothing real).

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImplementation } = require('./u005-support-impl.cjs');
const { World, FakeOpener, drive, quiesce, settle, begin } = require('./u005-support-world.cjs');

const { startup } = loadImplementation();
const T = { timeout: 20000 };
const outcome = (world, promise) => drive(world.clock, settle(promise)).then((result) => result.value);

// A table adapter whose FIRST read (the baseline) stays pending until the test releases it.
function heldBaseline(world) {
  const held = { release: null };
  world.behaviors.list = (call, n) => (n === 1 ? new Promise((resolve) => { held.release = () => resolve(world.defaultList()); }) : world.defaultList());
  return held;
}

test('F2: an abort while the baseline table is read rejects at once, never calls the opener and frees the lock', T, async () => {
  const world = new World();
  const held = heldBaseline(world);
  const opener = new FakeOpener(world);
  const lock = startup.createLock();
  const controller = new AbortController();
  const start = begin(world, opener, { signal: controller.signal, lock });
  await quiesce();
  assert.equal(typeof held.release, 'function', 'the baseline read is pending');
  const before = world.clock.now();
  controller.abort();
  const result = await outcome(world, start);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'ERR_STARTUP_ABORTED');
  assert.equal(result.error.clean, true);
  assert.equal(opener.calls.length, 0, 'nothing was launched');
  assert.equal(world.clock.now(), before, 'no virtual time passed: the abort did not wait for the baseline limit');
  const next = new FakeOpener(world);
  const second = begin(world, next, { lock });
  await quiesce();
  assert.equal(next.calls.length, 1, 'the lock was released');
  next.buildTo('launch');
  next.succeed();
  assert.equal((await outcome(world, second)).ok, true);
});

test('F2: an abort that arrives together with the baseline answer still launches nothing', T, async () => {
  const world = new World();
  const held = heldBaseline(world);
  const opener = new FakeOpener(world);
  const controller = new AbortController();
  const start = begin(world, opener, { signal: controller.signal });
  await quiesce();
  controller.abort();
  held.release();
  const result = await outcome(world, start);
  assert.equal(result.error.code, 'ERR_STARTUP_ABORTED');
  assert.equal(opener.calls.length, 0);
});

test('F2: an abort while queued behind another startup rejects at once, without waiting for the holder, and the lock chain survives', T, async () => {
  const world = new World();
  const lock = startup.createLock();
  const first = new FakeOpener(world);
  const second = new FakeOpener(world);
  const third = new FakeOpener(world);
  const a = begin(world, first, { lock });
  a.catch(() => {});
  await quiesce();
  const controller = new AbortController();
  const b = begin(world, second, { lock, signal: controller.signal });
  await quiesce();
  const listsBefore = world.listCalls;
  const timeBefore = world.clock.now();
  controller.abort();
  const rejected = await outcome(world, b);
  assert.equal(rejected.error.code, 'ERR_STARTUP_ABORTED');
  assert.equal(world.clock.now(), timeBefore, 'the holder deadline did not have to pass');
  assert.equal(world.listCalls, listsBefore, 'the queued startup read no table');
  assert.equal(second.calls.length, 0);
  const c = begin(world, third, { lock });
  const expired = (await outcome(world, a)).error;
  assert.equal(expired.code, 'ERR_STARTUP_DEADLINE');
  first.fail(new Error('gone'));
  await drive(world.clock, expired.settled);
  await quiesce();
  assert.equal(third.calls.length, 1, 'the abandoned queue entry passed the lock on');
  third.buildTo('launch');
  third.succeed();
  assert.equal((await outcome(world, c)).ok, true);
  assert.equal(second.calls.length, 0);
});

test('F2: the listener is attached before the first await and removed on every way out', T, async () => {
  for (const how of ['success', 'failure', 'abort-queued']) {
    const world = new World();
    const lock = startup.createLock();
    const added = [];
    const removed = [];
    const signal = { aborted: false, addEventListener: (type, fn) => added.push([type, fn]), removeEventListener: (type, fn) => removed.push([type, fn]) };
    if (how === 'abort-queued') await lock.acquire();
    const opener = new FakeOpener(world);
    const start = begin(world, opener, { signal, lock });
    assert.equal(added.length, 1, `${how}: attached synchronously, before any await`);
    assert.equal(added[0][0], 'abort');
    await quiesce();
    if (how === 'success') { opener.buildTo('launch'); opener.succeed(); }
    if (how === 'failure') opener.fail(new Error('boom'));
    if (how === 'abort-queued') { signal.aborted = true; added[0][1](); }
    const result = await outcome(world, start);
    assert.equal(result.ok, how === 'success', how);
    assert.deepEqual(removed, added, `${how}: the listener was removed again`);
  }
});

test('F2: an abort after the open started still ends the owned tree like an expiry (the window after the baseline is unchanged)', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const controller = new AbortController();
  const start = begin(world, opener, { signal: controller.signal, deadlineMs: 100000 });
  await quiesce();
  opener.buildTo('new page');
  controller.abort();
  const error = (await outcome(world, start)).error;
  assert.equal(error.code, 'ERR_STARTUP_ABORTED');
  assert.equal(opener.alive().length, 0);
  assert.equal(opener.calls.length, 1);
  await drive(world.clock, error.settled);
});
