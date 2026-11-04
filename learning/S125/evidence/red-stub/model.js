(function (root) {
  'use strict';
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const HISTORY_LIMIT = 12;
  const FIXTURES = Object.freeze([
    'ready', 'provision-failed', 'replicas-short', 'startup-failed', 'probe-failed',
    'readiness-unknown', 'traffic-mismatch', 'traffic-unknown', 'session-lost',
    'work-interrupted', 'work-unknown', 'journey-unknown', 'latency-breach',
  ]);
  function createState() {
    return {
      phase: 'baseline', fixture: null, candidate: null, readiness: 'unobserved',
      trafficResult: 'unobserved', traffic: { old: 100, candidate: 0 },
      lastTraffic: { old: 100, candidate: 0 }, oldLifecycle: 'active',
      candidateLifecycle: 'not-recorded', sessions: 'unobserved', work: 'unobserved',
      journeys: { attempted: 0, passed: 0, failed: 0, unknown: 0 },
      completed: false, outcome: 'unobserved', history: [],
      message: 'Record a fixed candidate; nominal update is not readiness or observed replacement.',
      data: null,
    };
  }
  function execute(state) { return state; }
  const api = Object.freeze({ BANNER, HISTORY_LIMIT, FIXTURES, createState, execute });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AcaRevisionLesson = api;
}(globalThis));
