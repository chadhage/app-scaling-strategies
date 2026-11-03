'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

if (process.env.CAPTURE_BROWSER_EVIDENCE === '1' || process.env.CAPTURE_TEST_EVIDENCE === '1') {
  throw new Error('Normal verification is read-only. Use the explicit capture commands separately.');
}
const root = __dirname;
const repo = path.resolve(root, '..', '..');
function proofSnapshot() {
  const result = {};
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else result[path.relative(root, target)] = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
    }
  }
  walk(path.join(root, 'evidence'));
  result['evidence.json'] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'evidence.json'))).digest('hex');
  return result;
}
const before = proofSnapshot();
let failed = false;
try {
  for (const args of [
    ['--test', '--test-reporter=tap', 'learning\\S043\\tests\\model.test.cjs', 'learning\\S043\\tests\\surface.test.cjs'],
    ['learning\\S043\\tests\\syntax.cjs'],
    ['learning\\S043\\tests\\integrity.cjs'],
    ['learning\\S043\\tests\\browser.cjs'],
  ]) {
    const result = spawnSync(process.execPath, args, {
      cwd: repo, windowsHide: true, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024,
    });
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    if (result.status !== 0) {
      if (result.error) process.stderr.write(`${result.error}\n`);
      failed = true;
      break;
    }
  }
} finally {
  assert.deepEqual(proofSnapshot(), before, 'Ordinary verification must not alter any retained proof');
}
process.stdout.write(`Read-only proof check PASS; verification ${failed ? 'FAIL' : 'PASS'}.\n`);
process.exitCode = failed ? 1 : 0;
