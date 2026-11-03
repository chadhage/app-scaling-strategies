'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFileSync(path.join(root, file));
const json = file => JSON.parse(read(file).toString('utf8'));

function files(directory = root, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    assert.equal(entry.isSymbolicLink(), false, 'Owned lesson files cannot be symlinks');
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? files(path.join(directory, entry.name), relative) : [relative];
  }).sort();
}

function snapshot() {
  return files().map(file => ({ path: file, sha256: sha(read(file)) }));
}

function inputHashes() {
  return files().filter(file => !file.startsWith(`evidence${path.sep}`))
    .map(file => ({ path: file, sha256: sha(read(file)) }));
}

function raw(record) {
  const bytes = read(path.join('evidence', record.path));
  assert.equal(bytes.length, record.bytes);
  assert.equal(sha(bytes), record.sha256);
  return bytes;
}

module.exports = { root, repo, sha, read, json, files, snapshot, inputHashes, raw };
