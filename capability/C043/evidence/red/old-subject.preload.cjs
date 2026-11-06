'use strict';

// Evidence tooling, not production code: replays a RED against the code of the FIRST publication (kanban/C043/88fd6b086069).
// Loaded with NODE_OPTIONS=--require, it replaces the source of every production file of this namespace by the retained
// snapshot old-subject\<name>.txt at the moment Node compiles it (children inherit it). Test files are never touched.
// Without it the same tests run against the final code, so one unchanged test file is both the RED and the GREEN.
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const namespace = path.resolve(__dirname, '..', '..');
const snapshots = path.join(__dirname, 'old-subject');
const compile = Module.prototype._compile;

Module.prototype._compile = function replaced(content, filename) {
  const resolved = path.resolve(filename);
  if (path.dirname(resolved) === namespace) {
    const snapshot = path.join(snapshots, `${path.basename(resolved)}.txt`);
    if (fs.existsSync(snapshot)) return compile.call(this, fs.readFileSync(snapshot, 'utf8'), filename);
  }
  return compile.call(this, content, filename);
};
