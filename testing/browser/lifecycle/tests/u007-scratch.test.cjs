'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { implementation, ManualClock, drive, fakeFileSystem } = require('./u007-support.cjs');
const { createScratchOwner } = implementation();
const parent = path.resolve('owned-parent');
async function made() {
  const clock = new ManualClock();
  const fake = fakeFileSystem(parent, clock);
  const owner = createScratchOwner({ parent, fs: fake.adapter, clock });
  assert.equal(owner.ok, true);
  const root = path.join(parent, 'session-owned');
  await owner.mkdir(root);
  fake.put(path.join(root, 'held.txt'), 'file');
  return { clock, fake, owner, root };
}
test('S001: unlocked owned scratch has one removal and a fresh absence confirmation', async () => {
  const { clock, fake, owner, root } = await made();
  const { value: result } = await drive(clock, owner.cleanup({ timeoutMs: 200, maxAttempts: 4 }));
  assert.equal(result.clean, true);
  assert.equal(result.confirmed, true);
  assert.deepEqual(result.removed, [root]);
  assert.deepEqual(result.remaining, []);
  assert.deepEqual(fake.state.calls, [{ path: root, atMs: 0 }]);
});
for (const code of ['EBUSY', 'EPERM', 'ENOTEMPTY']) {
  test(`S002: ${code} twice then success uses virtual attempts 0/25/75 and preserves failures`, async () => {
    const { clock, fake, owner } = await made();
    fake.state.failures = [code, code];
    const { value: result } = await drive(clock, owner.cleanup({ timeoutMs: 200, maxAttempts: 4 }));
    assert.equal(result.clean, true, 'transient lock must be recovered rather than one-attempt remainder');
    assert.deepEqual(fake.state.calls.map((c) => c.atMs), [0, 25, 75]);
    assert.deepEqual(result.delays.map((d) => d.ms), [25, 50]);
    assert.deepEqual(result.errors.filter((e) => e.phase === 'remove').map((e) => e.code), [code, code]);
    assert.equal(result.confirmed, true);
  });
}
test('S003: persistent lock has exactly four attempts and the precise still-held remainder', async () => {
  const { clock, fake, owner, root } = await made();
  fake.state.failures = ['EBUSY', 'EBUSY', 'EBUSY', 'EBUSY', 'EBUSY'];
  const { value: result } = await drive(clock, owner.cleanup({ timeoutMs: 200, maxAttempts: 4 }));
  assert.equal(result.clean, false);
  assert.equal(result.code, 'SCRATCH_REMAINING');
  assert.deepEqual(fake.state.calls.map((c) => c.atMs), [0, 25, 75, 175], 'finite retry count, not one-attempt cleanup');
  assert.deepEqual(result.remaining, [root, path.join(root, 'held.txt')]);
  assert.equal(clock.pending(), 0);
});
