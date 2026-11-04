'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const stub = require('./attribution.stub.cjs');

test('wrong run actually blocks the private attachment and metric transition', async () => {
  const gate = await stub.open();
  const candidate = gate.getEvidence('wrong-run');
  const result = await gate.attachText(JSON.stringify(candidate));
  assert.equal(result.outcome, 'rejected', 'Wrong-run evidence must reject before its actual private attachment transition.');
  assert.equal(gate.snapshot().attachedRecords, 0);
  assert.equal(gate.snapshot().metrics.currentAttributedTierRecords, 0);
});
