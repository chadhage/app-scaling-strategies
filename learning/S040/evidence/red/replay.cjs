'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

function loadSnapshot(name, filename) {
  const snapshot = new Module(filename, module);
  snapshot.filename = filename;
  snapshot.paths = module.paths;
  snapshot._compile(fs.readFileSync(path.join(__dirname, name), 'utf8'), filename);
  return snapshot.exports;
}

globalThis.__S040_RED_MODEL__ = loadSnapshot(
  'model.stub.snapshot', path.join(__dirname, 'model.stub.cjs'),
);
loadSnapshot(
  'assertion.source.snapshot', path.join(__dirname, 'assertion.cjs'),
);
