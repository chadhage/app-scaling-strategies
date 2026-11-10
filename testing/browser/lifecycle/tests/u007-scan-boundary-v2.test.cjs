'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const subject = process.env.U007_SCRATCH_SUBJECT || path.resolve(__dirname, '..', 'scratch.cjs');
const { createScratchOwner } = require(subject);
const identity = (id) => ({ kind: 'directory', device: '1', fileId: String(id), birth: String(id) });
const parent = 'C:\\u007-v2-scan', root = parent + '\\owned', nested = root + '\\nested';
async function scenario(change, options = {}) {
  const entries = new Map([['C:\\', identity(1)], [parent, identity(2)]]);
  const removed = [];
  let reads = 0;
  const adapter = {
    mkdir: async () => { entries.set(root, identity(3)); if (options.nested) entries.set(nested, identity(4)); },
    lstat: async (target) => {
      if (!entries.has(target)) throw Object.assign(new Error('gone'), { code: 'ENOENT' });
      return entries.get(target);
    },
    readDir: async (target) => {
      reads += 1;
      await change({ entries, removed, reads, target });
      return options.nested && target === root ? [{ name: 'nested', kind: 'directory' }] : [];
    },
    remove: async (target) => {
      removed.push(target);
      if (options.busy) throw Object.assign(new Error('held'), { code: 'EBUSY' });
      entries.delete(target);
    },
  };
  const owner = createScratchOwner({ parent, fs: adapter });
  assert.equal(owner.ok, true);
  await owner.mkdir(root);
  const outcome = await owner.cleanup({ maxAttempts: options.attempts || 1, timeoutMs: 2000 });
  return { outcome, removed, entries };
}
for (const replaced of [root, parent]) {
  test(`U007-V2: replacement while awaiting descendant readDir is refused before removal (${replaced === root ? 'root' : 'ancestor'})`, async () => {
    const result = await scenario(({ entries, target }) => {
      if (target === nested) entries.set(replaced, identity(99));
    }, { nested: true });
    assert.deepEqual(result.removed, []);
    assert.equal(result.outcome.clean, false);
    assert.ok(result.outcome.remaining.includes(root));
    assert.ok(result.outcome.refused.some((entry) => entry.code === 'ERR_SCRATCH_OWNERSHIP'));
    assert.ok(result.outcome.errors.some((entry) => entry.phase === 'verification'));
  });
}
test('U007-V2: root disappearance during the pre-removal scan confirms absence without a destructive call', async () => {
  const { outcome, removed } = await scenario(({ entries }) => entries.delete(root));
  assert.deepEqual(removed, []);
  assert.equal(outcome.clean, true);
  assert.equal(outcome.confirmed, true);
  assert.deepEqual(outcome.remaining, []);
  assert.deepEqual(outcome.removed, [root]);
});
test('U007-V2: root disappearance during the remaining scan is freshly confirmed within the original attempt', async () => {
  const { outcome, removed } = await scenario(({ entries, reads }) => { if (reads === 2) entries.delete(root); }, { busy: true });
  assert.deepEqual(removed, [root]);
  assert.equal(outcome.clean, true);
  assert.equal(outcome.confirmed, true);
  assert.deepEqual(outcome.remaining, []);
  assert.ok(outcome.errors.some((entry) => entry.code === 'EBUSY'));
});
test('U007-V2: an ancestor replaced during the remaining scan gets a typed refusal, not a stale scan report', async () => {
  const { outcome, removed } = await scenario(({ entries, reads }) => { if (reads === 2) entries.set(parent, identity(99)); }, { busy: true });
  assert.deepEqual(removed, [root]);
  assert.equal(outcome.clean, false);
  assert.equal(outcome.confirmed, false);
  assert.ok(outcome.refused.some((entry) => entry.code === 'ERR_SCRATCH_OWNERSHIP'));
  assert.ok(outcome.errors.some((entry) => entry.phase === 'verification'));
});
test('U007-V2: every retry revalidates after its own awaited scan before issuing another removal', async () => {
  const { outcome, removed } = await scenario(({ entries, reads }) => { if (reads === 3) entries.set(root, identity(99)); }, { busy: true, attempts: 4 });
  assert.deepEqual(removed, [root]);
  assert.equal(outcome.attempts.length, 1);
  assert.equal(outcome.clean, false);
  assert.ok(outcome.refused.some((entry) => entry.code === 'ERR_SCRATCH_OWNERSHIP'));
});
