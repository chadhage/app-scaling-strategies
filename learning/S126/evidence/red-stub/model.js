(function (root) {
  'use strict';
  const createState = () => ({ phase: 'baseline', history: [] });
  const execute = (state) => state;
  const api = { createState, execute };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S126Lesson = api;
}(globalThis));
