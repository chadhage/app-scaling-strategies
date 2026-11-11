'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const target = path.resolve(process.env.U045_MUTATION_CURRENT_FILE);
const original = fs.readFileSync(target);
const replacement = fs.readFileSync(process.env.U045_MUTATION_SOURCE_FILE);
if(sha(original) !== process.env.U045_MUTATION_ORIGINAL_SHA256 || sha(replacement) !== process.env.U045_MUTATION_SOURCE_SHA256) {
  throw new Error('U045 explicit mutation loader refuses mismatched actual source bytes');
}
const old = Module._extensions['.cjs'] || Module._extensions['.js'];
Module._extensions['.cjs'] = function(module,file) {
  if(path.resolve(file) === target) return module._compile(replacement.toString('utf8'),file);
  return old(module,file);
};
