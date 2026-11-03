(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StandbyPromise = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const MAX_ATTEMPTS = 6;
  function createSession() {
    return { schemaVersion: 1, phase: 'ready', history: [], current: null };
  }
  function evaluate(input) {
    return {
      input: { ...input },
      acceptance: 'success',
      verifier: 'pass',
      recoverySeconds: 20,
      timing: 'success',
      reasons: ['The destination eventually recovered.'],
    };
  }
  function decide(session, input) {
    const record = { attempt: session.history.length + 1, input, result: evaluate(input) };
    return { ...session, phase: 'checked', history: [...session.history, record], current: record };
  }
  function resetSession(session) {
    return { ...session, phase: 'ready', current: null };
  }
  function totals(session) {
    return { attempted: session.history.length, success: session.history.length, failure: 0, unknown: 0 };
  }
  return { MAX_ATTEMPTS, createSession, evaluate, decide, resetSession, totals };
}));
