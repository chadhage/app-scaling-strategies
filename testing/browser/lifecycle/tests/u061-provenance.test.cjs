'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'evidence', 'u061');
const base = JSON.parse(fs.readFileSync(path.join(evidence, 'authority-base.json'), 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const canonical = (b) => Buffer.from(b.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
function implementation() {
  if (process.env.U061_IMPL !== 'raw-only') return require('./u061-authority.cjs');
  const file = path.join(evidence, 'specimen', 'raw-only.cjs.txt');
  const module = new Module(file);
  module.filename = file;
  module.paths = Module._nodeModulePaths(path.dirname(file));
  module._compile(fs.readFileSync(file, 'utf8'), file);
  return module.exports;
}
const authority = implementation().createAuthority(base, (p) => fs.readFileSync(path.join(root, p)));
const rows = base.captures.flatMap((capture) => capture.inputs.map((input) => ({ capture, input })));
const rawOf = (input) => fs.readFileSync(path.join(root, input.retained));
test('U061-R001: all 15 actual retained historical raw input pins still pass exactly', () => {
  assert.equal(rows.length, 15);
  for (const { capture, input } of rows) {
    const bytes = rawOf(input);
    assert.equal(sha(bytes), input.rawSha256, input.path);
    assert.equal(sha(canonical(bytes)), input.crlfToLfSha256, input.path);
    assert.equal(authority.verifyStable(capture.path, input.path, bytes).ok, true, capture.path + ':' + input.path);
  }
});
for (const who of ['u005', 'u006']) {
  test(`U061-R002 ${who}: exact LF-canonical historical pins pass without changing original raw bytes`, () => {
    const selected = rows.filter((r) => r.capture.card === who);
    assert.equal(selected.length, who === 'u005' ? 9 : 6);
    for (const { capture, input } of selected) {
      const raw = rawOf(input), lf = canonical(raw);
      assert.equal(sha(lf), input.crlfToLfSha256);
      assert.equal(authority.verifyStable(capture.path, input.path, lf).ok, true,
        'historical canonical bytes must pass: ' + capture.path + ':' + input.path);
      assert.equal(sha(rawOf(input)), input.rawSha256, 'original retained raw was not rewritten');
    }
  });
}
test('U061-R003: content mutations and mixed newline variants cannot borrow canonical provenance', () => {
  for (const { capture, input } of rows) {
    const raw = rawOf(input), lf = canonical(raw);
    for (const source of [raw, lf]) {
      const changed = Buffer.from(source); changed[Math.floor(changed.length / 2)] ^= 1;
      assert.equal(authority.verifyStable(capture.path, input.path, changed).ok, false);
    }
    const text = raw.toString('latin1');
    if (text.indexOf('\r\n') !== text.lastIndexOf('\r\n')) {
      const mixed = Buffer.from(text.replace('\r\n', '\n'), 'latin1');
      assert.notEqual(sha(mixed), input.rawSha256);
      assert.notEqual(sha(mixed), input.crlfToLfSha256);
      assert.equal(authority.verifyStable(capture.path, input.path, mixed).ok, false);
    }
  }
});
test('U061-R004: a matching digest at an unrecorded path or manifest is refused', () => {
  const { capture, input } = rows[0], raw = rawOf(input);
  assert.equal(authority.verifyStable(capture.path, 'unrecorded.cjs', raw).ok, false);
  assert.equal(authority.verifyStable('evidence\\unknown\\capture.json', input.path, raw).ok, false);
});
