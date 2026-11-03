'use strict';

(function expose(root) {
  const api = {
    evaluate() {
      return { verdict: 'unknown', totals: { pass: 0, fail: 0, unknown: 0, total: 0 }, measurements: [] };
    },
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S103Lesson = api;
})(typeof globalThis === 'object' ? globalThis : this);
