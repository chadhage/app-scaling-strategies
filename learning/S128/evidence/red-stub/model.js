(function (root) {
  'use strict';
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  function createState() {
    return {
      schemaVersion: 1, choice: null, topology: { status: 'unknown' },
      traffic: { status: 'unknown' }, journeys: { status: 'unknown' },
      authorization: { status: 'unknown' }, history: [],
    };
  }
  function transition(state) { return state; }
  function summarize() { return { status: 'unknown' }; }
  const api = Object.freeze({ BANNER, createState, transition, summarize });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S128Lesson = api;
}(globalThis));
