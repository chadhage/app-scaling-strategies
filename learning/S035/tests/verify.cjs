'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
function proofSnapshot() {
  const files = fs.readdirSync(path.join(root, 'evidence')).sort().map((file) => path.join(root, 'evidence', file));
  files.push(path.join(root, 'evidence.json'));
  return files.map((file) => [path.relative(root, file), crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);
}
const before = proofSnapshot();
const env = { ...process.env };
delete env.CAPTURE_BROWSER_EVIDENCE;
const args = [
  '--test', '--test-concurrency=1', '--test-reporter=tap',
  ...['callback.test.cjs', 'syntax.test.cjs', 'integrity.test.cjs', 'browser.test.cjs']
    .map((file) => path.join('learning', 'S035', 'tests', file)),
];
const result = spawnSync(process.execPath, args, { cwd: repo, env, stdio: 'inherit' });
assert.deepEqual(proofSnapshot(), before, 'Ordinary verification must preserve every proof byte and inventory');
console.log(`Read-only proof check: ${before.length} files unchanged; child browser capture explicitly unset.`);
if (result.error) throw result.error;
process.exitCode = result.status === null ? 1 : result.status;
