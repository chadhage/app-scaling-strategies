'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const owned = __dirname;
const env = { ...process.env };
delete env.CAPTURE_BROWSER_EVIDENCE;
function proofHashes() {
  const hashes = {};
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else hashes[path.relative(owned, file)] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
  }
  visit(path.join(owned, 'evidence'));
  const summary = path.join(owned, 'evidence.json');
  if (fs.existsSync(summary)) hashes['evidence.json'] = crypto.createHash('sha256').update(fs.readFileSync(summary)).digest('hex');
  return hashes;
}
const before = proofHashes();
const stages = [
  ['model/surface', ['--test', path.join(owned, 'tests', 'model.test.cjs'), path.join(owned, 'tests', 'surface.test.cjs')]],
  ['syntax', [path.join(owned, 'tests', 'syntax.cjs')]],
  ['existing signed tooling', [path.join(owned, 'tests', 'tooling.cjs')]],
  ['actual isolated DOM/keyboard/error/reset/failure/CSP', [path.join(owned, 'tests', 'browser.cjs')]],
  ['evidence integrity and frozen RED replay', [path.join(owned, 'tests', 'integrity.cjs')]],
];
let failure;
try {
  for (const [name, args] of stages) {
    const result = spawnSync(process.execPath, args, { cwd: path.resolve(owned, '..', '..'), env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    if (result.error || result.signal || result.status !== 0) {
      console.error(result.stdout, result.stderr);
      throw new Error(`${name}: verification failed (${result.status}); ${result.error?.message || result.signal || ''}`);
    }
    const tests = result.stdout.match(/^# tests (\d+)$/m);
    console.log(`PASS ${name}${tests ? ` (${tests[1]} tests)` : ''}`);
  }
} catch (error) {
  failure = error;
} finally {
  assert.deepEqual(proofHashes(), before, 'Ordinary verification must not write, remove, or alter proof.');
  console.log('PASS published proof unchanged byte-for-byte; browser capture flag removed for this read-only rerun');
}
if (failure) { console.error(failure.stack); process.exitCode = 1; }
