(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'C044Reducer', { value: factory() });
}(globalThis, function () {
  'use strict';

  // Retained loadable stub for the C044 RED: the naive client reducer appends every delivery it is given.
  function initial() {
    return { events: [], counts: { applied: 0, duplicates: 0, outOfOrder: 0, rejected: 0 }, lastSeq: null };
  }

  function reduce(state, action) {
    if (action.type !== 'event') return state;
    const seq = Number(action.id.split(':').at(-1));
    return {
      events: [...state.events, { id: action.id, seq, event: action.event }],
      counts: { ...state.counts, applied: state.counts.applied + 1 },
      lastSeq: seq,
    };
  }

  return Object.freeze({ initial, reduce });
}));
