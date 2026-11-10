'use strict';

function shared(depth, counts = null) {
  let value = {};
  for (let level = 0; level < depth; level++) {
    const child = value;
    value = counts ? Object.defineProperties({}, {
      a: { enumerable: true, get() { counts.reads += 1; return child; } },
      b: { enumerable: true, get() { counts.reads += 1; return child; } },
    }) : { a: child, b: child };
  }
  return value;
}

const consoleRun = (data, patch = {}) => ({
  format: 'X001-saved-run/1', id: 'u049-local', kind: 'console', title: 'Local counted-work fixture',
  entries: [{ type: 'connect', data }], ...patch,
});

const boundedReducer = (onReduce = () => {}) => ({
  initial: () => ({
    counts: { applied: 0, duplicates: 0, outOfOrder: 0, rejected: 0, reconnects: 0, disconnects: 0, resyncs: 0 },
    dropped: [], gaps: [], epochChanges: [], failure: null, completed: false, lastId: null,
  }),
  reduce(state) { onReduce(); return state; },
});

module.exports = Object.freeze({ shared, consoleRun, boundedReducer });
