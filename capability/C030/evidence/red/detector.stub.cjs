'use strict';

function classify(observation) {
  return {
    decision: observation.deliveryAttempts >= observation.intendedEffects ? 'PASS' : 'HOLD',
    confirmedApplications: observation.deliveryAttempts
  };
}
module.exports = Object.freeze({ classify });
