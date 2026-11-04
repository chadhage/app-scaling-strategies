'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const childProcess = require('node:child_process');
const path = require('node:path');
const { load } = require('./support.cjs');
const sources = require('../sources.cjs');
const pins = require('..\\..\\C036\\pins.cjs');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(pins.readRegular(sources.manifestPath).toString('utf8'));
// The pinned source manifest, the accepted raw files and the accepted Git blobs are the fail-closed inputs of
// sources.cjs. Each tamper below is injected into a private copy of the module; no repository byte is changed.
function subject({ change, exec = childProcess.execFileSync } = {}) {
  let tampered;
  if (change) {
    const copy = structuredClone(manifest);
    change(copy);
    tampered = Buffer.from(JSON.stringify(copy));
  }
  const unchanged = { ...pins,
    readRegular: (file, ...rest) => (tampered && file === sources.manifestPath ? tampered : pins.readRegular(file, ...rest)),
    hash: (bytes) => (tampered && bytes === tampered ? sources.manifestSha256 : pins.hash(bytes)) };
  return load(path.join(root, 'sources.cjs'), { '..\\C036\\pins.cjs': unchanged, 'node:child_process': { execFileSync: exec } });
}
test('the unmodified private copy still verifies every accepted source, so the tampers below are the only difference', () => {
  const result = subject().checkImports();
  assert.equal(result.directAcceptedSources, manifest.dependencies.length);
  assert.equal(result.workingAndGitMeasuredIndependently, true);
});
test('source pins, source checks and input checks accept no caller override', async () => {
  assert.throws(() => sources.imports({ expected: true }), { code: 'NO_SOURCE_PIN_OVERRIDES' });
  assert.throws(() => sources.checkImports('other'), { code: 'NO_SOURCE_OVERRIDES' });
  assert.throws(() => sources.readGates('other'), { code: 'NO_AUTHORITY_OVERRIDES' });
  await assert.rejects(() => sources.assertInputs({ source: 'other' }), { code: 'NO_INPUT_OVERRIDES' });
});
test('a changed pinned manifest is refused before any dependency is read', () => {
  const changed = subject({ change: (value) => { value.policy = 'edited'; } });
  assert.equal(changed.manifestSha256, sources.manifestSha256);
  const bytes = Buffer.from('{}');
  const refused = load(path.join(root, 'sources.cjs'), { '..\\C036\\pins.cjs': { ...pins, readRegular: () => bytes } });
  assert.throws(() => refused.imports(), { code: 'SOURCE_MANIFEST_CHANGED' });
  assert.throws(() => refused.checkImports(), { code: 'SOURCE_MANIFEST_CHANGED' });
});
test('a dependency outside its accepted card scope is refused', () => {
  assert.throws(() => subject({ change: (value) => { value.dependencies[0].card = 'C999'; } }).checkImports(),
    { code: 'CLOSED_SOURCE_SCOPE' });
  assert.throws(() => subject({ change: (value) => { value.dependencies[0].path = 'capability\\C020\\contract.js'; } }).checkImports(),
    { code: 'CLOSED_SOURCE_SCOPE' });
});
test('an accepted raw working file that no longer matches its pin is refused', () => {
  assert.throws(() => subject({ change: (value) => { value.dependencies[0].rawSha256 = '0'.repeat(64); } }).checkImports(),
    { code: 'UNCHANGED_ACCEPTED_RAW_SOURCE_REQUIRED' });
  assert.throws(() => subject({ change: (value) => { value.dependencies[0].crlfToLfSha256 = '0'.repeat(64); } }).checkImports(),
    { code: 'UNCHANGED_ACCEPTED_RAW_SOURCE_REQUIRED' });
});
test('a Git object listing that is not the exact accepted blob sequence is refused', () => {
  assert.throws(() => subject({ exec: () => Buffer.from('missing\n') }).checkImports(), { code: 'EXACT_ACCEPTED_GIT_BLOB_REQUIRED' });
  assert.throws(() => subject({ exec: () => Buffer.from(`${'a'.repeat(40)} blob 3\nabc\n`) }).checkImports(),
    { code: 'ACCEPTED_GIT_SOURCE_CHANGED' });
  const trailing = (...args) => Buffer.concat([childProcess.execFileSync(...args), Buffer.from('extra')]);
  assert.throws(() => subject({ exec: trailing }).checkImports(), { code: 'EXACT_ACCEPTED_GIT_BLOB_REQUIRED' });
});
