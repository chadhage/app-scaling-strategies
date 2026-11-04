'use strict';

// Retained RED subject: the first, aggregate-only gate. It mirrors tests/coverage.cjs as committed in dd49966d:
// two hard-coded files, aggregate thresholds of 90 lines / 80 branches / 90 functions, and no notion of an unloaded file.
const thresholds = Object.freeze({ lines: 90, branches: 80, functions: 90 });
function enumerate() { return ['model.js', 'readiness.js']; }
function floorsFor() { return thresholds; }
function parse(text) {
  const match = /# all files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)/.exec(text);
  return { files: new Map(), aggregate: match ? { lines: Number(match[1]), branches: Number(match[2]), functions: Number(match[3]) } : null };
}
function evaluate(enumerated, report) {
  const failures = Object.keys(thresholds).filter((key) => !report.aggregate || report.aggregate[key] < thresholds[key]);
  return { passed: failures.length === 0, files: [], unenumerated: [], failures };
}
module.exports = Object.freeze({ enumerate, floorsFor, parse, evaluate });
