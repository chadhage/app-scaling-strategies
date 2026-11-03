(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'C023Ledger', { value: factory() });
}(globalThis, function () {
  'use strict';
  const pending = () => Object.freeze({
    schema: 'NOT_IMPLEMENTED',
    counters: Object.freeze({ committedEffects: 0, effectApplications: 0, unknownEffects: 0 })
  });
  return Object.freeze({
    create: pending,
    apply: pending,
    inspect: pending,
    restore: pending
  });
}));
