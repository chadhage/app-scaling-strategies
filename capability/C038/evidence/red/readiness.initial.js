(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'C038Readiness', { value: factory() });
}(globalThis, function () {
  'use strict';
  async function open() {
    return Object.freeze({
      async inspectText(text) {
        const candidate = JSON.parse(text);
        const ready = candidate.observations.some((item) => item.response.httpStatus === 200);
        return Object.freeze({
          decision: ready ? 'CLOSED_SYNTHETIC_READY' : 'UNKNOWN',
          syntheticPoolReady: ready, actualPoolReady: false
        });
      }
    });
  }
  return Object.freeze({ open });
}));
