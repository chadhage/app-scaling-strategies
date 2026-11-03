(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SessionBoundary = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  function start() {
    function session(id, cohort, subject, item, status, pinned) {
      return {
        id, cohort, version: 'blue', status, pinned,
        expected: { subject, cart: [item] },
        state: { schema: 1, subject, cart: [item], revision: 1, receipt: null }
      };
    }
    return {
      schemaVersion: 1, mode: 'synthetic', nativeProof: false,
      clock: 0, nominalGreenPercent: 0, newSessionTarget: 'blue',
      blue: { alive: true }, green: { alive: true, ready: false, assessment: 'unassessed' },
      cutoverAt: null, retentionUntil: null, retirement: null,
      sessions: [
        session('old-journey', 'admitted-blue', 'learner-old', 'item-A', 'active', false),
        session('old-pinned', 'pinned-blue', 'learner-pinned', 'item-P', 'idle', true)
      ],
      work: { id: 'old-work', version: 'blue', status: 'pending', effects: 0, output: null },
      damage: { interruptedSessions: [], lostWork: [] },
      requests: [], events: [],
      lastOutcome: { ok: true, code: 'ready', message: 'Fixture loaded. No requests observed yet.' }
    };
  }

  function apply(state) {
    return { ...JSON.parse(JSON.stringify(state)), lastOutcome: {
      ok: false, code: 'not-implemented', message: 'Loadable behavioral stub.'
    } };
  }

  function summarize() {
    return {
      counts: { blueRequests: 0, greenRequests: 0, failedRequests: 0, activeBlue: 0, unresolvedPinned: 0, pendingBlueWork: 0 },
      drain: { complete: false, blockers: [] },
      retention: { started: false, elapsed: false, remaining: null },
      retire: { allowed: false, blockers: [] },
      verdict: 'PENDING', impact: 'Not yet demonstrated.'
    };
  }

  return Object.freeze({ start, apply, summarize });
}));
