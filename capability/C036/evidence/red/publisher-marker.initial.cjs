'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', '..');
test('opaque historical recovery candidate is not a current approval invariant', () => {
  const history = JSON.parse(fs.readFileSync(path.join(root, 'publisher-candidate-history.json'), 'utf8'));
  const filename = path.join(root, 'publisher-provenance.cjs');
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(root);
  loaded._compile(fs.readFileSync(path.join(root, history.snapshots['publisher-provenance.cjs'].path), 'utf8'), filename);
  const current = require('..\\..\\tests\\publisher-controls.cjs').control();
  current.publicationHeld = 'cd5cdecd14fcb296b30e2cfe182b62421ba98489';
  assert.equal(loaded.exports.assessAuthority(current).approved, true,
    'An opaque retained recovery commit marker must not veto otherwise valid current canonical approval.');
});
