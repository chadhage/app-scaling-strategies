'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ManualClock, drive } = require('./u007-support.cjs');
const { createScratchOwner } = require(process.env.U007_SCRATCH_SUBJECT || path.resolve(__dirname, '..', 'scratch.cjs'));
test('U007-V2: confirmed disappearance after failed removal is reported once, without an unnecessary retry', async () => {
  const clock = new ManualClock(), parent = 'C:\\u007-v2-absence', root = parent + '\\owned';
  const identity = (id) => ({ kind: 'directory', device: '1', fileId: String(id), birth: String(id) });
  const entries = new Map([['C:\\', identity(1)], [parent, identity(2)]]);
  const removed = [];
  let reads = 0;
  const owner = createScratchOwner({ parent, clock, fs: {
    mkdir: async () => entries.set(root, identity(3)),
    lstat: async (target) => {
      if (!entries.has(target)) throw Object.assign(new Error('gone'), { code: 'ENOENT' });
      return entries.get(target);
    },
    readDir: async () => { if (++reads === 2) entries.delete(root); return []; },
    remove: async (target) => { removed.push(target); throw Object.assign(new Error('held'), { code: 'EBUSY' }); },
  } });
  await owner.mkdir(root);
  const outcome = (await drive(clock, owner.cleanup({ timeoutMs: 200, maxAttempts: 4 }))).value;
  assert.equal(outcome.clean, true);
  assert.equal(outcome.confirmed, true);
  assert.deepEqual(outcome.removed, [root]);
  assert.deepEqual(outcome.remaining, []);
  assert.deepEqual(outcome.delays, []);
  assert.deepEqual(removed, [root]);
  assert.equal(outcome.attempts.length, 1);
});
