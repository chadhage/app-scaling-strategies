'use strict';

// Evidence tooling, not production code: replays the RED of the first review's F2, F6 and F7 against the FIRST publication
// (kanban/C043/88fd6b086069). Loaded with NODE_OPTIONS=--require, it replaces the source of tests\evidence.cjs at the moment
// Node compiles it, and the bytes of README.md when they are read, by the retained snapshots in old-subject-tests (shown
// elsewhere to be exactly the git blobs of that commit). Without it the same test file runs against the final bytes.
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const namespace = path.resolve(__dirname, '..', '..');
const snapshots = path.join(__dirname, 'old-subject-tests');
const evidence = path.join(namespace, 'tests', 'evidence.cjs');
const readme = path.join(namespace, 'README.md');
const compile = Module.prototype._compile;
const read = fs.readFileSync;

Module.prototype._compile = function replaced(content, filename) {
  if (path.resolve(filename) === evidence) return compile.call(this, read.call(fs, path.join(snapshots, 'evidence.cjs.txt'), 'utf8'), filename);
  return compile.call(this, content, filename);
};

fs.readFileSync = function replacedRead(file, ...rest) {
  if (typeof file === 'string' && path.resolve(file) === readme) return read.call(fs, path.join(snapshots, 'README.md.txt'), ...rest);
  return read.call(fs, file, ...rest);
};
