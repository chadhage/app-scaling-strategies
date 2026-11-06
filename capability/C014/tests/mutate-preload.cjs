'use strict';

// Test tooling, not production code. A `--require` preload that compiles ONE mutated copy of a production file: C014_MUTANT is { file, start, end, original, replacement }
// (character offsets into the pristine source). A CommonJS file is patched through Module.prototype._compile for that file only; page.js, which the tests read as text
// and run under a DOM stub or serve as an asset, is patched in fs.readFileSync for that one path only. Every other file and every test stays untouched.
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');

const spec = process.env.C014_MUTANT ? JSON.parse(process.env.C014_MUTANT) : null;
if (spec) {
  const target = path.resolve(__dirname, '..', spec.file);
  const mutate = (content) => {
    if (content.slice(spec.start, spec.end) !== spec.original) throw new Error(`the mutant does not match the pristine source of ${spec.file}`);
    return content.slice(0, spec.start) + spec.replacement + content.slice(spec.end);
  };
  if (/\.cjs$/.test(spec.file)) {
    const original = Module.prototype._compile;
    Module.prototype._compile = function compile(content, filename) {
      return original.call(this, path.resolve(filename) === target ? mutate(content) : content, filename);
    };
  } else {
    const read = fs.readFileSync;
    fs.readFileSync = function readFileSync(file, options) {
      const result = read.apply(this, arguments);
      if (typeof file !== 'string' || path.resolve(file) !== target) return result;
      const encoding = typeof options === 'string' ? options : options && options.encoding;
      const text = mutate(Buffer.isBuffer(result) ? result.toString('utf8') : result);
      return encoding ? text : Buffer.from(text, 'utf8');
    };
  }
}
