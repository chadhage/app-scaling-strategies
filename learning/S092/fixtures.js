(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CanaryFixtures = factory();
})(globalThis, function () {
  'use strict';
  return Object.freeze({
    BANNER: 'Training rehearsal - synthetic data - not a live Azure result',
    DEFAULT_CONFIG: Object.freeze({ stage: '50', observation: 'failed', rollbackEvidence: 'confirmed' }),
    STAGES: Object.freeze(['25', '50']),
    OBSERVATIONS: Object.freeze(['healthy', 'failed', 'missing', 'mixed']),
    ROLLBACK_EVIDENCE: Object.freeze(['confirmed', 'missing']),
    TRANSITION_RESULTS: Object.freeze(['SUCCESS', 'FAILURE', 'UNKNOWN']),
    RECOVERY_RESULTS: Object.freeze(['SUCCESS', 'UNKNOWN', 'NOT_ATTEMPTED']),
    CLIENT_IDS: Object.freeze(Array.from({ length: 8 }, (_, i) => `synthetic-client-${String(i + 1).padStart(2, '0')}`)),
    MAX_ATTEMPTS: 6,
    JOURNEY_BUDGET_MS: 250,
  });
});
