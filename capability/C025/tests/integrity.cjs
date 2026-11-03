'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
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
console.log(JSON.stringify({
  label: '[C025][S]', integrity: 'passed', ownedFiles: manifest.owned.length,
  unchangedDependencies: manifest.unchangedDependencies.length, proofWrites: false
}));
