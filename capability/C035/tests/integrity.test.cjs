'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const evidence = require('./evidence.cjs');
test('immutable source/raw index preserves loadable assertion RED, failed Edge attribution and independent passing actual DOM', () => {
  const proof = evidence.checkIndex();
  assert.ok(proof.indexedFiles > 50);
  assert.equal(proof.initialRedAssertionsFailed, 2);
  assert.ok(proof.preservedFailedExecutions >= 2);
  assert.equal(proof.preservedFailedEdgeCaptures, 1);
  assert.ok(proof.successfulEdgeCaptures >= 1);
  assert.equal(proof.actualDomChecksInPassingCapture, 18);
});
