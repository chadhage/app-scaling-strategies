'use strict';

// Evidence tooling, not production code: replays a RED against the code as it stood at the END of the second round (the
// working tree the third round started from, retained in old-subject-r2\<name>.txt). Loaded with NODE_OPTIONS=--require
// (children inherit it), it replaces the source of every production file directly in the namespace at the moment Node
// compiles it AND when it is read (the DOM stub and the server read page files). Test files are never touched. Without it
// the same tests run against the final code, so one unchanged test file is both the RED and the GREEN.
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const namespace = path.resolve(__dirname, '..', '..');
const snapshots = path.join(__dirname, 'old-subject-r2');
const compile = Module.prototype._compile;
const read = fs.readFileSync;
const snapshotOf = (resolved) => (path.dirname(resolved) === namespace ? path.join(snapshots, `${path.basename(resolved)}.txt`) : null);

Module.prototype._compile = function replaced(content, filename) {
  const snapshot = snapshotOf(path.resolve(filename));
  if (snapshot !== null && fs.existsSync(snapshot)) return compile.call(this, read.call(fs, snapshot, 'utf8'), filename);
  return compile.call(this, content, filename);
};

fs.readFileSync = function replacedRead(file, ...rest) {
  if (typeof file === 'string') {
    const snapshot = snapshotOf(path.resolve(file));
    if (snapshot !== null && fs.existsSync(snapshot)) return read.call(fs, snapshot, ...rest);
  }
  return read.call(fs, file, ...rest);
};
