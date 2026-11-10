'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../scratch.cjs');
const api = require('../scratch-session.cjs');
const { ManualClock, fakeFileSystem, drive } = require('./u007-support.cjs');
const parent = path.resolve('owned-parent'), root = path.join(parent, 'session-owned');
async function made(adapt = (adapter) => adapter) {
  const clock = new ManualClock(), fake = fakeFileSystem(parent, clock);
  const owner = core.createScratchOwner({ parent, clock, fs: adapt(fake.adapter) });
  await owner.mkdir(root);
  return { clock, fake, owner };
}
test('U007-M072: false removal success retains the exact confirmation path, code and diagnostic', async () => {
  const { clock, owner } = await made((adapter) => ({ ...adapter, remove: async () => {} }));
  const report = (await drive(clock, owner.cleanup())).value;
  assert.deepEqual(report.errors, [{ path: root, phase: 'confirmation', code: 'ERR_SCRATCH_NOT_REMOVED',
    message: 'removal returned success but the fresh observation still finds scratch' }]);
  assert.equal(report.attempts.length, 1);
  assert.deepEqual(report.delays, []);
});
test('U007-M073: expiry after enumeration cannot fabricate a removal attempt or change the refusal phase', async () => {
  const { clock, fake, owner } = await made();
  fake.state.beforeRead = async () => { clock.t = 200; };
  const report = (await drive(clock, owner.cleanup({ timeoutMs: 200 }))).value;
  assert.deepEqual(report.attempts, []);
  assert.deepEqual(report.unconfirmed, [{ path: root, phase: 'scan' }]);
  assert.equal(report.errors[0].phase, 'scan');
  assert.equal(fake.state.calls.length, 0);
});
test('U007-M074: aborting issued removal preserves that phase without starting a confirmation', async () => {
  const { clock, fake, owner } = await made();
  const controller = new AbortController();
  fake.state.beforeRemove = async () => { controller.abort(); await new Promise(() => {}); };
  const report = (await drive(clock, owner.cleanup({ signal: controller.signal }))).value;
  assert.deepEqual(report.errors, [{ path: root, phase: 'remove', code: 'ERR_SCRATCH_ABORTED',
    message: 'cleanup was aborted; issued I/O is unconfirmed' }]);
  assert.deepEqual(report.unconfirmed, [{ path: root, phase: 'remove' }]);
  assert.equal(report.code, 'ERR_SCRATCH_ABORTED');
});
test('U007-M075: coercible identity objects are refused before they can become filesystem identity', async () => {
  const boxed = new String('1');
  const { clock, fake, owner } = await made((adapter) => ({ ...adapter,
    lstat: async (target) => ({ ...await adapter.lstat(target), device: boxed }),
  }));
  const report = (await drive(clock, owner.cleanup())).value;
  assert.deepEqual(report.errors[0], { path: root, phase: 'creation-identity', code: 'ERR_SCRATCH_ADAPTER',
    message: 'filesystem identity is missing or malformed' });
  assert.equal(fake.state.calls.length, 0);
});
test('U007-M076: every filesystem method retains its caller-owned adapter receiver', async () => {
  const clock = new ManualClock(), fake = fakeFileSystem(parent, clock), adapter = {};
  for (const key of ['mkdir', 'lstat', 'remove', 'readDir']) adapter[key] = async function (...args) {
    assert.equal(this, adapter, key + ' receiver'); return fake.adapter[key](...args);
  };
  const owner = core.createScratchOwner({ parent, clock, fs: adapter });
  await owner.mkdir(root);
  assert.equal((await drive(clock, owner.cleanup())).value.clean, true);
});
test('U007-M077: an invalid direct-child path keeps the original unobserved native error', async (t) => {
  const original = Object.assign(Error('original native invalid-path refusal'), { code: 'EACCES' });
  let calls = 0;
  t.mock.method(fs.promises, 'mkdir', async () => { calls += 1; throw original; });
  const clock = new ManualClock(), fake = fakeFileSystem(parent, clock);
  const owner = core.createScratchOwner({ parent, clock, fs: fake.adapter });
  await assert.rejects(api.observeScratchCreation(owner, () => fs.promises.mkdir(path.join(parent, 'NUL'))), (error) => error === original);
  assert.equal(calls, 1);
  assert.deepEqual(owner.paths(), []);
});
test('U007-M078: non-object mkdir options retain asynchronous ownership rejection rather than a synchronous throw', async (t) => {
  t.mock.method(fs.promises, 'mkdir', async () => {});
  const clock = new ManualClock(), fake = fakeFileSystem(parent, clock);
  const owner = core.createScratchOwner({ parent, clock, fs: fake.adapter });
  let synchronous = false, rejection;
  await api.observeScratchCreation(owner, async () => {
    let pending;
    try { pending = fs.promises.mkdir(root, 448); }
    catch (error) { synchronous = true; rejection = error; return; }
    assert.equal(typeof pending.then, 'function');
    rejection = await pending.then(() => null, (error) => error);
  });
  assert.equal(synchronous, false);
  assert.equal(rejection.code, 'ERR_SCRATCH_OWNERSHIP');
});
test('U007-M079: a close started by an option getter retains the closed-owner diagnostic', async () => {
  const clock = new ManualClock(), fake = fakeFileSystem(parent, clock);
  const owner = core.createScratchOwner({ parent, clock, fs: fake.adapter });
  let closing;
  await assert.rejects(owner.mkdir(root, { get recursive() { closing = owner.cleanup(); return false; } }), {
    code: 'ERR_SCRATCH_CLOSED', message: 'an owner cannot create scratch after cleanup started',
  });
  assert.equal((await closing).confirmed, false);
  assert.equal(fake.entries.has(root), false);
});
