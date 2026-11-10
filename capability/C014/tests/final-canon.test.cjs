'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const canon = require('../canon.cjs');

test('G9 fold covers each dash endpoint and each Unicode property in the declared folding vocabulary', () => {
  for (const point of [0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212, 0xfe58, 0xfe63, 0xff0d]) assert.equal(canon.fold(`a${String.fromCodePoint(point)}b`), 'a-b', `dash ${point}`);
  assert.equal(canon.fold('a\u200bb\u0301c\u20ddd'), 'abcd', 'Cf, Mn and Me are independent class members');
});

test('G9 base64url converts several pluses and several slashes, not only their first occurrence', () => {
  const held = '???>>>???>>>???>>>';
  const encoded = Buffer.from(held).toString('base64');
  assert.ok((encoded.match(/\+/g) || []).length >= 2 && (encoded.match(/\//g) || []).length >= 2, 'the fixture has repeated occurrences of both symbols');
  const expected = Buffer.from(held).toString('base64url');
  assert.ok(canon.needlesFor(held).exact.includes(expected), 'independent native base64url expectation');
});

test('G2 interval union agrees with an independent per-character oracle over seeded overlapping families', () => {
  let state = 0x140014;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
  for (let trial = 0; trial < 400; trial += 1) {
    const text = Array.from({ length: 40 }, () => 'abc'[random() % 3]).join('');
    const secrets = Array.from({ length: 7 }, () => { const at = random() % 32; return text.slice(at, at + 6 + random() % 3); });
    const marked = Array(text.length).fill(false);
    const bridges = Array(text.length).fill(false);
    for (let at = 0; at < text.length; at += 1) for (const secret of secrets) if (text.startsWith(secret, at)) for (let offset = 0; offset < secret.length; offset += 1) {
      marked[at + offset] = true;
      if (offset > 0) bridges[at + offset] = true;
    }
    let expected = '';
    for (let at = 0; at < text.length; at += 1) {
      if (!marked[at]) expected += text[at];
      else if (at === 0 || !marked[at - 1] || !bridges[at]) expected += '[redacted]';
    }
    assert.equal(canon.replaceVerbatim(text, secrets, '[redacted]'), expected);
  }
  assert.equal(canon.replaceVerbatim('ordinary text', [], '[redacted]'), 'ordinary text');
});

test('G2 empty-needle refusal is decided by counted indexOf calls, never by a timeout', (t) => {
  const original = String.prototype.indexOf;
  let reads = 0;
  t.mock.method(String.prototype, 'indexOf', function counted(...args) {
    reads += 1;
    assert.ok(reads <= 32, 'empty-needle regression exceeded its deterministic work barrier');
    return Reflect.apply(original, this, args);
  });
  assert.equal(canon.replaceVerbatim('ordinary text', [''], '[redacted]'), 'ordinary text');
  assert.equal(reads, 0, 'an empty needle is refused before searching');
});
