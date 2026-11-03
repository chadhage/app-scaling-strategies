(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FeatureFlagRehearsal = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const MAX_EVENTS = 60;
  class RehearsalInputError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'RehearsalInputError';
      this.code = code;
    }
  }
  function createRun() {
    return { schemaVersion: 1, events: [] };
  }
  function applyEvent(run) {
    return run;
  }
  function parseEvent() {
    return { type: 'observe' };
  }
  function snapshot() {
    return {
      deploymentId: 'synthetic-deployment-S010',
      codeVersion: 'compatible-code-1',
      config: { version: 1, cohort: 'pilot', enabled: false, revision: 0 },
      clients: ['pilot-1', 'pilot-2', 'control-1', 'control-2'].map((id) => ({
        id, cohort: id.split('-')[0], sessionToken: `synthetic-session-${id}`,
        cartId: `synthetic-cart-${id}`, stateVersion: 1, cartCount: 1, effects: 0,
      })),
      trace: [],
    };
  }
  function evaluate() {
    return {
      status: 'NOT_RUN', summary: 'No synthetic observations yet.',
      userOutcome: 'unverified rehearsal', nativeEvidence: false,
      transitionOutcome: 'not-evidence-of-deployment-migration', deploymentChanges: 0,
      counts: { attempted: 0, successful: 0, interrupted: 0, guardedPublications: 0 },
      checks: [], missing: ['baseline', 'cohort', 'reversal'],
    };
  }
  return { MAX_EVENTS, RehearsalInputError, createRun, applyEvent, parseEvent, snapshot, evaluate };
}));
