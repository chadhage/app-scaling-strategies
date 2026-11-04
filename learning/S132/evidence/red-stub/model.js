(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SignInLesson = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const createState = () => ({ schemaVersion: 1, phase: 'idle', active: null, history: [], runs: [] });
  const execute = (state) => state;
  const measureJourney = () => ({ classification: 'unknown', continuousSignIn: false });
  return { createState, execute, measureJourney, MAX_ACTIONS: 16, MAX_RUNS: 4 };
}));
