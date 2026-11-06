'use strict';

// Evidence tooling, not production code: replays the RED of the load flake against the FIRST version of the resource
// test. Loaded with NODE_OPTIONS=--require (children inherit it), it replaces the source of tests\resources.test.cjs by
// the retained snapshot old-subject-tests\resources.test.cjs.txt at the moment Node compiles it (the snapshot is shown
// elsewhere to be exactly the git blob of the first publication). Without it the same test runs the final resource test.
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const target = path.resolve(__dirname, '..', '..', 'tests', 'resources.test.cjs');
const snapshot = path.join(__dirname, 'old-subject-tests', 'resources.test.cjs.txt');
const compile = Module.prototype._compile;

Module.prototype._compile = function replaced(content, filename) {
  if (path.resolve(filename) === target) return compile.call(this, fs.readFileSync(snapshot, 'utf8'), filename);
  return compile.call(this, content, filename);
};
