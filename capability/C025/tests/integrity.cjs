'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--committed'));
const committed = args[0] === '--committed';
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'integrity.json'), 'utf8'));
assert.equal(manifest.label, '[C025][S]');
const actualFiles = fs.readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
  .filter((file) => file !== path.join('evidence', 'integrity.json')).sort();
assert.deepEqual(actualFiles, manifest.owned.map((entry) => entry.path).sort(), 'Owned inventory changed; refresh proof deliberately, not during verification.');
for (const entry of manifest.owned) {
  const file = path.resolve(root, entry.path);
  assert.ok(file.startsWith(`${root}${path.sep}`), 'Owned hash path escaped C025.');
  assert.equal(hash(file), entry.sha256, `Owned bytes changed: ${entry.path}`);
}
for (const entry of manifest.unchangedDependencies) {
  const file = path.resolve(repo, entry.path);
  assert.ok(file.startsWith(`${repo}${path.sep}`), 'Dependency hash path escaped the repository.');
  assert.equal(hash(file), entry.sha256, `Unchanged dependency differs: ${entry.path}`);
}
if (committed) {
  const entries = [...manifest.owned, {
    path: path.join('evidence', 'integrity.json'), sha256: hash(path.join(root, 'evidence', 'integrity.json'))
  }];
  const result = spawnSync('git', ['cat-file', '--batch'], {
    cwd: repo,
    input: entries.map((entry) => `HEAD:capability/C025/${entry.path.split(path.sep).join('/')}\n`).join(''),
    timeout: 30000, maxBuffer: 8 * 1024 * 1024
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr.toString());
  let offset = 0;
  for (const entry of entries) {
    const newline = result.stdout.indexOf(10, offset);
    assert.ok(newline > offset, `Missing committed blob: ${entry.path}`);
    const header = result.stdout.subarray(offset, newline).toString('ascii');
    assert.match(header, /^[a-f0-9]{40} blob \d+$/);
    const size = Number(header.split(' ')[2]);
    offset = newline + 1;
    const digest = createHash('sha256').update(result.stdout.subarray(offset, offset + size)).digest('hex');
    assert.equal(digest, entry.sha256, `Committed bytes differ from sealed proof: ${entry.path}`);
    offset += size;
    assert.equal(result.stdout[offset++], 10);
  }
  assert.equal(offset, result.stdout.length);
}
console.log(JSON.stringify({
  label: '[C025][S]', integrity: 'passed', ownedFiles: manifest.owned.length,
  unchangedDependencies: manifest.unchangedDependencies.length, proofWrites: false,
  committedBytesVerified: committed
}));
