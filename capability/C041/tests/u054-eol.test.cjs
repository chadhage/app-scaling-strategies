'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { test } = require('node:test');
const authority = require('./u054-authority.cjs');
const root = path.resolve(__dirname, '..');

for (const form of ['LF', 'CRLF']) {
  test(`new amendment metadata ${form} representation retains every independent index identity`, () => {
    const value = authority.readNamespace(root);
    const digests = value.addenda.map(row => authority.sha(authority.lf(row.bytes)));
    const addenda = value.addenda.map(row => ({ name: row.name, bytes: form === 'LF'
      ? authority.lf(row.bytes) : Buffer.from(authority.lf(row.bytes).toString('latin1').replace(/\n/g, '\r\n'), 'latin1') }));
    const result = authority.verifyChain({ ...value, addenda, trustedAddendaSha256: digests });
    assert.ok(value.addenda.length >= 2);
    assert.equal(result.addenda, value.addenda.length);
    assert.equal(result.headRepresentation.rawSha256, authority.sha(addenda.at(-1).bytes));
    assert.equal(result.headRepresentation.crlfToLfSha256, digests.at(-1));
  });
}

test('new indexes accept neither an inserted bare CR nor a changed data byte', () => {
  const value = authority.readNamespace(root);
  const digests = value.addenda.map(row => authority.sha(authority.lf(row.bytes)));
  for (let index = 0; index < value.addenda.length; index++) {
    const before = value.addenda[index];
    for (const changed of [Buffer.concat([before.bytes, Buffer.from('\rX')]), Buffer.concat([before.bytes, Buffer.from(' ')])]) {
      const addenda = value.addenda.map((row, ordinal) => ordinal === index ? { ...row, bytes: changed } : row);
      assert.throws(() => authority.verifyChain({ ...value, addenda, trustedAddendaSha256: digests }),
        new RegExp(`TRUSTED_ADDENDUM_CHANGED ${before.name.replaceAll('.', '\\.')}`));
    }
  }
});

test('all original evidence and the accepted source-hash base remain raw-only', () => {
  const value = authority.readNamespace(root);
  const original = value.read(authority.BASE);
  const changed = authority.lf(original);
  assert.notDeepEqual(original, changed, 'actual accepted base has a distinct raw form');
  assert.throws(() => authority.verifyChain({ ...value, baseBytes: changed }), /SOURCE_HASH_BASE_CHANGED/);
  assert.equal(fs.readFileSync(path.join(root, 'evidence-index-addendum-1.json')).includes(0), false);
});
