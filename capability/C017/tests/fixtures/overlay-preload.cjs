'use strict';

// Test tooling, not production code: node --require preload for the retained RED archives of the fix cycle after the independent review.
// C017_OVERLAY is a JSON map { "<repo-relative live file>": "<repo-relative retained pre-fix snapshot>" }. require() and fs.readFileSync()
// of a live file then see the retained pre-fix bytes, so the unchanged RED tests run against the code exactly as it was published.
// tests\fix-red.cjs loads it through NODE_OPTIONS, so the test files and every child process they start (the CLI in a small-heap child) see it.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const repo = path.resolve(__dirname, '..', '..', '..', '..');
const map = new Map(Object.entries(JSON.parse(process.env.C017_OVERLAY || '{}')).map(([live, snapshot]) => [path.resolve(repo, live), path.resolve(repo, snapshot)]));
const realRead = fs.readFileSync;

fs.readFileSync = function overlaidRead(file, ...rest) {
  const snapshot = typeof file === 'string' ? map.get(path.resolve(file)) : undefined;
  return realRead.call(this, snapshot || file, ...rest);
};

// Node loads .cjs files through the .js handler, so wrapping .js and .json covers every file of the namespace.
for (const extension of ['.js', '.json']) {
  const load = Module._extensions[extension];
  Module._extensions[extension] = function overlaidLoad(module, filename) {
    const snapshot = map.get(filename);
    if (!snapshot) return load.call(this, module, filename);
    const source = realRead.call(fs, snapshot, 'utf8');
    if (extension === '.json') {
      module.exports = JSON.parse(source);
      return undefined;
    }
    return module._compile(source, filename);
  };
}
