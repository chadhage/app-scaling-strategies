'use strict';

const { createJourney } = require('..\\..\\C033\\journey.js');
const providers = require('..\\..\\C020\\profiles.cjs');
async function terminalAt(budgetMs, deltaMs, startedAt = 0) {
  let now = startedAt;
  const journey = createJourney({
    clock: () => now,
    read: async (request) => {
      const value = providers[request.implementation === 'v1' ? 'getProfileV1' : 'getProfileV2']({
        profileId: request.profileId
      });
      return {
        requestToken: request.requestToken, implementation: request.implementation, status: 200,
        value, headerVersion: value.stamp.implementationVersion, headerDeployment: value.stamp.deploymentStamp
      };
    }
  });
  try {
    journey.start({ profileId: 'synthetic-001', draft: 'synthetic-draft-A', boundary: 'before-first-read', budgetMs });
    now = startedAt + budgetMs + deltaMs;
    journey.resume();
    await journey.done();
    return journey.snapshot();
  } finally {
    journey.stop();
    await journey.done();
  }
}
const copy = (value) => JSON.parse(JSON.stringify(value));
function deeplyFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(deeplyFrozen);
}
module.exports = Object.freeze({ terminalAt, copy, deeplyFrozen });
