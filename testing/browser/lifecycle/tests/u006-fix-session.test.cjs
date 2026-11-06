'use strict';

// U006 fix tests, session side (rev-U005 findings F1, F2, F3 on U006): two live sessions through openLessonSession, close() during the startup
// (the abort must not be lost during the baseline read or while queued behind another startup), and the real tests' own cleanup discipline.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadImplementation } = require('./u006-support-impl.cjs');
const { World, FakeOpener, drive, quiesce, settle, optionsFor } = require('./u005-support-world.cjs');
const { mutateEverything, deepFrozen } = require('./u006-support-walk.cjs');
const u005 = require('./u005-support-impl.cjs');

const { startSession, openLessonSession } = loadImplementation().session;
const T = { timeout: 20000 };
const options = (world, opener, extra = {}) => ({ gracefulMs: 1000, settleMs: 3000, ...optionsFor(world, opener, extra) });
const outcome = (world, promise) => drive(world.clock, settle(promise)).then((result) => result.value);
const intact = (entry) => entry.opener.alive().length === entry.opener.processes.length;

async function openOne(world, extra = {}) {
  const opener = new FakeOpener(world);
  const pending = openLessonSession('a.html', { ...options(world, opener, extra), opener: opener.open });
  await quiesce();
  opener.buildTo('navigation');
  opener.succeed();
  const result = await outcome(world, pending);
  assert.equal(result.ok, true, 'the session opens');
  return { opener, session: result.value };
}

for (const order of [['first', 'second'], ['second', 'first']]) {
  test(`F1: two live sessions opened through openLessonSession, closed ${order.join(' then ')}: each close ends only its own browser`, T, async () => {
    const world = new World();
    const entries = { first: await openOne(world), second: await openOne(world) };
    const [early, late] = order;
    const closed = await outcome(world, entries[early].session.close());
    assert.equal(closed.ok, true, 'the close of the first resolves');
    assert.equal(closed.value.clean, true);
    assert.equal(entries[early].opener.alive().length, 0);
    assert.equal(intact(entries[late]), true, 'the browser of the other session survives');
    assert.deepEqual(world.killRequests, [], 'a clean graceful close sends no kill request, in particular none for the other session');
    assert.equal(entries[early].session.close(), entries[early].session.close(), 'a repeated close shares one promise');
    assert.equal(intact(entries[late]), true, 'the repeated close ended nothing more');
    const last = await outcome(world, entries[late].session.close());
    assert.equal(last.ok, true);
    assert.equal(entries[late].opener.alive().length, 0);
  });
}

test('F1: a graceful close that leaves its own tree behind ends that tree by identity and never the browser of another live session', T, async () => {
  const world = new World();
  const first = await openOne(world, { graceful: async () => {} });
  const second = await openOne(world);
  const closed = await outcome(world, first.session.close());
  assert.equal(closed.ok, true);
  assert.equal(closed.value.clean, true);
  assert.equal(first.opener.alive().length, 0);
  assert.equal(intact(second), true);
  assert.ok(world.killRequests.length >= 1 && world.killRequests.every((request) => first.opener.processes.some((item) => item.pid === request.pid)), 'every kill request names the first tree');
});

// A table adapter whose FIRST read (the baseline of the startup) stays pending until the test releases it.
function heldBaseline(world) {
  const held = { release: null };
  world.behaviors.list = (call, n) => (n === 1 ? new Promise((resolve) => { held.release = () => resolve(world.defaultList()); }) : world.defaultList());
  return held;
}

test('F2: close() during the baseline read ends the startup at once: nothing is launched and no virtual time passes', T, async () => {
  const world = new World();
  const held = heldBaseline(world);
  const opener = new FakeOpener(world);
  const lock = u005.loadImplementation().startup.createLock();
  const handle = startSession(opener.open, options(world, opener, { lock, deadlineMs: 600000 }));
  await quiesce();
  assert.equal(typeof held.release, 'function', 'the baseline read is pending');
  const before = world.clock.now();
  const closed = await outcome(world, handle.close());
  assert.equal(closed.ok, true, JSON.stringify(closed.error && closed.error.message));
  assert.equal(closed.value.startup, 'ERR_STARTUP_ABORTED');
  for (const key of ['innerSettled', 'graceExpired', 'lateSession', 'lateCloseError']) assert.equal(key in closed.value, false, `${key} belongs to the outcome of a watched expiry only`);
  assert.equal(closed.value.clean, true);
  assert.equal(opener.calls.length, 0, 'the opener was never called');
  assert.equal(world.clock.now(), before, 'close() did not wait for the baseline read or for the open');
  assert.equal((await outcome(world, handle.ready)).error.code, 'ERR_STARTUP_ABORTED');
  const next = new FakeOpener(world);
  const second = startSession(next.open, options(world, next, { lock }));
  await quiesce();
  assert.equal(next.calls.length, 1, 'the lock was released');
  next.buildTo('launch');
  next.succeed();
  assert.equal((await outcome(world, second.ready)).ok, true);
});

test('F2: close() while the startup is queued behind another startup does not wait for the lock holder', T, async () => {
  const world = new World();
  const lock = u005.loadImplementation().startup.createLock();
  const holder = new FakeOpener(world);
  const queued = new FakeOpener(world);
  const first = startSession(holder.open, options(world, holder, { lock, deadlineMs: 600000 }));
  first.ready.catch(() => {});
  await quiesce();
  const second = startSession(queued.open, options(world, queued, { lock, deadlineMs: 600000 }));
  await quiesce();
  const listsBefore = world.listCalls;
  const before = world.clock.now();
  const closed = await outcome(world, second.close());
  assert.equal(closed.ok, true);
  assert.equal(closed.value.startup, 'ERR_STARTUP_ABORTED');
  assert.equal(world.clock.now(), before, 'the holder was not waited for');
  assert.equal(world.listCalls, listsBefore, 'the queued startup read no table');
  assert.equal(queued.calls.length, 0);
  const aborted = first.close();
  await outcome(world, aborted);
});

// The real tests of U006 (tests\u006-real.test.cjs) are checked as source text: a real session that is not closed in a finally block leaks a live browser and a
// scratch directory when an assertion fails, and an assertion that EVERY recorded process is alive is flaky (short-lived Chromium utility processes exit on their own).
const realSource = () => fs.readFileSync(process.env.U006_REAL_TEST_SOURCE ? path.resolve(__dirname, '..', '..', '..', '..', process.env.U006_REAL_TEST_SOURCE) : path.join(__dirname, 'u006-real.test.cjs'), 'utf8').replace(/\r\n/g, '\n');
const testBlocks = (source) => source.split(/\ntest\(/).slice(1);

test('F3: every real test closes the sessions it opens in a finally block and asserts the root and a lower bound, never that every recorded process is alive', T, () => {
  const source = realSource();
  const blocks = testBlocks(source).filter((block) => block.includes('openLessonSession(') || block.includes('guardedSessions('));
  assert.ok(blocks.length >= 3, 'the real tests that open sessions');
  for (const block of blocks) {
    assert.match(block, /guardedSessions\(/, 'a real session is opened and ended through guardedSessions (try/finally)');
    assert.doesNotMatch(block, /openLessonSession\(/, 'no real session is opened outside the guard');
  }
  assert.doesNotMatch(source, /recorded\.every\(\(pid\) => table\.some/, 'no assertion that every recorded process is alive');
  assert.match(source, /every recorded root is alive before the close/);
});

test('F3: a failing assertion inside a guarded real test still closes the sessions it opened (the cleanup ran)', T, async () => {
  const { guardedSessions } = require('./u006-support-real.cjs');
  const world = new World();
  const entries = [await openOne(world), await openOne(world), await openOne(world)];
  let next = 0;
  const open = async () => entries[next++].session;
  const injected = new assert.AssertionError({ message: 'injected failing assertion' });
  const run = guardedSessions([open, open], async () => {
    assert.equal(next, 2, 'both sessions are open when the body runs');
    throw injected;
  }, { terminateMs: 20000, listMs: 5000 });
  const result = await outcome(world, run);
  assert.equal(result.ok, false);
  assert.equal(result.error, injected, 'the original failure is what the test sees');
  assert.deepEqual(entries.slice(0, 2).map((entry) => entry.opener.alive().length), [0, 0], 'both browsers were ended by the cleanup');
  assert.ok(entries.slice(0, 2).every((entry) => entry.opener.sessionCloses >= 1));
  assert.equal(intact(entries[2]), true, 'a session the guard never opened is untouched');
  const clean = await outcome(world, guardedSessions([open], async (session) => typeof session.close, { terminateMs: 20000, listMs: 5000 }));
  assert.equal(clean.ok, true);
  assert.equal(clean.value, 'function');
  assert.equal(entries[2].opener.alive().length, 0, 'the cleanup also runs after a body that succeeds');
});

// Self-review 5: the outcome of a close during a failed startup used to hand out the arrays of a module constant, so one caller changing them changed every later outcome.
test('SR5: the outcome of a close during a failed startup is a frozen copy: nothing a caller does to it is visible to the next failed startup', T, async () => {
  const outcomes = [];
  for (let round = 0; round < 2; round += 1) {
    const world = new World();
    const opener = new FakeOpener(world);
    const handle = startSession(opener.open, options(world, opener));
    await quiesce();
    opener.fail(new Error('plain failure'));
    await quiesce();
    const closed = await outcome(world, handle.close());
    assert.equal(closed.ok, true);
    assert.equal(closed.value.startup, 'failed');
    assert.equal(closed.value.survivors.length, 0);
    const before = JSON.stringify(closed.value);
    outcomes.push({ value: closed.value, before });
    if (round === 0) mutateEverything(closed.value);
  }
  assert.equal(deepFrozen(outcomes[0].value), true);
  assert.equal(JSON.stringify(outcomes[0].value), outcomes[0].before, 'the caller could not change its own outcome');
  assert.equal(JSON.stringify(outcomes[1].value), outcomes[1].before);
  assert.deepEqual(outcomes[1].value.terminated, [], 'the second failed startup knows nothing of what the first caller tried');
  assert.notEqual(outcomes[0].value.terminated, outcomes[1].value.terminated, 'no list is shared between two outcomes');
});

// Self-review 7: the caller's signal is checked as what AbortSignal.any needs, and refused with a typed error before anything is launched.
test('SR7: a signal that is not an AbortSignal, or whose getter throws, is a typed refusal before the opener is called', T, () => {
  const world = new World();
  const refusal = (error) => error.code === 'ERR_INVALID_ARG';
  for (const bad of [null, {}, 'x', 7, { aborted: false, addEventListener() {} }]) {
    const opener = new FakeOpener(world);
    assert.throws(() => startSession(opener.open, options(world, opener, { signal: bad })), (error) => refusal(error) && /signal must be an AbortSignal/.test(error.message), String(bad));
    assert.equal(opener.calls.length, 0);
  }
  const opener = new FakeOpener(world);
  const hostile = Object.defineProperty(options(world, opener), 'signal', { enumerable: true, get() { throw new Error('signal getter threw'); } });
  assert.throws(() => startSession(opener.open, hostile), (error) => refusal(error) && /option signal cannot be read: signal getter threw/.test(error.message));
  assert.equal(opener.calls.length, 0);
  const controller = new AbortController();
  const fine = startSession(opener.open, options(world, opener, { signal: controller.signal }));
  fine.ready.catch(() => {});
  assert.equal(typeof fine.close, 'function', 'a real AbortSignal is accepted');
  controller.abort();
});

// The tolerance of the real tests (tests\u006-support-real.cjs): ONLY the scratch-removal EBUSY of the sealed close, with every process gone and confirmed, is recorded; every
// other close error still fails the test. The leftover session directory is taken from the error itself, never from a directory listing (other agents share the runtime folder).
const REPORT_OK = { confirmed: true, terminated: [], alreadyGone: [], refused: [], survivors: [], failed: [], unverifiable: [], unconfirmed: [], errors: [] };
const SESSION_ID = '0f1e2d3c-1111-2222-3333-444455556666';
const busyOutcome = (extra = {}) => ({ graceful: 'closed', gracefulError: null, sealed: 'settled', sealedError: 'x', scratch: 'failed', scratchError: `EBUSY: resource busy or locked, rmdir 'C:\\repo\\.git\\kanban-orchestrator\\browser-runtime\\session-${SESSION_ID}\\Default\\x'`, clean: false, exiting: [], ...REPORT_OK, ...extra });

test('F3: the real tests tolerate ONLY the scratch-removal EBUSY of the sealed close and every other close error fails them', T, async () => {
  const real = require('./u006-support-real.cjs');
  const { CloseError } = loadImplementation().close;
  const closing = (error) => ({ close: () => Promise.reject(error) });
  const busy = new CloseError('close() did not leave a clean state', busyOutcome());
  assert.equal(real.busyOnly(busy), true);
  assert.equal(real.scratchDirOf(busy), `C:\\repo\\.git\\kanban-orchestrator\\browser-runtime\\session-${SESSION_ID}`);
  const tolerated = await real.closeRecording(closing(busy));
  assert.deepEqual([tolerated.outcome, tolerated.busy.code, tolerated.busy.dir], [busy, 'EBUSY', real.scratchDirOf(busy)]);
  const clean = await real.closeRecording({ close: () => Promise.resolve({ clean: true }) });
  assert.deepEqual(clean, { outcome: { clean: true }, busy: null });
  const notTolerated = [
    ['a survivor besides the EBUSY', busyOutcome({ survivors: [{ pid: 1, createdAt: '1' }] })],
    ['a failed kill', busyOutcome({ failed: [{ pid: 1, createdAt: '1', code: 'ERR_KILL' }] })],
    ['a refused identity', busyOutcome({ refused: [{ pid: 1, createdAt: '1', reason: 'unverifiable' }] })],
    ['an unconfirmed identity', busyOutcome({ unconfirmed: [{ pid: 1, createdAt: '1' }] })],
    ['a table error', busyOutcome({ errors: [{ pid: null, createdAt: null, code: 'ERR_ADAPTER', message: 'x' }] })],
    ['a table that was not confirmed', busyOutcome({ confirmed: false })],
    ['an unverifiable process still listed', busyOutcome({ unverifiable: [{ pid: 1, stillListed: true }] })],
    ['a scratch error that is not a lock error', busyOutcome({ scratchError: 'operation failed' })],
    ['a scratch removal that never settled', busyOutcome({ scratch: 'unconfirmed', sealed: 'unsettled' })],
    ['a clean scratch', busyOutcome({ scratch: 'removed', scratchError: null })],
  ];
  for (const [label, shape] of notTolerated) {
    const error = new CloseError('close() did not leave a clean state', shape);
    assert.equal(real.busyOnly(error), false, label);
    await assert.rejects(real.closeRecording(closing(error)), (thrown) => thrown === error, label);
  }
  for (const other of [new Error('EBUSY: resource busy or locked'), Object.assign(new Error('x'), { code: 'ERR_CLOSE_FAILED', scratch: 'failed', scratchError: 'EBUSY' }), null]) {
    assert.equal(real.busyOnly(other), false);
    await assert.rejects(real.closeRecording(closing(other)));
  }
});

test('F3: the leftover session directory is taken from the error text only: another folder, a malformed id or a missing path name nothing', T, () => {
  const real = require('./u006-support-real.cjs');
  const named = (text) => real.scratchDirOf({ scratchError: text });
  assert.equal(named(`EBUSY: busy, unlink "D:\\a b\\browser-runtime\\session-${SESSION_ID}"`), `D:\\a b\\browser-runtime\\session-${SESSION_ID}`);
  for (const text of [
    `EBUSY: busy, rmdir 'C:\\x\\other-runtime\\session-${SESSION_ID}\\f'`,
    `EBUSY: busy, rmdir 'C:\\x\\browser-runtime\\session-not-a-uuid\\f'`,
    `EBUSY: busy, rmdir 'C:\\x\\browser-runtime\\session-${SESSION_ID}0\\f'`,
    'EBUSY: resource busy or locked',
    undefined,
    null,
  ]) assert.equal(named(text), null, String(text));
  assert.equal(real.scratchDirOf(null), null);
  assert.equal(real.scratchDirOf(undefined), null);
});

test('F3: closeRecording removes exactly the leftover directory the EBUSY names, and the guard removes it after a failed body', T, async () => {
  const real = require('./u006-support-real.cjs');
  const { CloseError } = loadImplementation().close;
  const base = fs.mkdtempSync(path.join(__dirname, 'u006-busy-'));
  try {
    const runtime = path.join(base, 'browser-runtime');
    const mine = path.join(runtime, `session-${SESSION_ID}`);
    const neighbour = path.join(runtime, 'session-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    for (const dir of [mine, neighbour]) { fs.mkdirSync(path.join(dir, 'Default'), { recursive: true }); fs.writeFileSync(path.join(dir, 'Default', 'f'), 'x'); }
    const busy = new CloseError('close() did not leave a clean state', busyOutcome({ scratchError: `EBUSY: resource busy or locked, rmdir '${path.join(mine, 'Default')}'` }));
    const recorded = await real.closeRecording({ close: () => Promise.reject(busy) });
    assert.equal(recorded.busy.dir, mine);
    assert.equal(fs.existsSync(mine), false, 'the named directory is gone');
    assert.equal(fs.existsSync(neighbour), true, 'a neighbouring session directory of another agent is never touched');
    fs.mkdirSync(path.join(mine, 'Default'), { recursive: true });
    const failing = { close: () => Promise.reject(busy), owned: { terminate: async () => ({}) } };
    let thrown = null;
    try {
      await real.guardedSessions([async () => failing], async () => { throw new Error('the body failed'); }, { terminateMs: 20000, listMs: 5000 });
    } catch (error) {
      thrown = error;
    }
    assert.match(thrown.message, /the body failed/, 'the original failure is what the test sees');
    assert.equal(fs.existsSync(mine), false, 'the guard removed the leftover directory that the close error named');
    assert.equal(fs.existsSync(neighbour), true);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('F3: a typed launch timeout of the sealed helper is retried ONCE and counted; a second timeout and every other error fail the test', T, async () => {
  const real = require('./u006-support-real.cjs');
  const timeout = () => Object.assign(new Error('browserType.launch: Timeout 15000ms exceeded.\nCall log:'), { name: 'TimeoutError' });
  for (const other of [new Error('browserType.launch: Timeout 15000ms exceeded.'), Object.assign(new Error('page.goto: Timeout 30000ms exceeded.'), { name: 'TimeoutError' }), Object.assign(new Error('boom'), { name: 'TimeoutError' }), null, 'x']) {
    assert.equal(real.isLaunchTimeout(other), false, String(other && other.message));
  }
  assert.equal(real.isLaunchTimeout(timeout()), true);
  let calls = 0;
  let retries = 0;
  const flaky = async () => { calls += 1; if (calls === 1) throw timeout(); return 'session'; };
  assert.equal(await real.openRetrying(flaky, () => { retries += 1; }), 'session');
  assert.deepEqual([calls, retries], [2, 1]);
  calls = 0;
  retries = 0;
  const failing = timeout();
  await assert.rejects(real.openRetrying(async () => { calls += 1; throw failing; }, () => { retries += 1; }), (error) => error === failing);
  assert.deepEqual([calls, retries], [2, 1], 'a second timeout is not retried again');
  calls = 0;
  retries = 0;
  const other = new Error('launch failed');
  await assert.rejects(real.openRetrying(async () => { calls += 1; throw other; }, () => { retries += 1; }), (error) => error === other);
  assert.deepEqual([calls, retries], [1, 0], 'any other error is not retried');
  assert.equal(await real.openRetrying(async () => 'direct', () => { retries += 1; }), 'direct');
  assert.equal(retries, 0);
});
