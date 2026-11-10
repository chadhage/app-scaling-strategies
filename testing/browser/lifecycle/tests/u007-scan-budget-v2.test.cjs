'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ManualClock, drive } = require('./u007-support.cjs');
const { createScratchOwner } = require(process.env.U007_SCRATCH_SUBJECT || path.resolve(__dirname, '..', 'scratch.cjs'));
test('U007-V2: expiry during the final revalidation cannot fabricate a destructive attempt', async () => {
  const clock = new ManualClock(), parent = 'C:\\u007-v2-budget', root = parent + '\\owned';
  const identity = (id) => ({ kind: 'directory', device: '1', fileId: String(id), birth: String(id) });
  const entries = new Map([['C:\\', identity(1)], [parent, identity(2)]]);
  const removed = [];
  let scanned = false;
  const owner = createScratchOwner({ parent, clock, fs: {
    mkdir: async () => entries.set(root, identity(3)),
    lstat: async (target) => {
      if (scanned && target === root) clock.t = 200;
      if (!entries.has(target)) throw Object.assign(new Error('gone'), { code: 'ENOENT' });
      return entries.get(target);
    },
    readDir: async () => { scanned = true; return []; },
    remove: async (target) => { removed.push(target); entries.delete(target); },
  } });
  await owner.mkdir(root);
  const outcome = (await drive(clock, owner.cleanup({ timeoutMs: 200 }))).value;
  assert.deepEqual(removed, []);
  assert.deepEqual(outcome.attempts, []);
  assert.equal(outcome.clean, false);
  assert.equal(outcome.code, 'ERR_SCRATCH_DEADLINE');
});
