'use strict';

(function expose(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ContainerLesson = api;
})(typeof globalThis === 'object' ? globalThis : this, function stub() {
  return {
    createState() {
      return { phase: 'new', initialized: false, production: 'teaching-v1' };
    },
    next(state) {
      return state;
    },
  };
});
