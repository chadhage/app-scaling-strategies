(function (root) {
  'use strict';
  function createState() {
    return Object.freeze({ schemaVersion: 1, phase: 'empty', presetId: null, history: Object.freeze([]), runs: Object.freeze([]) });
  }
  function execute(state) { return state; }
  const api = Object.freeze({ createState, execute });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlexLesson = api;
}(typeof globalThis === 'object' ? globalThis : this));
