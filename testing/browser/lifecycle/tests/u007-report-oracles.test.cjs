'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getEventListeners } = require('node:events');
const core = require('../scratch.cjs');
const api = require('../scratch-session.cjs');
const { ManualClock, fakeFileSystem, drive, quiesce, processReport } = require('./u007-support.cjs');
const parent = path.resolve('owned-parent');
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
async function made(adapt = (a) => a) {
  const clock = new ManualClock(), fake = fakeFileSystem(parent, clock);
  const owner = core.createScratchOwner({ parent, clock, fs: adapt(fake.adapter) });
  const root = path.join(parent, 'session-owned');
  await owner.mkdir(root);
  return { clock, fake, owner, root };
}
for (const [label, report] of [
  ['null', null], ['undefined', undefined], ['boolean', true], ['number', 7],
  ['string', 'not-a-report'], ['array', []], ['proxy', new Proxy({}, {})],
]) {
  test(`U007-M004: ${label} process report preserves a typed report-shape error`, async () => {
    const { clock, fake, owner, root } = await made();
    const wrapped = api.wrapScratchSession({ close: async () => report }, owner, { clock });
    const result = await drive(clock, wrapped.close());
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'ERR_SCRATCH_SESSION');
    const outcome = result.error.outcome;
    const expected = { path: null, phase: 'process-report', code: 'ERR_SCRATCH_REPORT', message: 'a process report must be an object' };
    assert.deepEqual(outcome.originalCloseError, expected);
    assert.deepEqual(outcome.process, { confirmed: false, clean: false, errors: [expected] });
    assert.equal(outcome.clean, false);
    assert.equal(outcome.scratch.code, 'ERR_SCRATCH_PROCESS_UNCONFIRMED');
    assert.deepEqual(outcome.scratch.remaining, [root]);
    assert.equal(fake.state.calls.length, 0);
    assert.equal(clock.pending(), 0);
  });
}
for (const kind of ['unknown-field', 'accessor', 'entry-limit']) {
  test(`U007-M005: ${kind} process data is refused before scratch deletion`, async () => {
    const { clock, fake, owner } = await made();
    const report = processReport();
    let reads = 0;
    if (kind === 'unknown-field') report.extra = true;
    if (kind === 'accessor') Object.defineProperty(report, 'confirmed', { enumerable: true, get() { reads += 1; return true; } });
    if (kind === 'entry-limit') for (let i = 0; i < 64; i += 1) report['extra' + i] = true;
    const wrapped = api.wrapScratchSession({ close: async () => report }, owner, { clock });
    const result = await drive(clock, wrapped.close());
    assert.equal(result.ok, false);
    assert.deepEqual(result.error.outcome.originalCloseError, {
      path: null, phase: 'process-report', code: 'ERR_SCRATCH_REPORT',
      message: kind === 'entry-limit' ? 'process report entry limit' : 'process report fields must be closed data properties',
    });
    assert.equal(reads, 0);
    assert.equal(fake.state.calls.length, 0);
  });
}
test('U007-M006: every process array and identity uncertainty affects the process predicate', () => {
  assert.equal(api.processClean(processReport()), true);
  for (const key of ['terminated', 'alreadyGone', 'refused', 'survivors', 'failed', 'unverifiable', 'unconfirmed', 'errors']) {
    for (const value of [undefined, null, {}, [null], ['not-an-object']]) {
      assert.equal(api.processClean({ ...processReport(), [key]: value }), false, key + ':' + String(value));
    }
  }
  for (const value of [undefined, null, false, 1, 'true']) assert.equal(api.processClean({ ...processReport(), confirmed: value }), false);
  for (const key of ['survivors', 'unconfirmed']) assert.equal(api.processClean({ ...processReport(), [key]: [{}] }), false);
  assert.equal(api.processClean({ ...processReport(), refused: [{ reason: 'identity-mismatch' }] }), true);
  for (const reason of [undefined, null, 'owned', false]) assert.equal(api.processClean({ ...processReport(), refused: [{ reason }] }), false);
  assert.equal(api.processClean({ ...processReport(), unverifiable: [{ stillListed: false }] }), true);
  for (const stillListed of [undefined, null, true, 0]) assert.equal(api.processClean({ ...processReport(), unverifiable: [{ stillListed }] }), false);
});
test('U007-M007: explicit mkdir values reach only the positively bound owner in a frozen snapshot', async (t) => {
  const clock = new ManualClock(), fake = fakeFileSystem(parent, clock);
  const options = { recursive: false, mode: 448 };
  const result = { original: 'mkdir-result' };
  const calls = [];
  const owner = core.createScratchOwner({ parent, clock, fs: { ...fake.adapter, mkdir: async (target, given) => {
    calls.push({ target, given }); await fake.adapter.mkdir(target); return result;
  } } });
  let nativeCalls = 0;
  t.mock.method(fs.promises, 'mkdir', async () => { nativeCalls += 1; });
  const root = path.join(parent, 'session-explicit');
  assert.equal(await api.observeScratchCreation(owner, () => fs.promises.mkdir(root, options)), result);
  assert.deepEqual(calls, [{ target: root, given: options }]);
  assert.notEqual(calls[0].given, options);
  assert.equal(Object.isFrozen(calls[0].given), true);
  assert.equal(nativeCalls, 0);
  assert.deepEqual(owner.paths(), [root]);
});
test('U007-M008: recursive and foreign mkdir calls preserve original options and grant no owner provenance', async (t) => {
  const calls = [], originalResult = { native: true };
  const native = t.mock.method(fs.promises, 'mkdir', async function (target, options) {
    calls.push({ receiver: this, target, options }); return originalResult;
  });
  for (const [target, options] of [
    [path.join(parent, 'recursive'), { recursive: true }], [path.join(parent, 'null-options'), null],
    [path.join(parent, 'false-options'), false], [path.join(parent, '..', 'foreign-root'), undefined],
    ['not-a-canonical-Windows-path', undefined],
  ]) {
    const clock = new ManualClock(), fake = fakeFileSystem(parent, clock);
    const owner = core.createScratchOwner({ parent, clock, fs: fake.adapter });
    assert.equal(await api.observeScratchCreation(owner, () => fs.promises.mkdir(target, options)), originalResult);
    assert.deepEqual(owner.paths(), []);
    assert.equal(fs.promises.mkdir, native);
    const expected = options && typeof options === 'object' ? { recursive: options.recursive, mode: options.mode } : options;
    assert.deepEqual(calls.at(-1), { receiver: fs.promises, target, options: expected });
  }
  assert.equal(calls.length, 5);
});
test('U007-M009: retired async scope cannot adopt a root while another observer is live', async (t) => {
  const nativeResult = { native: 'retired-scope' };
  const native = t.mock.method(fs.promises, 'mkdir', async () => nativeResult);
  const clock = new ManualClock(), a = fakeFileSystem(parent, clock), b = fakeFileSystem(parent, clock);
  const ownerA = core.createScratchOwner({ parent, clock, fs: a.adapter });
  const ownerB = core.createScratchOwner({ parent, clock, fs: b.adapter });
  const late = deferred(), live = deferred();
  let lateWork;
  await api.observeScratchCreation(ownerA, () => { lateWork = late.promise.then(() => fs.promises.mkdir(path.join(parent, 'session-retired'))); });
  const pendingB = api.observeScratchCreation(ownerB, () => live.promise);
  try {
    late.resolve();
    assert.equal(await lateWork, nativeResult);
    assert.deepEqual(ownerA.paths(), []);
    assert.deepEqual(ownerB.paths(), []);
    assert.notEqual(fs.promises.mkdir, native);
  } finally { live.resolve(); await pendingB; }
  assert.equal(fs.promises.mkdir, native);
});
test('U007-M010: a foreign observer replacement is reported and never overwritten', async (t) => {
  t.mock.method(fs.promises, 'mkdir', async () => {});
  const clock = new ManualClock(), fake = fakeFileSystem(parent, clock);
  const owner = core.createScratchOwner({ parent, clock, fs: fake.adapter });
  const foreign = async () => 'foreign observer';
  await assert.rejects(api.observeScratchCreation(owner, () => { fs.promises.mkdir = foreign; }), {
    code: 'ERR_SCRATCH_OBSERVER', message: 'another observer changed mkdir; its bytes are not overwritten',
  });
  assert.equal(fs.promises.mkdir, foreign);
});
test('U007-M011: observation remains active until the failing invocation actually settles', async (t) => {
  const native = t.mock.method(fs.promises, 'mkdir', async () => {});
  const clock = new ManualClock(), fake = fakeFileSystem(parent, clock);
  const owner = core.createScratchOwner({ parent, clock, fs: fake.adapter });
  const gate = deferred(), failure = Object.assign(new Error('invocation failed'), { settled: gate.promise });
  await assert.rejects(api.observeScratchCreation(owner, () => { throw failure; }), (error) => error === failure);
  assert.notEqual(fs.promises.mkdir, native);
  gate.resolve(); await quiesce();
  assert.equal(fs.promises.mkdir, native);
});
for (const [entry, code, message] of [
  [{ name: 'valid.txt', kind: 'unknown' }, 'ERR_SCRATCH_ADAPTER', 'directory entries need unique valid Windows names and known types'],
  [{ name: 'NUL', kind: 'file' }, 'ERR_SCRATCH_ADAPTER', 'directory entries need unique valid Windows names and known types'],
  [{ name: 'valid.txt', kind: 'file', extra: true }, 'ERR_SCRATCH_OPTIONS', 'unknown option'],
]) {
  test(`U007-M012: malformed directory answer ${JSON.stringify(entry)} has an exact refusal phase`, async () => {
    const { owner, fake, clock, root } = await made((a) => ({ ...a, readDir: async () => [entry] }));
    const report = (await drive(clock, owner.cleanup())).value;
    assert.equal(report.clean, false);
    assert.equal(report.confirmed, false);
    assert.deepEqual(report.errors, [{ path: root, phase: 'scan', code, message }]);
    assert.deepEqual(report.unconfirmed, [{ path: root, phase: 'scan' }]);
    assert.deepEqual(report.refused, []);
    assert.deepEqual(report.remaining, [root]);
    assert.equal(fake.state.calls.length, 0);
  });
}
test('U007-M013: a timed-out removal records one exact error, removes its abort listener and cancels all timers', async () => {
  const { owner, fake, clock, root } = await made((a) => ({ ...a, remove: () => new Promise(() => {}) }));
  const controller = new AbortController();
  const report = (await drive(clock, owner.cleanup({ timeoutMs: 200, signal: controller.signal }))).value;
  assert.equal(report.code, 'ERR_SCRATCH_DEADLINE');
  assert.deepEqual(report.errors, [{ path: root, phase: 'remove', code: 'ERR_SCRATCH_DEADLINE',
    message: 'an awaited operation exhausted the original budget' }]);
  assert.deepEqual(report.unconfirmed, [{ path: root, phase: 'remove' }]);
  assert.deepEqual(report.remaining, [root]);
  assert.deepEqual(report.refused, []);
  assert.deepEqual(report.attempts, [{ path: root, atMs: 0, code: 'ERR_SCRATCH_DEADLINE' }]);
  assert.equal(report.confirmed, false);
  assert.equal(report.clean, false);
  assert.equal(fake.entries.has(root), true);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  assert.equal(clock.pending(), 0);
});
test('U007-M014: reported filesystem failure fields are distinct from ownership refusals', async () => {
  const failure = Object.assign(new Error('locked file remains'), { code: 'EBUSY' });
  const { owner, clock, root } = await made((a) => ({ ...a, remove: async () => { throw failure; } }));
  const report = (await drive(clock, owner.cleanup({ maxAttempts: 1 }))).value;
  assert.deepEqual(report.errors, [{ path: root, phase: 'remove', code: 'EBUSY', message: 'locked file remains' }]);
  assert.deepEqual(report.refused, []);
  assert.deepEqual(report.unconfirmed, []);
  assert.equal(report.confirmed, true);
  assert.deepEqual(report.remaining, [root]);
  assert.equal(report.code, 'SCRATCH_REMAINING');
  assert.equal(report.clean, false);
});
