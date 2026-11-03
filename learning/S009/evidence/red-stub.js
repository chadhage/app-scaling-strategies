(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShadowProfile = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  function createState() {
    return {
      schemaVersion: 1,
      mode: 'synthetic-only',
      nativeProof: false,
      batches: [],
      lastResult: { kind: 'ready', verdict: 'NOT RUN', message: 'No synthetic requests have run.' }
    };
  }

  function summarize() {
    return {
      requests: 0, productionWrites: 0, productionNotifications: 0,
      shadowWrites: 0, shadowNotifications: 0,
      suppressedWrites: 0, suppressedNotifications: 0,
      totalWrites: 0, totalNotifications: 0,
      duplicateWrites: 0, duplicateNotifications: 0,
      matchedResponses: 0, discrepantResponses: 0, unknownResponses: 0
    };
  }

  function run(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function compareResponses() {
    return { status: 'UNKNOWN', differences: [], reason: 'Comparison is not implemented.' };
  }

  return Object.freeze({ createState, run, summarize, compareResponses });
}));
