'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const target = path.resolve(__dirname, '..', 'runner.cjs');
const compile = Module.prototype._compile;
const start = "async #loop(key, live, firstMode) {\r\n    let mode = firstMode;\r\n    for (;;) {";
const lfStart = start.replace(/\r\n/g, '\n');
Module.prototype._compile = function boundedMutation(content, filename) {
  if (path.resolve(filename) === target) {
    const marker = content.includes(start) ? start : lfStart;
    assert.equal(content.split(marker).length - 1, 1, 'U060 loop-bound target must match exactly once');
    const newline = marker.includes('\r\n') ? '\r\n' : '\n';
    const replacement = marker.replace('let mode = firstMode;', 'let mode = firstMode; let u060Iterations = 0;')
      + `${newline}      if (++u060Iterations > this.#log.runs.get(key).preset.steps.length + 1) require('node:assert/strict').fail('U060_ITERATION_BOUND: a preset loop did not advance or stop');`;
    content = content.replace(marker, replacement);
  }
  return compile.call(this, content, filename);
};
