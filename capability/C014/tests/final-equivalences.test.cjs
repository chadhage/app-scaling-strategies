'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execute } = require('./final-equivalences.cjs');

test('all remaining current equivalences have exact source/tuple premises and runnable paired production-function witnesses', { timeout: 170000 }, async () => {
  const result = await execute();
  assert.equal(result.total, 35);
  assert.equal(result.passed, result.total);
  assert.ok(result.results.every((row) => row.pairedWitness && row.reason.length >= 60));
});
