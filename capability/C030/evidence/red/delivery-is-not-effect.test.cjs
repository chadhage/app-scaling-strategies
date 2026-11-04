'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const initial = require('.\\detector.stub.cjs');

test('three deliveries without application receipts must HOLD, never effect success', () => {
  const result = initial.classify({ intendedEffects: 3, deliveryAttempts: 3, confirmedApplications: 0 });
  assert.equal(result.decision, 'HOLD');
  assert.equal(result.confirmedApplications, 0);
});
