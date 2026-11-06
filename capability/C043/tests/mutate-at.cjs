'use strict';

// Test tooling, not production code: a --require preload that applies ONE position-based mutation to ONE production file
// (C043_MUTANT_AT = {"file":"server.cjs","start":123,"end":130,"to":"false","sha256":"<hash of the original text>"}) when the
// file is loaded. The hash of the original text must match, so offsets can never be applied to other bytes. A mutant that
// was never applied exits 99, so a vacuous mutation can never look like a killed mutant. Used by tests\mutgen.cjs.
const crypto = require('node:crypto');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const spec = JSON.parse(process.env.C043_MUTANT_AT);
const target = path.resolve(__dirname, '..', spec.file);
const original = Module.prototype._compile;
const read = fs.readFileSync;
const produced = new Set();

function mutate(content) {
  if (crypto.createHash('sha256').update(content).digest('hex') !== spec.sha256) throw new Error('MUTANT_BASE_DIFFERS: the file is not the text the mutant was generated from');
  const result = `${content.slice(0, spec.start)}${spec.to}${content.slice(spec.end)}`;
  produced.add(result);
  return result;
}

Module.prototype._compile = function compile(content, filename) {
  return original.call(this, path.resolve(filename) === target && !produced.has(content) ? mutate(content) : content, filename);
};

fs.readFileSync = function mutatedRead(file, ...rest) {
  const content = read.call(fs, file, ...rest);
  return typeof file === 'string' && typeof content === 'string' && path.resolve(file) === target && !produced.has(content) ? mutate(content) : content;
};
