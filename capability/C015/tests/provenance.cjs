'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function readOwned(relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || /[:\0]/.test(relative)) throw new Error('Invalid owned evidence path.');
  const file = path.resolve(root, relative);
  const name = path.relative(root, file);
  if (name === '..' || name.startsWith(`..${path.sep}`) || path.isAbsolute(name)) throw new Error('Evidence path leaves C015.');
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024 ||
      path.relative(file, fs.realpathSync(file)) !== '') throw new Error('Evidence must be a readable owned regular file.');
  return fs.readFileSync(file);
}

function inventory() {
  const files = {};
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (directory === root && ['test-scratch', 'browser-scratch'].includes(entry.name)) continue;
      if (entry.isSymbolicLink()) throw new Error('Source/evidence inventory will not follow symlinks.');
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) files[path.relative(root, file)] = sha(fs.readFileSync(file));
      else throw new Error('Unexpected source/evidence file type.');
    }
  }
  visit(root);
  return files;
}

module.exports = Object.freeze({ root, repo, sha, readOwned, inventory });
