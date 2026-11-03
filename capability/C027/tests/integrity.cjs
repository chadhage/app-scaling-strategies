'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--committed'));
const committed = args[0] === '--committed';
const seal = path.join(root, 'evidence', 'integrity.json');
const manifest = JSON.parse(fs.readFileSync(seal, 'utf8'));
assert.equal(manifest.label, '[C027][S]');
const actual = fs.readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile()).map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
  .filter((file) => file !== path.join('evidence', 'integrity.json')).sort();
assert.deepEqual(actual, manifest.owned.map((entry) => entry.path).sort(), 'Owned inventory changed; ordinary verification never refreshes proof.');
for (const entry of manifest.owned) {
  const file = path.resolve(root, entry.path);
  assert.ok(file.startsWith(`${root}${path.sep}`), 'The owned inventory cannot escape C027.');
  assert.equal(sha256(fs.readFileSync(file)), entry.sha256, `Owned bytes changed: ${entry.path}`);
}
for (const entry of manifest.unchangedDependencies) {
  const file = path.resolve(repo, entry.path);
  assert.ok(file.startsWith(`${repo}${path.sep}`), 'The dependency inventory cannot escape the repository.');
  assert.equal(sha256(fs.readFileSync(file)), entry.sha256, `Unchanged dependency differs: ${entry.path}`);
}
for (const stage of fs.readdirSync(path.join(root, 'evidence')).filter((file) => file.endsWith('.stdout.gz'))) {
  const { gunzipSync } = require('node:zlib');
  const name = stage.slice(0, -'.stdout.gz'.length);
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'evidence', `${name}.json`), 'utf8'));
  for (const stream of ['stdout', 'stderr']) {
    const bytes = gunzipSync(fs.readFileSync(path.join(root, 'evidence', `${name}.${stream}.gz`)));
    assert.equal(sha256(bytes), metadata[`${stream}Sha256`], `Retained ${name}/${stream} differs from its capture.`);
  }
}
if (committed) {
  const entries = [...manifest.owned, { path: path.join('evidence', 'integrity.json'), sha256: sha256(fs.readFileSync(seal)) }];
  const result = spawnSync('git', ['cat-file', '--batch'], {
    cwd: repo,
    input: entries.map((entry) => `HEAD:capability/C027/${entry.path.split(path.sep).join('/')}\n`).join(''),
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
    assert.equal(sha256(result.stdout.subarray(offset, offset + size)), entry.sha256, `Committed bytes differ: ${entry.path}`);
    offset += size;
    assert.equal(result.stdout[offset++], 10);
  }
  assert.equal(offset, result.stdout.length);
}
console.log(JSON.stringify({
  label: '[C027][S]', integrity: 'passed', ownedFiles: manifest.owned.length,
  unchangedDependencies: manifest.unchangedDependencies.length,
  committedBytesVerified: committed, proofWrites: false
}));
