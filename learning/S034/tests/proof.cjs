'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const lesson = path.resolve(__dirname, '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Proof cannot contain symbolic links');
      return entry.isDirectory() ? files(target) : [target];
    });
}

function proofSnapshot() {
  const entries = [path.join(lesson, 'evidence.json'), ...files(path.join(lesson, 'evidence'))]
    .filter((file) => fs.existsSync(file))
    .map((file) => ({ path: path.relative(lesson, file), sha256: sha256(fs.readFileSync(file)) }));
  return { count: entries.length, sha256: sha256(JSON.stringify(entries)), entries };
}

module.exports = { files, lesson, sha256, proofSnapshot };
