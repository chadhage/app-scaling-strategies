'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const owned = __dirname;
const repo = path.resolve(owned, '..', '..');
if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') throw new Error('Normal verification is read-only. Unset CAPTURE_BROWSER_EVIDENCE.');

function inventory(directory = owned) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink()) throw new Error('Unexpected owned symlink');
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? inventory(file) : [{
      path: path.relative(owned, file),
      sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    }];
  }).sort((a, b) => a.path.localeCompare(b.path));
}

function node(args) {
  const result = spawnSync(process.execPath, args, { cwd: repo, stdio: 'inherit', windowsHide: true, timeout: 180000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Verification command failed: ${args.join(' ')} (exit ${result.status})`);
}

const before = inventory();
const scripts = before.filter((file) => /\.(?:cjs|js)$/.test(file.path) && !file.path.startsWith('evidence\\'));
scripts.forEach((file) => node(['--check', path.join('learning', 'S072', file.path)]));
console.log(`Syntax: ${scripts.length} owned JavaScript files passed.`);
if (process.argv[2] !== '--syntax-only') {
  if (process.argv.length > 2) throw new Error('Only --syntax-only is supported.');
  node(['--test', '--test-reporter=tap', '--test-concurrency=1',
    ...['model', 'source', 'integrity', 'browser'].map((name) => path.join('learning', 'S072', 'tests', `${name}.test.cjs`))]);
}
assert.deepEqual(inventory(), before, 'normal verification must leave all owned source and evidence bytes unchanged');
console.log(`Read-only verification: all ${before.length} owned source/evidence files unchanged.`);
