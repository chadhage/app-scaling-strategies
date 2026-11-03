'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function proof(directory = path.join(root, 'evidence'), hashes = {}) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) proof(file, hashes);
    else hashes[path.relative(root, file)] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  return hashes;
}
const before = proof();
assert.ok(Object.hasOwn(before, path.join('evidence', 'browser-acceptance-published-helper.json')), 'Capture deliberate published-helper actual-browser proof before testing ordinary-rerun preservation.');
const env = { ...process.env };
delete env.CAPTURE_BROWSER_EVIDENCE;
const result = spawnSync(process.execPath, [path.join(__dirname, 'browser.cjs')], {
  cwd: path.resolve(root, '..', '..'), env, encoding: 'utf8', timeout: 180000, maxBuffer: 2 * 1024 * 1024
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
assert.equal(result.status, 0, result.error?.message);
const after = proof();
assert.deepEqual(after, before, 'Ordinary browser verification must not write, replace or delete any historical proof.');
console.log(JSON.stringify({
  result: 'ordinary-browser-rerun-preserves-all-historical-proof',
  captureBrowserEvidence: false, historicalFiles: Object.keys(before).length,
  before, after, byteIdentical: true, runtime: process.version
}, null, 2));
