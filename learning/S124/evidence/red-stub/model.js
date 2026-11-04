(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.S124 = factory();
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  return {
    BANNER,
    initialState: () => ({ schemaVersion: 1, commands: [] }),
    transition: (state) => state,
    project: () => ({
      phase: 'awaiting-compare', totalComputeUnits: 0, workers: 0,
      planCount: 0, fictionalCostUnits: 0, placements: 0, history: [],
    }),
  };
}));
