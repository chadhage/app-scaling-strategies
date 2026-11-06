'use strict';

// Test tooling, not production code: a --require preload that applies ONE text mutation to ONE production file when it
// is loaded (C043_MUTANT = {"file":"server.cjs","from":"...","to":"..."}). The mutation must match exactly once; a
// mutant that was never applied exits 99, so a vacuous mutation can never look like a killed mutant.
const Module = require('node:module');
const path = require('node:path');

const spec = JSON.parse(process.env.C043_MUTANT);
const target = path.resolve(__dirname, '..', spec.file);
const original = Module.prototype._compile;
let applied = false;

Module.prototype._compile = function compile(content, filename) {
  if (path.resolve(filename) === target) {
    const parts = content.split(spec.from);
    if (parts.length !== 2) throw new Error(`MUTANT_TARGET_NOT_UNIQUE (${parts.length - 1} occurrences): ${spec.from}`);
    applied = true;
    return original.call(this, parts.join(spec.to), filename);
  }
  return original.call(this, content, filename);
};

process.on('exit', () => {
  if (!applied && process.argv[1] && !process.env.C043_MUTANT_OPTIONAL) process.exitCode = process.exitCode || 99;
});
