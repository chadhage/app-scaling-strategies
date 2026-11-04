'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const subject = require('./readiness.initial.js');

test('one successful probe must not create pool readiness', async () => {
  const inspector = await subject.open();
  const result = await inspector.inspectText(JSON.stringify({
    observations: [{
      instanceId: 'fictional-C038-node-a',
      response: { httpStatus: 200 }
    }]
  }));
  assert.equal(result.syntheticPoolReady, false,
    'A single HTTP 200 without complete expected instance/dependency inventory must HOLD.');
  assert.equal(result.decision, 'UNKNOWN');
});
