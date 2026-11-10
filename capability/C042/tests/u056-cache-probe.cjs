'use strict';

const { measure, replaySelection } = require('./u056-cost.cjs');
const originalEquals = Buffer.prototype.equals;
let equalityCalls = 0;
try {
  Buffer.prototype.equals = function (...args) { equalityCalls += 1; return originalEquals.apply(this, args); };
  const structural = measure();
  console.log(JSON.stringify({ kind: 'u056-cache-operations', ...structural, contentEqualityCalls: equalityCalls, replay: replaySelection() }));
} finally {
  Buffer.prototype.equals = originalEquals;
}
