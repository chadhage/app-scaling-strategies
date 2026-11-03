'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
assert.deepEqual(process.argv.slice(2), ['--capture'], 'Sealing is deliberate, never part of ordinary verification.');
const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifestPath = path.join(root, 'evidence', 'integrity.json');
assert.equal(fs.existsSync(manifestPath), false, 'An immutable seal cannot be overwritten.');
const files = fs.readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
assert.equal(files.some((file) => /^runtime-.*\.html$/.test(path.basename(file))), false, 'Clean up the exact runtime conductor before sealing.');
const dependencies = [
  path.join('testing', 'browser', 'isolated.cjs'),
  path.join('capability', 'C020', 'contract.js'),
  path.join('capability', 'C020', 'profiles.cjs'),
  path.join('capability', 'C001', 'contract-guard.js'),
  path.join('capability', 'C001', 'approved-contract.js')
];
const manifest = {
  label: '[C027][S]', schemaVersion: 1, algorithm: 'SHA-256',
  scope: 'exact owned bytes excluding only this seal; unchanged dependencies read, never edited',
  owned: files.map((file) => ({ path: path.relative(root, file), sha256: sha256(file) }))
    .sort((a, b) => a.path.localeCompare(b.path)),
  unchangedDependencies: dependencies.map((file) => ({ path: file, sha256: sha256(path.join(repo, file)) }))
};
assert.equal(manifest.unchangedDependencies[0].sha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ label: '[C027][S]', sealed: true, ownedFiles: manifest.owned.length, unchangedDependencies: dependencies.length }));
