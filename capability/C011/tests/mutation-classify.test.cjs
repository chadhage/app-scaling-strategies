'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { classify } = require('./mutation-classify.cjs');

const failure = (title, details) => `not ok 1 - ${title}\n  ---\n  failureType: 'testCodeFailure'\n${details}\n  ...\n`;
test('a mutation kill requires a named behavioral assertion, not a syntax, module, timeout, cancellation or file failure', () => {
  assert.deepEqual(classify(failure('capacity is conserved', "  code: 'ERR_ASSERTION'")).killedBy, ['capacity is conserved']);
  for (const details of [
    "  code: 'MODULE_NOT_FOUND'", "  error: SyntaxError: bad specimen", "  failureType: 'testTimeoutFailure'",
    "  failureType: 'cancelledByParent'", "  code: 'ERR_TEST_TIMEOUT'", "  code: 'ERR_TEST_FAILURE'\n  error: TypeError: module initialization failed"
  ]) {
    assert.deepEqual(classify(failure('not behavioral', details)).killedBy, []);
  }
  assert.deepEqual(classify(failure('capability/C011/tests/store.test.cjs', "  code: 'ERR_ASSERTION'")).killedBy, []);
  assert.deepEqual(classify('ok 1 - no failure\n').killedBy, []);
});
