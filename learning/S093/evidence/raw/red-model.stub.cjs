(function (root, factory) {
  'use strict';
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.S093Model = model;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function createState() {
    return { schemaVersion: 1, phase: 'ready', history: [], currentId: null };
  }
  function decide(state, selection) {
    return {
      schemaVersion: 1,
      phase: 'decided',
      currentId: 1,
      history: [{
        id: 1,
        selection,
        acceptance: 'success',
        verification: 'pass',
        nextCanaryPercent: 50,
        metrics: { attempted: 3, http200: 3, success: 3, interrupted: 0, unknown: 0 },
      }],
    };
  }
  return { createState, decide };
}));
