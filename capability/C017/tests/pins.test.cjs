'use strict';

// F6: testing/browser/isolated.cjs was pinned only by the RAW (CRLF working copy) SHA-256, so tests\imports.test.cjs failed on an LF checkout
// and anchor.cjs never checked it. It is now pinned like every other accepted import: raw, LF and git-blob SHA-256 with a commit and a tag.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const imports = require('../imports.json');
const s = require('./support.cjs');

const repo = path.resolve(s.root, '..', '..');
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const lf = (buffer) => Buffer.from(buffer.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');
const matches = (bytes, pin) => sha(bytes) === pin.raw || sha(lf(bytes)) === pin.lf;
const helper = () => fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'));

test('the browser helper is pinned with raw, LF and git hashes, a commit and a tag, like the other accepted imports', () => {
  const pin = imports.browserHelper;
  assert.ok(pin, 'imports.json must pin testing\\browser\\isolated.cjs with a commit, a tag and raw, LF and git SHA-256');
  assert.equal(pin.path, 'testing\\browser\\isolated.cjs');
  assert.match(pin.commit, /^[0-9a-f]{40}$/);
  assert.equal(pin.tag, `kanban/flow-browser/${pin.commit.slice(0, 12)}`);
  for (const name of ['raw', 'git', 'lf']) assert.match(pin[name], /^[0-9a-f]{64}$/, name);
  assert.equal(pin.git, pin.lf, 'the Git blob is the LF-canonical form');
});

test('the pin holds for the CRLF working copy and for an LF checkout of the same file (core.autocrlf=false, CI)', () => {
  const pin = imports.browserHelper;
  assert.ok(pin, 'imports.json must pin the browser helper');
  assert.equal(matches(helper(), pin), true, 'the working copy drifted from its pin');
  assert.equal(matches(lf(helper()), pin), true, 'an LF checkout must still match the pin');
  assert.equal(matches(Buffer.concat([helper(), Buffer.from('\n// drift\n')]), pin), false, 'a changed helper must not match');
  assert.equal(imports.browserHelperRawSha256, undefined, 'the raw-only pin must not remain beside the full pin');
});

test('anchor.cjs recomputes the browser helper pin against git (tag, blob at the commit, last change) like the other seven', () => {
  const source = fs.readFileSync(path.join(__dirname, 'anchor.cjs'), 'utf8');
  assert.match(source, /imports\.browserHelper/);
  assert.match(source, /rev-parse/);
});
