'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const integrity = require('../source-integrity.cjs');
const root = path.resolve(__dirname, '..', '..', '..');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'evidence', 'u071', 'producer-authority.json')));
const lf = bytes => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const crlf = bytes => Buffer.from(lf(bytes).toString('latin1').replace(/\n/g, '\r\n'), 'latin1');
const read = fs.readFileSync;
function withBytes(relative, bytes, body) {
  const file = path.join(root, relative);
  fs.readFileSync = function (name, ...options) { return path.resolve(String(name)) === file ? bytes : read.call(fs, name, ...options); };
  try { return body(); } finally { fs.readFileSync = read; }
}
for (const row of data.dependencies) {
  const original = execFileSync('git', ['cat-file', 'blob', `${row.acceptedSourceRef}:${row.path.replaceAll('\\', '/')}`], { windowsHide: true });
  for (const [form, bytes] of [['raw-CRLF', crlf(original)], ['LF', lf(original)], ['CRLF', crlf(original)]]) {
    test(`${row.path}: original accepted ${form} version is admitted explicitly`, () => {
      withBytes(row.path, bytes, () => assert.doesNotThrow(() => assert.equal(integrity.readDependency(row.path), bytes)));
    });
  }
  const current = fs.readFileSync(path.join(root, row.path));
  for (const [form, bytes] of [['raw', current], ['LF', lf(current)], ['CRLF', crlf(current)]]) {
    test(`${row.path}: exact current ${form} bytes are admitted`, () => {
      withBytes(row.path, bytes, () => assert.doesNotThrow(() => assert.equal(integrity.readDependency(row.path), bytes)));
    });
    test(`${row.path}: ${form} edited bytes are refused BY NAME`, () => {
      const changed = Buffer.from(bytes); changed[changed.length >> 1] ^= 1;
      withBytes(row.path, changed, () => assert.throws(() => integrity.readDependency(row.path), error => {
        assert.ok(error.message.includes(row.path), error.message);
        return true;
      }));
    });
  }
}
test('only the eleven fixed dependency paths can be selected', () => {
  assert.equal(integrity.verifyDependencies().length, 11);
  for (const value of ['capability\\C041\\unknown.js', '..\\C041\\serve.cjs', 'capability\\C041\\serve.cjs ', 'package.json']) {
    assert.throws(() => integrity.readDependency(value), /approved fixed dependency/);
  }
});
