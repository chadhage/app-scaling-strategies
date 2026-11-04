'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CheckoutLesson = api;
})(globalThis, function () {
  function createState() {
    return { version: 1, phase: 'ready', active: null, history: [], runs: [] };
  }
  function execute(state) {
    return structuredClone(state);
  }
  return { createState, execute };
});
