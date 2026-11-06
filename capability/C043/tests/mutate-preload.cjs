'use strict';

// Test tooling, not production code: a --require preload that applies ONE text mutation to ONE production file when it
// is loaded (C043_MUTANT = {"file":"server.cjs","from":"...","to":"..."}), whether Node compiles it (require) or the code
// reads its text (the DOM stub runs page.js in a vm; the server serves it). The mutation must match exactly once per
// load; a mutant that was never applied exits 99, so a vacuous mutation can never look like a killed mutant.
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const spec = JSON.parse(process.env.C043_MUTANT);
const target = path.resolve(__dirname, '..', spec.file);
const original = Module.prototype._compile;
const read = fs.readFileSync;
// The loader may read the file through fs.readFileSync before compiling it: a text that was already mutated is not mutated twice.
const produced = new Set();
let applied = false;

function mutate(content) {
  const parts = content.split(spec.from);
  if (parts.length !== 2) throw new Error(`MUTANT_TARGET_NOT_UNIQUE (${parts.length - 1} occurrences): ${spec.from}`);
  applied = true;
  const result = parts.join(spec.to);
  produced.add(result);
  return result;
}

Module.prototype._compile = function compile(content, filename) {
  return original.call(this, path.resolve(filename) === target && !produced.has(content) ? mutate(content) : content, filename);
};

fs.readFileSync = function mutatedRead(file, ...rest) {
  const content = read.call(fs, file, ...rest);
  return typeof file === 'string' && typeof content === 'string' && path.resolve(file) === target ? mutate(content) : content;
};

process.on('exit', () => {
  if (!applied && process.argv[1] && !process.env.C043_MUTANT_OPTIONAL) process.exitCode = process.exitCode || 99;
});
