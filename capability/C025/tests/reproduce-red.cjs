'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const mode = process.argv[2] || 'initial';
assert.ok(['initial', 'refinement'].includes(mode));
assert.ok(process.argv.length <= 3);

function compile(snapshot, relativeFilename) {
  const filename = path.join(root, relativeFilename);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  require.cache[filename] = loaded;
  loaded._compile(fs.readFileSync(path.join(root, 'evidence', 'red', snapshot), 'utf8'), filename);
  loaded.loaded = true;
}

if (mode === 'initial') {
  const original = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'stub-load.json'), 'utf8'));
  for (const { file, sha256 } of original.snapshots) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root, 'evidence', 'red', file))).digest('hex'), sha256);
  }
  compile('artifact.stub.cjs.txt', 'artifact.cjs');
  compile('artifact.initial.snapshot.cjs.txt', path.join('tests', 'artifact.test.cjs'));
} else {
  compile('download.refinement.js.txt', 'download.js');
  compile('server.refinement.cjs.txt', 'server.cjs');
  compile('download.refinement.snapshot.cjs.txt', path.join('tests', 'download.test.cjs'));
  compile('http.refinement.snapshot.cjs.txt', path.join('tests', 'http.test.cjs'));
}
