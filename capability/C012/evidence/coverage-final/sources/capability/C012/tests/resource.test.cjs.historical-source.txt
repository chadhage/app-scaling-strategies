'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { group } = require('./resource-group.cjs');
test('one complete deterministic resource group checks producer and rendered recovery invariants after every operation', async () => {
  const result = await group(0);
  assert.equal(result.complete, true);
  assert.equal(result.producerTransitions, 15);
  assert.equal(result.clientOperations, 32);
  assert.ok(result.checks >= 290);
});
