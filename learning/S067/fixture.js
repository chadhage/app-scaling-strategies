(function (root, factory) {
  'use strict';
  const fixture = factory();
  if (typeof module === 'object' && module.exports) module.exports = fixture;
  else root.S067Fixture = fixture;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  return Object.freeze({
    record: 'SYN-RECORD-067',
    primaryTick: 12,
    primaryVersion: 12,
    maximumAttempts: 6,
    lagTicks: Object.freeze({ none: 0, two: 2, five: 5, unknown: null }),
    freshnessTicks: Object.freeze({ current: 0, 'two-ticks': 2 }),
    routes: Object.freeze(['reader-only', 'gated']),
    coverage: Object.freeze(['complete', 'missing']),
    predictions: Object.freeze(['PASS', 'FAIL', 'UNKNOWN']),
    defaults: Object.freeze({
      lag: 'five', freshness: 'current', routing: 'reader-only', coverage: 'complete',
    }),
  });
}));
