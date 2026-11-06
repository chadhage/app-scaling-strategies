'use strict';

// Test tooling, not production code: the RED replay of the third fix. load(name) returns the namespace file as it is, or, when C059_RED_SUBJECT names a folder that holds a file of
// that name, those OLD bytes compiled as if they lived in the namespace root (so that their relative paths to the page assets, C041 and C042 resolve exactly as they did when the
// bytes were published). The same test files then run against the old subject (the RED) and against the final code (the replay): there is no edited copy of a test.
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function load(name) {
  const folder = process.env.C059_RED_SUBJECT ? path.resolve(process.env.C059_RED_SUBJECT) : null;
  const old = folder === null ? null : path.join(folder, name);
  if (old === null || !fs.existsSync(old)) return require(path.join(root, name));
  const virtual = path.join(root, name);
  const loaded = new Module(virtual, null);
  loaded.filename = virtual;
  loaded.paths = Module._nodeModulePaths(root);
  loaded._compile(fs.readFileSync(old, 'utf8'), virtual);
  return loaded.exports;
}

module.exports = Object.freeze({ load });
