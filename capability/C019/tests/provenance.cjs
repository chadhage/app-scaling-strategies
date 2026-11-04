'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function inventory(target = root, skip = new Set(['publication.json'])) {
  const result = {};
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(directory, entry.name);
      const relative = path.relative(target, full);
      if (skip.has(relative)) continue;
      assert.equal(entry.isSymbolicLink(), false, 'Verification will not follow unexpected links.');
      if (entry.isDirectory()) walk(full);
      else {
        assert.equal(entry.isFile(), true);
        result[relative] = sha(fs.readFileSync(full));
      }
    }
  }
  walk(target);
  return result;
}

function dependencies() {
  const result = {};
  for (const card of ['C001', 'C002', 'C015']) {
    const values = inventory(path.join(repo, 'capability', card), new Set(['test-scratch', 'publication.json']));
    for (const [file, digest] of Object.entries(values)) result[`capability\\${card}\\${file}`] = digest;
  }
  result['testing\\browser\\isolated.cjs'] = sha(fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs')));
  return result;
}

module.exports = Object.freeze({ root, repo, sha, inventory, dependencies });
