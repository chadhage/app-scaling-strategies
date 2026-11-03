'use strict';

const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { proofSnapshot } = require('.\\tests\\proof.cjs');

const root = path.resolve(__dirname, '..', '..');
const before = proofSnapshot();
const env = { ...process.env };
delete env.CAPTURE_BROWSER_EVIDENCE;
delete env.S034_CAPTURE_NAME;
let status = 0;
for (const tests of [['model', 'syntax', 'integrity'], ['browser']]) {
  const result = spawnSync(process.execPath,
    ['--test', ...tests.map((name) => `learning\\S034\\tests\\${name}.test.cjs`)],
    { cwd: root, env, encoding: 'utf8', timeout: 180000 });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) { status = result.status || 1; break; }
}
assert.deepEqual(proofSnapshot(), before, 'Normal verification must not modify, create or remove proof bytes');
console.log(`Read-only proof verified: ${before.count} files; SHA256 ${before.sha256}`);
process.exitCode = status;
