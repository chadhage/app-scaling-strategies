'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const subject = require('./evaluator.stub.cjs');
const { createJourney } = require('..\\..\\..\\C033\\journey.js');
const providers = require('..\\..\\..\\C020\\profiles.cjs');

test('a genuinely positive later retry cannot launder the original 1000 ms failure', async () => {
  let now = 0;
  const journey = createJourney({
    clock: () => now,
    read: async (request) => {
      const value = providers[request.implementation === 'v1' ? 'getProfileV1' : 'getProfileV2']({
        profileId: request.profileId
      });
      return {
        requestToken: request.requestToken, implementation: request.implementation,
        status: 200, value, headerVersion: value.stamp.implementationVersion,
        headerDeployment: value.stamp.deploymentStamp
      };
    }
  });
  const config = {
    profileId: 'synthetic-001', draft: 'synthetic-draft-A',
    boundary: 'before-first-read', budgetMs: 1000
  };
  try {
    journey.start(config);
    now = 1000.25;
    journey.resume();
    await journey.done();
    journey.start(config);
    now = 1000.5;
    journey.resume();
    await journey.done();
    const original = journey.snapshot();
    assert.equal(original.history[0].budgetExceeded, true);
    assert.equal(original.history[1].budgetExceeded, false);
    assert.equal(original.history[1].outcome, 'observed');
    const evaluated = subject.evaluateSnapshot(original);
    assert.equal(evaluated.decision, 'FAIL',
      'Later healthy 200 replies must not convert the first original deadline miss into PASS.');
    assert.equal(evaluated.originals[0].verdict, 'FAIL');
  } finally {
    journey.stop();
    await journey.done();
  }
});
