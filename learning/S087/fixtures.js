(function (root, factory) {
  'use strict';
  const fixtures = factory();
  if (typeof module === 'object' && module.exports) module.exports = fixtures;
  else root.S087Fixtures = fixtures;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  return Object.freeze({
    clientCount: 8,
    historyLimit: 6,
    defaults: Object.freeze({ target: '100', propagation: 'partial', old: 'retained' }),
    options: Object.freeze({
      target: Object.freeze(['50', '100']),
      propagation: Object.freeze(['delayed', 'partial', 'converged', 'missing']),
      old: Object.freeze(['retained', 'loss']),
    }),
    endpoints: Object.freeze({ old: '/synthetic/old-v1', next: '/synthetic/new-v2' }),
    outcomes: Object.freeze(['SUCCESS', 'FAILURE', 'UNKNOWN']),
  });
}));
