'use strict';

// U006 fix tests, close side (rev-U005 findings F4, F5, F7 on U006): the options reach the tree and the clock, a failed startup nobody awaits is not an unhandled
// rejection, the worst case of the default budgets is one formula proven on the virtual clock, and a process that is still exiting when the confirming
// table is read is re-read once after a bounded settle and reported honestly as exiting (never as a survivor, never retried by name).

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImplementation } = require('./u006-support-impl.cjs');
const { makeSession, wrap, World, FakeOpener } = require('./u006-support-sealed.cjs');
const { drive, settle, quiesce, optionsFor } = require('./u005-support-world.cjs');
const { mutateEverything, deepFrozen } = require('./u006-support-walk.cjs');

const { wrapSession, CloseError, budgetsOf, durationsOf } = loadImplementation().close;
const { startSession } = loadImplementation().session;
const T = { timeout: 20000 };
const closeOf = async (world, wrapped) => (await drive(world.clock, settle(wrapped.close()))).value;
const ids = (items) => items.map((item) => item.pid).sort((a, b) => a - b);

test('K18: close() hands the tree the kill deadline as timeoutMs and the table deadline as listMs, not the other way round', T, async () => {
  const world = new World();
  const made = await makeSession(world);
  const seen = [];
  const original = made.session.owned.terminate.bind(made.session.owned);
  made.session.owned.terminate = (given) => { seen.push(given); return original(given); };
  const out = await closeOf(world, wrap(world, made, { terminateMs: 20000, listMs: 5000 }));
  assert.equal(out.ok, true);
  assert.deepEqual(seen, [{ timeoutMs: 20000, listMs: 5000 }]);
});

test('K23: the clock option is the clock of every timer the close sets', T, async () => {
  const world = new World();
  const made = await makeSession(world);
  const used = { set: 0, cleared: 0 };
  const clock = {
    now: () => world.clock.now(),
    setTimeout: (fn, ms) => { used.set += 1; return world.clock.setTimeout(fn, ms); },
    clearTimeout: (handle) => { used.cleared += 1; return world.clock.clearTimeout(handle); },
    sleep: (ms) => world.clock.sleep(ms),
  };
  const out = await closeOf(world, wrapSession(made.session, { gracefulMs: 1000, terminateMs: 20000, listMs: 5000, settleMs: 3000, clock }));
  assert.equal(out.ok, true);
  assert.ok(used.set >= 1 && used.cleared >= 1, 'the supplied clock was used');
});

test('L05: a failed startup that nobody awaits is not an unhandled rejection', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const handle = startSession(opener.open, { gracefulMs: 1000, settleMs: 3000, ...optionsFor(world, opener) });
  await quiesce();
  opener.fail(new Error('navigation failed'));
  for (let round = 0; round < 6; round += 1) await quiesce();
  const closed = await drive(world.clock, settle(handle.close()));
  assert.equal(closed.value.ok, true);
});

test('F5: the close budgets are one formula and a table that never answers rejects at exactly the stated bound', T, async () => {
  const defaults = budgetsOf({});
  assert.equal(defaults.sweepBoundMs, 2 * defaults.listMs + defaults.terminateMs);
  assert.equal(defaults.closeBoundMs, defaults.gracefulMs + defaults.sweepBoundMs + defaults.exitSettleMs + defaults.listMs + defaults.settleMs);
  assert.deepEqual(budgetsOf({ gracefulMs: 100, terminateMs: 300, listMs: 50, settleMs: 7, exitSettleMs: 9 }), { gracefulMs: 100, terminateMs: 300, listMs: 50, settleMs: 7, exitSettleMs: 9, sweepBoundMs: 400, closeBoundMs: 100 + 400 + 9 + 50 + 7 });
  for (const hungGraceful of [false, true]) {
    const world = new World();
    const made = await makeSession(world);
    world.behaviors.list = () => new Promise(() => {});
    const extra = hungGraceful ? { graceful: () => new Promise(() => {}) } : {};
    const wrapped = wrapSession(made.session, { clock: world.clock, ...extra });
    const started = world.clock.now();
    const out = await closeOf(world, wrapped);
    assert.equal(out.ok, false);
    assert.ok(out.error instanceof CloseError);
    assert.equal(out.error.confirmed, false);
    assert.equal(out.error.clean, false);
    const expected = defaults.sweepBoundMs + (hungGraceful ? defaults.gracefulMs + defaults.settleMs : 0);
    assert.equal(world.clock.now() - started, expected, `the close rejects at the stated bound (graceful hung: ${hungGraceful})`);
    assert.ok(world.clock.now() - started <= defaults.closeBoundMs);
  }
});

// The crashpad stays listed through the kill passes and the confirming read and leaves the table `leaveAt` ms into the (virtual) close.
async function exitingScenario(leaveAt, extra = {}) {
  const world = new World();
  const made = await makeSession(world, { keep: 'crashpad' });
  const crashpad = made.opener.crashpad;
  world.os.table.get(crashpad.pid).immortal = true;
  const reads = [];
  world.behaviors.list = () => {
    reads.push(world.clock.now());
    if (world.clock.now() >= leaveAt) world.os.exit(crashpad.pid);
    return world.defaultList();
  };
  const out = await closeOf(world, wrap(world, made, { terminateMs: 20000, listMs: 5000, exitSettleMs: 2000, ...extra }));
  return { world, made, crashpad, reads, out };
}

test('F7: a process that is still exiting at the confirming table is re-read once after a bounded settle and reported as exiting, not as a survivor', T, async () => {
  const { world, made, crashpad, out } = await exitingScenario(21000);
  assert.equal(out.ok, true, JSON.stringify(out.error && { survivors: out.error.survivors, message: out.error.message }));
  assert.equal(out.value.clean, true);
  assert.deepEqual(out.value.survivors, []);
  assert.deepEqual(ids(out.value.exiting), [crashpad.pid]);
  assert.ok(ids(out.value.terminated).includes(crashpad.pid), 'the exiting identity is counted as terminated');
  assert.ok(world.killRequests.length >= 1 && world.killRequests.every((request) => request.pid === crashpad.pid), 'every kill request names the identity, never a name or a marker');
  assert.deepEqual(made.opener.alive(), []);
});

test('F7: a process that never leaves stays a survivor after the single re-read, and the re-read sends no further kill', T, async () => {
  const { world, crashpad, reads, out } = await exitingScenario(Infinity);
  assert.equal(out.ok, false);
  assert.deepEqual(ids(out.error.survivors), [crashpad.pid]);
  assert.deepEqual(out.error.exiting, []);
  assert.equal(out.error.clean, false);
  assert.ok(reads[reads.length - 1] - reads[reads.length - 2] >= 2000, 'the last read came after the settle');
  const requestsAtEnd = world.killRequests.length;
  assert.equal(world.killRequests.filter((request) => request.pid === crashpad.pid).length, requestsAtEnd);
  const before = reads.length;
  assert.ok(before >= 3);
});

test('F7: a re-read that fails keeps the survivors, records the failure and never claims clean', T, async () => {
  const world = new World();
  const made = await makeSession(world, { keep: 'crashpad' });
  world.os.table.get(made.opener.crashpad.pid).immortal = true;
  world.behaviors.list = () => (world.clock.now() >= 21000 ? Promise.reject(new Error('table unreadable')) : world.defaultList());
  const out = await closeOf(world, wrap(world, made, { terminateMs: 20000, listMs: 5000, exitSettleMs: 2000 }));
  assert.equal(out.ok, false);
  assert.deepEqual(ids(out.error.survivors), [made.opener.crashpad.pid]);
  assert.deepEqual(out.error.exiting, []);
  assert.ok(out.error.errors.some((item) => /table unreadable/.test(item.message)));
});

test('F7: exitSettleMs is validated like every other duration', T, async () => {
  const world = new World();
  const made = await makeSession(world);
  for (const bad of [0, -1, NaN, 'x']) assert.throws(() => wrapSession(made.session, { exitSettleMs: bad }), (error) => error.code === 'ERR_INVALID_ARG');
});

// Self-review 5 (no shared mutable returns): ONE outcome object is the answer of every caller of the one shared close(), so it is a deep-frozen copy.
test('SR5: the outcome of a close is ONE deep-frozen value: nothing a caller does to it changes what the next caller of the shared close() receives', T, async () => {
  const world = new World();
  const made = await makeSession(world);
  const wrapped = wrap(world, made, { graceful: async () => {} });
  const first = await closeOf(world, wrapped);
  assert.equal(first.ok, true);
  assert.ok(first.value.terminated.length >= 1, 'the outcome has lists with content: the walker has something to change');
  const before = JSON.stringify(first.value);
  mutateEverything(first.value);
  const second = await closeOf(world, wrapped);
  assert.equal(second.value, first.value, 'the very same outcome');
  assert.equal(JSON.stringify(second.value), before, 'nothing a caller did is visible to the next caller');
  assert.equal(deepFrozen(first.value), true);
  const control = JSON.parse(before);
  mutateEverything(control);
  assert.notEqual(JSON.stringify(control), before, 'the walker does change an unfrozen copy (the check is not vacuous)');
});

test('SR5: the CloseError of an unclean close is frozen as well and shares nothing with the tree report it was built from', T, async () => {
  const world = new World();
  const made = await makeSession(world, { keep: 'crashpad' });
  world.os.table.get(made.opener.crashpad.pid).immortal = true;
  const wrapped = wrap(world, made, { terminateMs: 20000, listMs: 5000, exitSettleMs: 2000 });
  const first = await closeOf(world, wrapped);
  assert.equal(first.ok, false);
  assert.ok(first.error instanceof CloseError);
  assert.equal(first.error.survivors.length, 1);
  const before = JSON.stringify(first.error);
  mutateEverything(first.error);
  const second = await closeOf(world, wrapped);
  assert.equal(second.error, first.error, 'the shared rejection');
  assert.equal(JSON.stringify(second.error), before);
  assert.equal(deepFrozen(first.error), true);
  assert.equal(Object.isFrozen(first.error), true);
});

// Self-review 7 (hostile input): a typed refusal, never a TypeError, for options that are not an object and for an option whose getter throws; every option is read ONCE.
const OPTION_NAMES = ['gracefulMs', 'terminateMs', 'listMs', 'settleMs', 'exitSettleMs', 'graceful', 'clock'];
const refusal = (error) => error instanceof Error && error.code === 'ERR_INVALID_ARG';

test('SR7: options that are not an object are a typed refusal before anything runs, and a missing options argument means the defaults', T, async () => {
  const world = new World();
  const made = await makeSession(world);
  for (const bad of [null, 0, 42, 'x', true, [], Symbol('options')]) {
    assert.throws(() => wrapSession(made.session, bad), (error) => refusal(error) && /options must be an object/.test(error.message), String(typeof bad));
    assert.throws(() => budgetsOf(bad), refusal);
    assert.throws(() => durationsOf(bad), refusal);
  }
  const opener = new FakeOpener(world);
  for (const bad of [null, 'x', 7, []]) assert.throws(() => startSession(opener.open, bad), refusal);
  assert.equal(opener.calls.length, 0, 'nothing was launched');
  assert.equal(typeof wrapSession(made.session, undefined).close, 'function');
  assert.equal(budgetsOf(undefined).gracefulMs, budgetsOf({}).gracefulMs);
});

test('SR7: an option whose getter throws is a typed refusal that names the option', T, async () => {
  const world = new World();
  const made = await makeSession(world);
  for (const name of OPTION_NAMES) {
    const hostile = Object.defineProperty({}, name, { enumerable: true, get() { throw new Error(`getter of ${name} threw`); } });
    const named = (error) => refusal(error) && error.message.includes(`option ${name} cannot be read`) && error.message.includes(`getter of ${name} threw`);
    assert.throws(() => wrapSession(made.session, hostile), named, name);
    assert.throws(() => budgetsOf(hostile), named, name);
    assert.throws(() => durationsOf(hostile), named, name);
  }
  const thrower = { get gracefulMs() { throw 'a string was thrown'; } };
  assert.throws(() => wrapSession(made.session, thrower), (error) => refusal(error) && /a string was thrown/.test(error.message));
});

test('SR7: every close option is read exactly once, so a getter cannot pass the check and then deliver another value', T, async () => {
  const world = new World();
  const made = await makeSession(world);
  const reads = {};
  const counting = {};
  for (const name of OPTION_NAMES) Object.defineProperty(counting, name, { enumerable: true, get() { reads[name] = (reads[name] || 0) + 1; return undefined; } });
  wrapSession(made.session, counting);
  assert.deepEqual(reads, Object.fromEntries(OPTION_NAMES.map((name) => [name, 1])));
  let given = 0;
  let used = 0;
  const flipping = Object.defineProperty({}, 'graceful', { enumerable: true, get() { given += 1; return given === 1 ? async () => { used += 1; } : 'not a function'; } });
  const out = await closeOf(world, wrapSession(made.session, flipping));
  assert.equal(out.ok, true);
  assert.equal(given, 1, 'the graceful option was read once');
  assert.equal(used, 1, 'the function that passed the check is the one that ran');
  assert.equal(out.value.graceful, 'closed');
});
