'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
assert.equal(process.argv.length, 2);
const mode = process.env.C027_RED_MODE || 'initial';
assert.ok(['initial', 'audit'].includes(mode));
const original = JSON.parse(fs.readFileSync(path.join(root, 'evidence', mode === 'initial' ? 'stub-load.json' : 'audit-red-provenance.json'), 'utf8'));
for (const { file, sha256 } of original.snapshots) {
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root, 'evidence', 'red', file))).digest('hex'), sha256);
}
const snapshots = mode === 'initial' ? [
  ['protocol.stub.js.txt', 'protocol.js'],
  ['fixture.stub.cjs.txt', 'fixture.cjs'],
  ['behavior.initial.cjs.txt', path.join('tests', 'behavior.test.cjs')]
] : [
  ['server.audit-red.cjs.txt', 'server.cjs'],
  ['http.audit-red.cjs.txt', path.join('tests', 'http.test.cjs')]
];
for (const [snapshot, target] of snapshots) {
  const filename = path.join(root, target);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  require.cache[filename] = loaded;
  loaded._compile(fs.readFileSync(path.join(root, 'evidence', 'red', snapshot), 'utf8'), filename);
  loaded.loaded = true;
}
