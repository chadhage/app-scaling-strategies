'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const evidence = path.join(__dirname, 'evidence');
if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
  throw new Error('Normal verification is read-only. Use the explicit browser capture command instead.');
}
function proofHashes() {
  const hashes = {};
  function walk(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, item.name);
      if (item.isDirectory()) walk(target);
      else hashes[path.relative(evidence, target)] = crypto.createHash('sha256')
        .update(fs.readFileSync(target)).digest('hex');
    }
  }
  walk(evidence);
  return hashes;
}
const before = JSON.stringify(proofHashes());
const files = ['core', 'model', 'surface', 'syntax', 'integrity', 'browser']
  .map((name) => path.join(__dirname, 'tests', `${name}.test.cjs`));
const child = spawnSync(process.execPath, [
  '--test', '--test-concurrency=1', '--test-reporter=tap', ...files,
], {
  cwd: root,
  env: { ...process.env, CAPTURE_BROWSER_EVIDENCE: '' },
  encoding: 'utf8',
  timeout: 180000,
  maxBuffer: 8 * 1024 * 1024,
  windowsHide: true,
});
process.stdout.write(child.stdout || '');
process.stderr.write(child.stderr || '');
if (JSON.stringify(proofHashes()) !== before) {
  console.error('FAIL: normal verification changed retained proof.');
  process.exitCode = 1;
} else if (child.error || child.signal || child.status !== 0) {
  console.error(child.error ? child.error.message : `Verification exited ${child.status}.`);
  process.exitCode = 1;
} else {
  console.log('S042 focused verification passed; retained proof byte-for-byte unchanged.');
}
