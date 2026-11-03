(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S111Model = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  function createState() {
    return { version: 1, phase: 'ready', current: null, runs: [], events: [] };
  }
  function transition(state) {
    return state;
  }
  return { createState, transition };
}));
