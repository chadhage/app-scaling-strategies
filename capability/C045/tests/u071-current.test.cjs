'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const authority = require('./u071-namespace-v4.cjs');
const history = require('./u071-history-v2.cjs');
const HEAD_SHA256 = '16df865326774e559b9ec8b0d82c42c4489b1228bd96115f1d2501edcec7413f';
const own = path.resolve(__dirname, '..');
test('actual current namespace is independently enumerated with every byte checked, not a historical virtual view', () => {
  const result = authority.verifyCurrent(HEAD_SHA256);
  assert.equal(result.kind, 'actual-current-filesystem-enumeration');
  assert.equal(result.files, authority.enumerate().length);
  assert.ok(result.files > 117);
  assert.equal(result.headSha256, HEAD_SHA256);
});
test('a genuinely planted unknown current file is refused by name and only that owned plant is removed', () => {
  const name = 'u071-unknown-plant.txt';
  const file = path.join(own, name);
  fs.writeFileSync(file, 'unknown namespace bytes', { flag: 'wx' });
  try { assert.throws(() => authority.verifyCurrent(HEAD_SHA256), new RegExp(`CURRENT_UNINDEXED_FILE ${name}`)); }
  finally { fs.unlinkSync(file); }
  assert.equal(fs.existsSync(file), false);
});
test('every head byte and every sample source/evidence/addition byte is refused by its guard', () => {
  const { base, head, headBytes } = authority.metadata();
  for (let index = 0; index < headBytes.length; index++) {
    const changed = Buffer.from(headBytes); changed[index] ^= 1;
    assert.throws(() => authority.checkHead(changed, HEAD_SHA256), /CURRENT_HEAD_CHANGED/);
  }
  const expected = authority.records(base, head);
  const names = [base.files[0].path, base.files.find(row => row.path.startsWith('evidence\\')).path, head.additions[0].path];
  for (const name of names) {
    const row = expected.get(name);
    const bytes = authority.read(name);
    const changed = Buffer.from(bytes); changed[changed.length >> 1] ^= 1;
    assert.throws(() => authority.check(new Map([[name, row]]), [name], () => changed), /CURRENT_BYTES_CHANGED/);
  }
});
test('every original captured input has an explicit exact historical version; missing versions are not waived', () => {
  const report = history.verifyAll();
  assert.equal(report.kind, 'historical-versions-only-not-current-filesystem');
  assert.ok(report.inputs > 100);
  assert.deepEqual(report.problems, [], 'Historical byte versions remain mandatory, separately from current namespace enumeration');
});
