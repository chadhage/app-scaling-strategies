'use strict';

function createJourney() {
  return {
    start() { return false; },
    resume() { return false; },
    stop() { return false; },
    reset() { return false; },
    done() { return Promise.resolve(); },
    snapshot() {
      return {
        phase: 'idle', attemptId: null, original: null, requests: 0, responses: 0,
        acknowledgements: [], elapsedMs: 0, pausedMs: 0, startedAt: null,
        deadline: null, budgetExceeded: false, history: [], events: []
      };
    }
  };
}
module.exports = Object.freeze({ createJourney });
