'use strict';

// Preload for the hermetic verifier cases in provenance.test.cjs. After the verifier's first child process returns, that is after its
// before snapshot, it applies exactly one change to the private copy, as another worker would in the middle of a run.
const childProcess = require('node:child_process');
const fs = require('node:fs');

const kind = process.env.C019_MUTATE_KIND;
const target = process.env.C019_MUTATE_FILE;
if (!['add', 'modify', 'remove'].includes(kind) || typeof target !== 'string' || target === '') {
  throw new Error('C019_MUTATE_KIND must be add, modify or remove and C019_MUTATE_FILE an absolute path.');
}
const original = childProcess.spawnSync;
let applied = false;
childProcess.spawnSync = function spawnSync(...args) {
  const result = original.apply(this, args);
  if (!applied) {
    applied = true;
    if (kind === 'add') fs.writeFileSync(target, 'added in the middle of the run\n', { flag: 'wx' });
    else if (kind === 'modify') fs.appendFileSync(target, 'x');
    else fs.rmSync(target);
  }
  return result;
};
