'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { getEventListeners } = require('node:events');
const core = require('../scratch.cjs');
const api = require('../scratch-session.cjs');
const { World } = require('./u005-support-world.cjs');
const { ManualClock, fakeFileSystem, drive, quiesce, processReport } = require('./u007-support.cjs');
const parent = path.resolve('owned-parent');
const root = path.join(parent, 'session-owned');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
async function made(clock = new ManualClock(), adapt = (value) => value) {
  const fake = fakeFileSystem(parent, clock);
  const owner = core.createScratchOwner({ parent, clock, fs: adapt(fake.adapter) });
  await owner.mkdir(root);
  return { clock, fake, owner };
}
test('U007-M042: already absent owned scratch is included in the exact confirmed-removal report', async () => {
  const { clock, fake, owner } = await made();
  fake.entries.delete(root);
  const report = (await drive(clock, owner.cleanup())).value;
  assert.equal(report.clean, true);
  assert.equal(report.confirmed, true);
  assert.deepEqual(report.removed, [root]);
  assert.deepEqual(report.remaining, []);
  assert.deepEqual(report.attempts, []);
});
test('U007-M043: the post-failure scan replaces the earlier remaining-file list', async () => {
  const { clock, fake, owner } = await made();
  const old = path.join(root, 'before.txt'), current = path.join(root, 'after.txt');
  fake.put(old, 'file');
  fake.state.beforeRemove = async () => { fake.entries.delete(old); fake.put(current, 'file'); };
  fake.state.failures = ['EBUSY'];
  const report = (await drive(clock, owner.cleanup({ maxAttempts: 1 }))).value;
  assert.deepEqual(report.remaining, [root, current]);
  assert.equal(report.confirmed, true);
  assert.equal(report.code, 'SCRATCH_REMAINING');
  assert.deepEqual(report.errors, [{ path: root, phase: 'remove', code: 'EBUSY', message: 'EBUSY' }]);
});
for (const phase of ['remaining-scan', 'backoff']) {
  test(`U007-M044: ${phase} failure preserves its exact phase and does not become a terminal-code claim`, async () => {
    const clock = new ManualClock();
    if (phase === 'backoff') clock.sleep = async () => { throw Object.assign(Error('sleep failed'), { code: 'EIO' }); };
    const { fake, owner } = await made(clock);
    fake.state.failures = ['EBUSY'];
    let reads = 0;
    if (phase === 'remaining-scan') fake.state.beforeRead = async () => {
      if (++reads === 2) throw Object.assign(Error('scan failed'), { code: 'EIO' });
    };
    const report = (await drive(clock, owner.cleanup())).value;
    assert.deepEqual(report.unconfirmed, [{ path: root, phase }]);
    assert.deepEqual(report.errors.at(-1), { path: root, phase, code: 'EIO', message: phase === 'backoff' ? 'sleep failed' : 'scan failed' });
    assert.equal(report.code, 'SCRATCH_REMAINING');
    assert.equal(report.confirmed, false);
    assert.equal(report.attempts.length, 1);
  });
}
for (const kind of ['link', 'depth', 'path']) {
  test(`U007-M045: enumerated ${kind} refusal preserves its code, message and incomplete-root report`, async () => {
    const { clock, fake, owner } = await made();
    const code = kind === 'link' ? 'ERR_SCRATCH_OWNERSHIP' : 'ERR_SCRATCH_LIMIT';
    const message = kind === 'link' ? 'a link in owned scratch is refused without following it'
      : kind === 'depth' ? 'scratch nesting exceeds the depth cap' : 'an enumerated path exceeds the canonical path bound';
    if (kind === 'link') fake.put(path.join(root, 'link'), 'link');
    if (kind === 'depth') { const nested = path.join(root, 'nested'); fake.put(nested); fake.put(path.join(nested, 'leaf.txt'), 'file'); }
    if (kind === 'path') { let target = root; for (let i = 0; i < 4; i += 1) { target = path.join(target, 'a'.repeat(250)); fake.put(target); } }
    const report = (await drive(clock, owner.cleanup({ maxDepth: kind === 'depth' ? 1 : 16 }))).value;
    assert.deepEqual(report.errors, [{ path: root, phase: 'scan', code, message }]);
    assert.deepEqual(report.unconfirmed, [{ path: root, phase: 'scan' }]);
    assert.deepEqual(report.refused, kind === 'link' ? [{ path: root, code, message }] : []);
    assert.deepEqual(report.remaining, [root]);
    assert.equal(fake.state.calls.length, 0);
  });
}
test('U007-M046: creation refuses non-directory ancestors at the original capture phase', async () => {
  const { clock, owner, fake } = await made(new ManualClock(), (adapter) => ({
    ...adapter, lstat: async (target) => ({ ...await adapter.lstat(target), ...(target === parent ? { kind: 'file' } : {}) }),
  }));
  const report = (await drive(clock, owner.cleanup())).value;
  assert.deepEqual(report.errors[0], { path: root, phase: 'creation-identity', code: 'ERR_SCRATCH_OWNERSHIP',
    message: 'links and non-directory ancestors are refused' });
  assert.equal(fake.state.calls.length, 0);
});
test('U007-M047: a cleanup budget that cannot start returns every typed refusal field and owned path', async () => {
  const clock = new ManualClock(); clock.now = function () { return this.bad ? NaN : this.t; };
  const { fake, owner } = await made(clock);
  clock.bad = true;
  const report = await owner.cleanup();
  assert.deepEqual(report, { code: 'ERR_SCRATCH_OPTIONS', clean: false, confirmed: false, attempts: [], delays: [], removed: [],
    remaining: [root], refused: [{ path: null, code: 'ERR_SCRATCH_OPTIONS', message: 'clock must return finite monotonic milliseconds' }],
    errors: [], unconfirmed: [{ path: root, phase: 'refusal' }], work: { identityReads: 0, directoryReads: 0, entries: 0 } });
  assert.equal(fake.state.calls.length, 0);
});
test('U007-M048: clocks remember the latest observation and reject a nonfinite subsequent reading', () => {
  const clock = new ManualClock(), budget = core.createBudget(clock, 100);
  clock.t = 10; assert.equal(budget.remaining(), 90);
  clock.t = 5; assert.throws(() => budget.remaining(), { code: 'ERR_SCRATCH_CLOCK', message: 'clock is not monotonic' });
  clock.t = NaN; assert.throws(() => budget.remaining(), { code: 'ERR_SCRATCH_CLOCK', message: 'clock is not monotonic' });
  budget.stop();
  for (const key of ['now', 'setTimeout', 'clearTimeout', 'sleep']) {
    const bad = new ManualClock();
    Object.defineProperty(bad, key, { get() { throw Error('private getter failure'); } });
    assert.throws(() => core.clockOf(bad), { code: 'ERR_SCRATCH_OPTIONS', message: `clock.${key} cannot be read` });
  }
});
test('U007-M049: a settled operation cancels one timer only, even when abort arrives later', async () => {
  const clock = new ManualClock(), controller = new AbortController(), gate = deferred();
  const clear = clock.clearTimeout.bind(clock), calls = [];
  clock.clearTimeout = (timer) => { calls.push(timer); clear(timer); };
  const budget = core.createBudget(clock, 100, controller.signal);
  const pending = budget.wait(() => gate.promise);
  gate.resolve('first value');
  assert.equal(await pending, 'first value');
  assert.equal(calls.length, 1);
  controller.abort(); await quiesce();
  assert.equal(calls.length, 1);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  budget.stop();
  assert.equal(clock.pending(), 0);
});
test('U007-M050: cycle detection has a finite observable work frontier, not a later depth-limit substitute', () => {
  const cycle = {}; cycle.self = cycle;
  const seen = new Set(), work = { objects: 0, chars: 0 };
  assert.throws(() => core.frozenCopy(cycle, 0, seen, work), { code: 'ERR_SCRATCH_REPORT' });
  assert.equal(work.objects, 1);
});
test('U007-M051: native mkdir keeps its captured receiver when the promises facade changes later', async () => {
  const filename = path.resolve(__dirname, '..', 'scratch.cjs'), calls = [], result = { original: true };
  const promises = { mkdir: async function (...args) { calls.push({ receiver: this, args }); return result; } };
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.require = (request) => request === 'node:fs' ? { promises } : require(request);
  loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
  const adapter = loaded.exports.createFileSystemAdapters(), options = { recursive: false };
  promises.mkdir = async () => { throw Error('later observer must not be used'); };
  assert.equal(await adapter.mkdir(root, options), result);
  assert.deepEqual(calls, [{ receiver: promises, args: [root, options] }]);
});
test('U007-M052: callback boundaries retain strict caller isolation and unbound mkdir receivers', async (t) => {
  assert.throws(() => core.readClosed.caller, TypeError);
  assert.throws(() => api.processClean.caller, TypeError);
  let receiver = 'not-called';
  t.mock.method(fs.promises, 'mkdir', async function () { receiver = this; return 'foreign-result'; });
  const clock = new ManualClock(), fake = fakeFileSystem(parent, clock);
  const owner = core.createScratchOwner({ parent, clock, fs: fake.adapter });
  assert.equal(await api.observeScratchCreation(owner, () => {
    const unbound = fs.promises.mkdir; return unbound(path.join(parent, '..', 'foreign'));
  }), 'foreign-result');
  assert.equal(receiver, undefined);
});
for (const settle of ['resolve', 'reject']) {
  test(`U007-M053: deferred ${settle} release faults are logged by name and never overwrite a foreign observer`, async (t) => {
    t.mock.method(fs.promises, 'mkdir', async () => {});
    const logged = []; t.mock.method(console, 'error', (message) => logged.push(message));
    const clock = new ManualClock(), fake = fakeFileSystem(parent, clock);
    const owner = core.createScratchOwner({ parent, clock, fs: fake.adapter });
    const gate = deferred(), failure = Object.assign(Error('original open failure'), { settled: gate.promise });
    await assert.rejects(api.observeScratchCreation(owner, () => { throw failure; }), (error) => error === failure);
    const foreign = async () => 'foreign'; fs.promises.mkdir = foreign;
    gate[settle](Object.assign(Error('settlement'), { code: 'ERR_SETTLEMENT' })); await quiesce();
    assert.deepEqual(logged, ['ERR_SCRATCH_OBSERVER: another observer changed mkdir; its bytes are not overwritten']);
    assert.equal(fs.promises.mkdir, foreign);
  });
}
test('U007-M054: session metadata, close receiver and same-owner binding are retained without aliasing another owner', async () => {
  const { clock, owner } = await made();
  const page = {}, owned = {}, session = { page, owned, browserVersion: 'fixture-version',
    close: async function () { assert.equal(this, session); return processReport(); } };
  const a = api.wrapScratchSession(session, owner, { clock }), b = api.wrapScratchSession(session, owner, { clock });
  assert.equal(a.ok, true); assert.equal(b.ok, true);
  assert.equal(a.page, page); assert.equal(a.owned, owned); assert.equal(a.browserVersion, 'fixture-version');
  assert.equal((await a.close()).clean, true);
  const other = await made();
  const refused = api.wrapScratchSession(session, other.owner, { clock });
  assert.deepEqual(refused.refused, [{ path: null, code: 'ERR_SCRATCH_OPTIONS', message: 'a live session cannot be rebound to another invocation owner' }]);
});
for (const extra of [{ sealed: 'unsettled' }, { innerSettled: false }]) {
  test(`U007-M055: ${JSON.stringify(extra)} prohibits scratch removal despite a confirmed process snapshot`, async () => {
    const { clock, fake, owner } = await made();
    const wrapped = api.wrapScratchSession({ close: async () => ({ ...processReport(), ...extra }) }, owner, { clock });
    const result = await drive(clock, wrapped.close());
    assert.equal(result.ok, false);
    assert.equal(result.error.outcome.scratch.code, 'ERR_SCRATCH_PROCESS_UNCONFIRMED');
    assert.equal(result.error.outcome.scratch.refused[0].message, 'scratch is not removed while process or sealed I/O completion is unconfirmed');
    assert.equal(fake.state.calls.length, 0);
  });
}
test('U007-M056: a deadline exception cannot grant cleanup merely by carrying a clean process snapshot', async () => {
  const { clock, fake, owner } = await made();
  const error = Object.assign(Error('original process deadline'), processReport(), { code: 'ERR_SCRATCH_DEADLINE' });
  const wrapped = api.wrapScratchSession({ close: async () => { throw error; } }, owner, { clock });
  const result = await drive(clock, wrapped.close());
  assert.equal(result.ok, false);
  assert.deepEqual(result.error.outcome.originalCloseError, { path: null, phase: 'process-close',
    code: 'ERR_SCRATCH_DEADLINE', message: 'original process deadline' });
  assert.equal(fake.state.calls.length, 0);
});
test('U007-M057: a retained close error and explicit cleanup attempt bound reach the final outcome', async () => {
  const { clock, fake, owner } = await made();
  fake.state.failures = ['EBUSY', 'EBUSY', 'EBUSY', 'EBUSY'];
  const error = Object.assign(Error('original close failure'), processReport(), { code: 'ERR_FIXTURE_CLOSE' });
  const wrapped = api.wrapScratchSession({ close: async () => { throw error; } }, owner, { clock, maxAttempts: 2, timeoutMs: 100 });
  const result = await drive(clock, wrapped.close());
  assert.equal(result.ok, false);
  assert.deepEqual(result.error.outcome.originalCloseError, { path: null, phase: 'process-close',
    code: 'ERR_FIXTURE_CLOSE', message: 'original close failure' });
  assert.equal(result.error.outcome.scratch.attempts.length, 2);
  assert.deepEqual(result.error.outcome.scratch.delays, [{ path: root, ms: 25 }]);
});
test('U007-M058: callable sessions and invalid owner/invocation pairs return exact typed refusals', async () => {
  const { owner } = await made();
  const callable = Object.assign(() => {}, { close: async () => processReport() });
  const refused = api.wrapScratchSession(callable, owner);
  assert.deepEqual(refused.refused, [{ path: null, code: 'ERR_SCRATCH_OPTIONS', message: 'session needs its genuine invocation-bound scratch owner' }]);
  await assert.rejects(api.observeScratchCreation(owner, null), { code: 'ERR_SCRATCH_OWNERSHIP',
    message: 'a genuine owner and an invocation are required' });
});
for (const mode of ['separate', 'fallback']) {
  test(`U007-M059: ${mode} scratch clock is selected for both owned work and the process-close wrapper`, async () => {
    const world = new World(); world.cost = 0;
    const clock = mode === 'separate' ? new ManualClock() : world.clock;
    clock.t = mode === 'separate' ? 1000 : 0;
    const fake = fakeFileSystem(parent, clock);
    let browser;
    const handle = api.startScratchSession(async () => {
      await fs.promises.mkdir(root); browser = world.os.spawn(world.os.selfPid);
      return { page: {}, close: async () => { world.os.exit(browser.pid); } };
    }, { scratchParent: parent, scratchFs: fake.adapter, clock: world.clock, adapters: world.adapters(), deadlineMs: 1000,
      ...(mode === 'separate' ? { scratchClock: clock } : {}) });
    try {
      await handle.ready;
      const result = await handle.close();
      assert.equal(result.clean, true);
      assert.equal(result.scratch.attempts[0].atMs, mode === 'separate' ? 1000 : 0);
      assert.ok(clock.requested.includes(require('../close.cjs').budgetsOf().closeBoundMs));
    } finally { if (browser) world.os.exit(browser.pid); }
  });
}
test('U007-M060: configured scratch attempt limits reach the invocation close rather than silently using defaults', async () => {
  const world = new World(); world.cost = 0;
  const fake = fakeFileSystem(parent, world.clock); fake.state.failures = ['EBUSY', 'EBUSY', 'EBUSY', 'EBUSY'];
  let browser;
  const handle = api.startScratchSession(async () => {
    await fs.promises.mkdir(root); browser = world.os.spawn(world.os.selfPid);
    return { page: {}, close: async () => { world.os.exit(browser.pid); } };
  }, { scratchParent: parent, scratchFs: fake.adapter, scratchClock: world.clock, clock: world.clock,
    adapters: world.adapters(), deadlineMs: 1000, scratchMaxAttempts: 1, scratchTimeoutMs: 200 });
  try {
    await handle.ready;
    const result = await drive(world.clock, handle.close());
    assert.equal(result.ok, false);
    assert.equal(result.error.outcome.scratch.attempts.length, 1);
    assert.deepEqual(result.error.outcome.scratch.delays, []);
  } finally { if (browser) world.os.exit(browser.pid); }
});
test('U007-M061: a transient ready-wrapper clock refusal closes the actual session before rejecting readiness', async () => {
  const world = new World(); world.cost = 0;
  const clock = new ManualClock(), fake = fakeFileSystem(parent, clock);
  const set = clock.setTimeout;
  let reads = 0, browser;
  Object.defineProperty(clock, 'setTimeout', { get() { return ++reads === 2 ? null : set; } });
  const handle = api.startScratchSession(async () => {
    await fs.promises.mkdir(root); browser = world.os.spawn(world.os.selfPid);
    return { page: {}, close: async () => { world.os.exit(browser.pid); } };
  }, { scratchParent: parent, scratchFs: fake.adapter, scratchClock: clock, clock: world.clock, adapters: world.adapters(), deadlineMs: 1000 });
  try {
    const result = await drive(clock, handle.ready);
    assert.equal(result.ok, false, 'a refused wrapper must not become a successful ready value');
    assert.equal(result.error.code, 'ERR_SCRATCH_SESSION');
    assert.equal(result.error.outcome.code, 'ERR_SCRATCH_OPTIONS');
    assert.equal(result.error.outcome.refused[0].message, 'clock.setTimeout must be a function');
    assert.equal(world.has(browser), false, 'readiness rejection waits for the bounded fallback close');
    assert.equal(fake.entries.has(root), false);
  } finally { if (browser) world.os.exit(browser.pid); }
});
test('U007-M062: invalidated close-wrapper configuration is an exact typed refusal, not a default-clock fallback', async () => {
  const world = new World(); world.cost = 0;
  const clock = new ManualClock(), fake = fakeFileSystem(parent, clock);
  let browser;
  const handle = api.startScratchSession(async () => {
    await fs.promises.mkdir(root); browser = world.os.spawn(world.os.selfPid);
    return { page: {}, close: async () => { world.os.exit(browser.pid); } };
  }, { scratchParent: parent, scratchFs: fake.adapter, scratchClock: clock, clock: world.clock, adapters: world.adapters(), deadlineMs: 1000 });
  try {
    await handle.ready;
    clock.setTimeout = null;
    const result = await handle.close().then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }));
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'ERR_SCRATCH_SESSION');
    assert.equal(result.error.outcome.code, 'ERR_SCRATCH_OPTIONS');
    assert.equal(result.error.outcome.refused[0].message, 'clock.setTimeout must be a function');
    assert.equal(fake.state.calls.length, 0);
  } finally { if (browser) world.os.exit(browser.pid); }
});
test('U007-M063: custom sealed loaders are used and invalid handles retain the whole refusal outcome', async (t) => {
  const load = Module._load;
  let currentOpener, defaultLoads = 0;
  t.mock.method(Module, '_load', function (request, from, ...rest) {
    if (request === '../isolated.cjs' && path.basename(from.filename) === 'scratch-session.cjs') {
      const open = async () => { defaultLoads += 1; return currentOpener(); };
      return { openIsolatedLesson: open, openIsolatedLoopback: open };
    }
    return load.call(this, request, from, ...rest);
  });
  for (const kind of ['lesson', 'loopback']) {
    const world = new World(); world.cost = 0;
    const fake = fakeFileSystem(parent, world.clock);
    let loads = 0, browser;
    const opener = async () => {
      await fs.promises.mkdir(root); browser = world.os.spawn(world.os.selfPid);
      return { page: {}, close: async () => { world.os.exit(browser.pid); } };
    };
    currentOpener = opener;
    const options = { scratchParent: parent, scratchFs: fake.adapter, scratchClock: world.clock, clock: world.clock,
      adapters: world.adapters(), deadlineMs: 1000,
      loadSealed: () => { loads += 1; return { openIsolatedLesson: opener, openIsolatedLoopback: opener }; } };
    try {
      const session = kind === 'lesson' ? await api.openLessonScratchSession('fixture', options)
        : await api.openLoopbackScratchSession('fixture', {}, options);
      assert.equal(loads, 1);
      assert.equal(defaultLoads, 0);
      assert.equal((await session.close()).clean, true);
    } finally { if (browser) world.os.exit(browser.pid); }
    const invalid = { scratchParent: 'NUL', opener };
    const result = await (kind === 'lesson' ? api.openLessonScratchSession('fixture', invalid)
      : api.openLoopbackScratchSession('fixture', {}, invalid)).then(() => null, (error) => error);
    assert.equal(result.code, 'ERR_SCRATCH_SESSION');
    assert.equal(result.outcome.ok, false);
    assert.equal(result.outcome.code, 'ERR_SCRATCH_OPTIONS');
    assert.equal(result.outcome.refused[0].message, 'parent must be a canonical local Windows directory');
  }
});
test('U007-M064: undefined and mode-only mkdir options preserve their distinct captured argument shape', async () => {
  for (const options of [undefined, { mode: 448 }]) {
    const clock = new ManualClock(), fake = fakeFileSystem(parent, clock);
    let received = 'not-called';
    const owner = core.createScratchOwner({ parent, clock, fs: { ...fake.adapter,
      mkdir: async (target, given) => { received = given; return fake.adapter.mkdir(target); },
    } });
    await owner.mkdir(root, options);
    if (options === undefined) assert.equal(received, undefined);
    else assert.deepEqual(received, { recursive: undefined, mode: 448 });
    assert.equal((await owner.cleanup()).clean, true);
  }
});
test('U007-M065: ownership validation retains its explicit recursive and closed-owner messages', async () => {
  const { owner } = await made();
  await owner.cleanup();
  await assert.rejects(owner.mkdir(path.join(parent, 'after-close')), {
    code: 'ERR_SCRATCH_CLOSED', message: 'an owner cannot create scratch after cleanup started',
  });
  for (const options of [{ recursive: true }, { unknown: true }]) {
    const clock = new ManualClock(), fake = fakeFileSystem(parent, clock);
    const fresh = core.createScratchOwner({ parent, clock, fs: fake.adapter });
    await assert.rejects(fresh.mkdir(root, options), { code: 'ERR_SCRATCH_OWNERSHIP',
      message: options.unknown ? 'exclusive mkdir options must be readable and closed' : 'exclusive non-recursive mkdir is required' });
  }
});
test('U007-M066: creation and deletion recheck grandparents, not only the immediate parent', async () => {
  const { clock, fake, owner } = await made();
  const ancestor = path.dirname(parent), original = fake.entries.get(ancestor);
  fake.entries.set(ancestor, { ...original, fileId: String(Number(original.fileId) + 100) });
  const report = (await drive(clock, owner.cleanup())).value;
  assert.deepEqual(report.refused, [{ path: root, code: 'ERR_SCRATCH_OWNERSHIP', message: 'ancestor identity changed or resolves through a link' }]);
  assert.equal(fake.state.calls.length, 0);
});
test('U007-M067: a later invalid cleanup request cannot poison the original shared cleanup promise', async () => {
  const { owner } = await made();
  const first = owner.cleanup();
  assert.equal((await first).clean, true);
  assert.equal(owner.cleanup({ unknown: true }), first);
  assert.equal(owner.cleanup(), first);
  assert.equal((await owner.cleanup()).clean, true);
});
test('U007-M068: malformed thrown process data preserves the original close error separately from its report error', async () => {
  const { clock, fake, owner } = await made();
  const original = Object.assign(Error('original failure retained'), { code: 'ERR_ORIGINAL', unexpected: true });
  const wrapped = api.wrapScratchSession({ close: async () => { throw original; } }, owner, { clock });
  const result = await drive(clock, wrapped.close());
  assert.equal(result.ok, false);
  assert.deepEqual(result.error.outcome.originalCloseError, { path: null, phase: 'process-close',
    code: 'ERR_ORIGINAL', message: 'original failure retained' });
  assert.deepEqual(result.error.outcome.process.errors, [{ path: null, phase: 'process-report',
    code: 'ERR_SCRATCH_REPORT', message: 'process report fields must be closed data properties' }]);
  assert.equal(fake.state.calls.length, 0);
});
test('U007-M069: each directory adapter gets the exact remaining enumeration capacity before doing work', async () => {
  const calls = [];
  const { clock, fake, owner } = await made(new ManualClock(), (adapter) => ({ ...adapter,
    readDir: async (target, limit) => { calls.push({ target, limit }); return adapter.readDir(target, limit); },
  }));
  const nested = path.join(root, 'nested');
  fake.put(path.join(root, 'first.txt'), 'file'); fake.put(nested); fake.put(path.join(nested, 'leaf.txt'), 'file');
  assert.equal((await drive(clock, owner.cleanup({ maxEntries: 5 }))).value.clean, true);
  assert.deepEqual(calls, [{ target: root, limit: 4 }, { target: nested, limit: 2 }]);
});
test('U007-M070: abort and exhausted-budget errors retain the exact uncertainty message for their phase', async () => {
  const clock = new ManualClock(), controller = new AbortController();
  const budget = core.createBudget(clock, 100, controller.signal), gate = deferred();
  const pending = budget.wait(() => gate.promise);
  controller.abort();
  await assert.rejects(pending, { code: 'ERR_SCRATCH_ABORTED', message: 'cleanup was aborted; issued I/O is unconfirmed' });
  assert.throws(() => budget.remaining(), { code: 'ERR_SCRATCH_ABORTED', message: 'cleanup was aborted; issued I/O is not undone' });
  budget.stop(); gate.resolve(); await quiesce();
  const deadlineClock = new ManualClock(), deadline = core.createBudget(deadlineClock, 100);
  deadlineClock.t = 100;
  assert.throws(() => deadline.remaining(), { code: 'ERR_SCRATCH_DEADLINE', message: 'the original cleanup budget is exhausted' });
  deadline.stop();
});
test('U007-M071: a changed root after backoff is a new verification refusal before a second removal', async () => {
  const clock = new ManualClock(), sleep = clock.sleep.bind(clock);
  let fake;
  clock.sleep = async (ms) => { await sleep(ms); fake.put(root); };
  const created = await made(clock); fake = created.fake;
  fake.state.failures = ['EBUSY'];
  const report = (await drive(clock, created.owner.cleanup())).value;
  assert.deepEqual(report.unconfirmed, [{ path: root, phase: 'verification' }]);
  assert.equal(report.errors.at(-1).phase, 'verification');
  assert.equal(report.errors.at(-1).code, 'ERR_SCRATCH_OWNERSHIP');
  assert.equal(fake.state.calls.length, 1);
});
