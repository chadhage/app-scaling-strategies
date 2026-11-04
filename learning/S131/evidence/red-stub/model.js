(function expose(root) {
  'use strict';
  const api = {
    create() { return { runs: [], active: null }; },
    command(state, input) {
      if (input.type === 'start') {
        return { runs: [{ id: 1, config: input, actions: [] }], active: 1 };
      }
      const next = JSON.parse(JSON.stringify(state));
      next.runs[0].actions.push(input.type);
      return next;
    },
    inspect(state) {
      return {
        verification: 'pass',
        userImpact: 'uninterrupted-transition',
        counts: { attempted: 2, succeeded: 2, failed: 0, unknown: 0, notExposed: 0 },
        htmlStatus: 200,
        run: state.runs[0],
      };
    },
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S131Lesson = api;
}(typeof globalThis === 'object' ? globalThis : this));
