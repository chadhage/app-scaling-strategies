'use strict';

module.exports = Object.freeze({
  evaluateSnapshot(snapshot) {
    const latestHealthy = snapshot.history.findLast((attempt) =>
      attempt.outcome === 'observed' && attempt.responses === 2);
    return {
      valid: true,
      decision: latestHealthy ? 'PASS' : 'HOLD',
      originals: snapshot.history.map((attempt) => ({
        attemptId: attempt.attemptId,
        verdict: latestHealthy ? 'PASS' : 'UNKNOWN'
      }))
    };
  }
});
