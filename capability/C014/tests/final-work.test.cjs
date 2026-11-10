'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const canon = require('../canon.cjs');

test('G2 occurrence-search work is bounded by counted indexOf calls, including the final not-found sentinel', (t) => {
  const indexOf = String.prototype.indexOf;
  let calls = 0;
  t.mock.method(String.prototype, 'indexOf', function counted(...args) {
    calls += 1;
    assert.ok(calls <= 128, 'occurrence search crossed its deterministic 128-call work barrier');
    return Reflect.apply(indexOf, this, args);
  });
  assert.equal(canon.replaceVerbatim('abcdefghijkl', ['abcdefgh', 'efghijkl'], '[redacted]'), '[redacted]');
  assert.equal(canon.replaceVerbatim('ordinary text', ['absent'], '[redacted]'), 'ordinary text');
  assert.equal(canon.replaceVerbatim('aaaaaaa', ['aaaaaa'], '[redacted]'), '[redacted]');
  assert.equal(canon.replaceVerbatim('ordinary text', [''], '[redacted]'), 'ordinary text');
  assert.ok(calls > 0 && calls < 20, 'the current search actually ran and settled by facts');
});
