'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { hash, normalize } = require('..\\pins.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
function snapshot(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    if (directory === path.join(root, 'tests') && entry.name === 'io-scratch') return [];
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink() || fs.realpathSync(file) !== file) throw new Error('No linked inventory input.');
    if (entry.isDirectory()) return [{ path: path.relative(repository, file), kind: 'directory' }, ...snapshot(file)];
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 8388608) throw new Error('Exact regular inventory file required.');
    const bytes = fs.readFileSync(file);
    const record = { path: path.relative(repository, file), kind: 'file', bytes: bytes.length, rawSha256: hash(bytes) };
    if (/\.(?:json|js|cjs|ps1|html|css|md|feature)$/.test(file)) record.crlfToLfSha256 = hash(normalize(bytes));
    return [record];
  });
}
module.exports = Object.freeze({ root, repository, snapshot });
