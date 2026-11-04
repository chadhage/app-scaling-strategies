'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { open } = require('./routing.initial.cjs');
test('requested weights cannot replace measured destinations when no requests were observed', async () => {
  const model = await open();
  const result = await model.compareText(JSON.stringify({
    requested: { targets: [{ destination: 'v1', weightBps: 5000 }, { destination: 'v2', weightBps: 5000 }] },
    observations: []
  }));
  assert.equal(result.observed.known, 0, 'Nominal 50/50 policy is NOT ten measured response destinations.');
  assert.equal(result.observed.started, 0);
  assert.equal(result.disposition, 'HOLD');
});
