'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_INPUT, rehearse } = require('../long-work.js');

test('the model is loadable and the declared default fixture is immutable', () => {
  assert.equal(typeof rehearse, 'function');
  assert.ok(Object.isFrozen(DEFAULT_INPUT));
  assert.deepEqual(DEFAULT_INPUT, {
    mode: 'drain', condition: 'normal', budgetMs: 18000,
    drainMs: 8000, hostLimitMs: 16000,
  });
});

test('supported drain completes the admitted long HTTP operation', () => {
  const result = rehearse(DEFAULT_INPUT);
  assert.equal(result.status, 'completed', 'supported drain must complete, not remain unknown');
  assert.equal(result.elapsedMs, 12000);
  assert.equal(result.completedUnits, 12);
});

test('durable continuation completes beyond the original HTTP limit', () => {
  const result = rehearse({ ...DEFAULT_INPUT, mode: 'durable', hostLimitMs: 10000 });
  assert.equal(result.status, 'completed', 'checkpointed continuation must preserve the operation');
  assert.equal(result.elapsedMs, 14000);
  assert.equal(result.persistedUnits, 4);
  assert.equal(result.completedUnits, 12);
});

test('a fast retry still fails the original absolute user deadline', () => {
  const result = rehearse({ ...DEFAULT_INPUT, mode: 'durable', condition: 'delayed-retry' });
  assert.equal(result.status, 'interrupted', '8000 ms retry cannot erase 22000 ms original elapsed');
  assert.equal(result.retryElapsedMs, 8000);
  assert.equal(result.elapsedMs, 22000);
  assert.equal(result.originalDeadlineMs, 18000);
});

test('forced termination remains a user interruption', () => {
  const result = rehearse({ ...DEFAULT_INPUT, condition: 'forced-stop' });
  assert.equal(result.status, 'interrupted', 'a terminated active request is not successful drain');
  assert.equal(result.completedUnits, null);
});
