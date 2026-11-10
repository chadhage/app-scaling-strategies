'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../scratch.cjs');
const api = require('../scratch-session.cjs');
const { ManualClock, fakeFileSystem, drive, processReport } = require('./u007-support.cjs');
const parent = path.resolve('owned-parent');
async function made() {
  const clock = new ManualClock(), fake = fakeFileSystem(parent, clock);
  const owner = core.createScratchOwner({ parent, clock, fs: fake.adapter });
  const root = path.join(parent, 'session-owned');
  await owner.mkdir(root);
  return { clock, fake, owner, root };
}
for (const scope of ['root', 'ancestor']) for (const component of ['device', 'fileId', 'birth']) {
  test(`U007-M025: ${scope} ${component} is independently necessary for destructive authority`, async () => {
    const { clock, fake, owner, root } = await made();
    const target = scope === 'root' ? root : parent;
    const before = fake.entries.get(target);
    fake.entries.set(target, { ...before, [component]: String(Number(before[component]) + 100) });
    const report = (await drive(clock, owner.cleanup())).value;
    const message = scope === 'root' ? 'recorded root was replaced or became a link' : 'ancestor identity changed or resolves through a link';
    assert.deepEqual(report.refused, [{ path: root, code: 'ERR_SCRATCH_OWNERSHIP', message }]);
    assert.deepEqual(report.errors, [{ path: root, phase: 'verification', code: 'ERR_SCRATCH_OWNERSHIP', message }]);
    assert.deepEqual(report.unconfirmed, [{ path: root, phase: 'verification' }]);
    assert.deepEqual(report.remaining, [root]);
    assert.equal(report.confirmed, false);
    assert.equal(fake.state.calls.length, 0);
    assert.equal(fake.entries.has(root), true);
  });
}
test('U007-M026: the same error code from distinct phases is retained as two observations', async () => {
  const { clock, fake, owner, root } = await made();
  let removalIssued = false;
  fake.state.beforeStat = async (target) => {
    if (target === root && removalIssued) throw Object.assign(Error('confirmation is unreadable'), { code: 'EBUSY' });
  };
  fake.state.beforeRemove = async () => { removalIssued = true; throw Object.assign(Error('removal failed'), { code: 'EBUSY' }); };
  const report = (await drive(clock, owner.cleanup())).value;
  assert.deepEqual(report.errors, [
    { path: root, phase: 'remove', code: 'EBUSY', message: 'removal failed' },
    { path: root, phase: 'confirmation', code: 'EBUSY', message: 'confirmation is unreadable' },
  ]);
  assert.deepEqual(report.unconfirmed, [{ path: root, phase: 'confirmation' }]);
  assert.equal(report.attempts.length, 1);
  assert.equal(report.confirmed, false);
});
test('U007-M027: a report may share input nodes without creating a cycle or a mutable output alias', () => {
  const shared = { value: true };
  const result = core.frozenCopy({ first: shared, second: shared });
  assert.deepEqual(result, { first: { value: true }, second: { value: true } });
  assert.notEqual(result.first, result.second);
  assert.notEqual(result.first, shared);
  shared.value = false;
  assert.equal(result.first.value, true);
  assert.equal(Object.isFrozen(result.first), true);
  assert.equal(Object.isFrozen(result.second), true);
});
test('U007-M028: system clock wrappers preserve units, callback, timer identity and sleep without wall-clock assertions', async (t) => {
  const timer = { ownedTimer: true }, calls = [];
  t.mock.method(process.hrtime, 'bigint', () => 1234567000000n);
  t.mock.method(global, 'setTimeout', (callback, ms) => { calls.push({ callback, ms }); return timer; });
  let cleared;
  t.mock.method(global, 'clearTimeout', (handle) => { cleared = handle; });
  assert.equal(core.systemClock.now(), 1234567);
  const callback = () => {};
  assert.equal(core.systemClock.setTimeout(callback, 19), timer);
  assert.deepEqual(calls[0], { callback, ms: 19 });
  core.systemClock.clearTimeout(timer);
  assert.equal(cleared, timer);
  const asleep = core.systemClock.sleep(17);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].ms, 17);
  assert.equal(typeof calls[1].callback, 'function');
  calls[1].callback();
  t.mock.restoreAll();
  assert.equal(await asleep, undefined);
  assert.equal(Object.isFrozen(core.systemClock), true);
});
test('U007-M029: both public error types preserve names, codes and immutable session outcomes', async () => {
  const error = new core.ScratchError('ERR_OWNED_TEST', 'explicit failure');
  assert.equal(error instanceof Error, true);
  assert.equal(error.name, 'ScratchError');
  assert.equal(error.code, 'ERR_OWNED_TEST');
  assert.equal(error.message, 'explicit failure');
  const { clock, owner } = await made();
  const report = { ...processReport(), survivors: [{ pid: 101, createdAt: 'test-identity' }] };
  const wrapped = api.wrapScratchSession({ close: async () => report }, owner, { clock });
  const result = await drive(clock, wrapped.close());
  assert.equal(result.ok, false);
  assert.equal(result.error instanceof api.ScratchSessionError, true);
  assert.equal(result.error.name, 'ScratchSessionError');
  assert.equal(result.error.code, 'ERR_SCRATCH_SESSION');
  assert.equal(result.error.message, 'close() did not confirm both the owned process end state and owned scratch absence');
  assert.equal(Object.isFrozen(result.error), true);
  assert.equal(Object.isFrozen(result.error.outcome), true);
  assert.throws(() => { result.error.outcome = {}; }, TypeError);
});
test('U007-M030: sparse array length caps and ordinary length accessors keep distinct validation boundaries', () => {
  assert.throws(() => core.frozenCopy(new Array(513)), { code: 'ERR_SCRATCH_REPORT', message: 'report entry limit' });
  let reads = 0;
  assert.throws(() => core.frozenCopy({ get length() { reads += 1; throw Error('length accessor must not execute'); } }), {
    code: 'ERR_SCRATCH_REPORT', message: 'report accessors are not accepted',
  });
  assert.equal(reads, 0);
});
