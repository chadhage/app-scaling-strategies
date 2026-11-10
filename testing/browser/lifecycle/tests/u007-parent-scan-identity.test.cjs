'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const subject = process.env.U007_SCRATCH_SUBJECT ??
  path.resolve('.git\\kanban-orchestrator\\execution-20261108-64927fc0\\scratch\\U007-final-20261110\\candidate\\testing\\browser\\lifecycle\\scratch.cjs');
const { createScratchOwner } = require(subject);
const identity = (id) => ({ kind: 'directory', device: '1', fileId: String(id), birth: String(id) });

for (const replaced of ['root', 'parent']) {
  test(`U007 parent: an identity replaced during the awaited scan never reaches removal (${replaced})`, async () => {
    const parent = 'C:\\u007-parent-race';
    const root = `${parent}\\session-owned`;
    const entries = new Map([['C:\\', identity(1)], [parent, identity(2)]]);
    const removed = [];
    let replacedOnce = false;
    const adapter = {
      mkdir: async (target) => { entries.set(target, identity(3)); },
      lstat: async (target) => {
        if (!entries.has(target)) throw Object.assign(new Error('not found'), { code: 'ENOENT' });
        return entries.get(target);
      },
      readDir: async () => {
        if (!replacedOnce) {
          replacedOnce = true;
          entries.set(replaced === 'root' ? root : parent, identity(99));
        }
        return [];
      },
      remove: async (target) => {
        removed.push({ path: target, fileId: entries.get(target)?.fileId });
        entries.delete(target);
      }
    };
    const owner = createScratchOwner({ parent, fs: adapter });
    assert.equal(owner.ok, true);
    await owner.mkdir(root);
    const outcome = await owner.cleanup();
    assert.equal(removed.length, 0, 'a successful pre-scan identity read is not deletion authority after an awaited scan');
    assert.equal(outcome.clean, false);
    assert.ok(outcome.remaining.includes(root));
    assert.ok(outcome.refused.some((item) => item.code === 'ERR_SCRATCH_OWNERSHIP'));
  });
}
