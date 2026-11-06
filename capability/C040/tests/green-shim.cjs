'use strict';

// Preload for the GREEN replay: the archived RED test asks for ./tables.stub.cjs; this hands it the real tables.js.
// The RED file itself runs byte-for-byte unchanged, so every archived assertion must pass against the final code (L-0121).
const Module = require('node:module');
const path = require('node:path');
const real = require('..\\tables.js');

const stub = path.join(__dirname, '..', 'evidence', 'red', 'tables.stub.cjs');
const original = Module._load;
Module._load = function load(request, parent, isMain) {
  if (parent && parent.filename && path.resolve(path.dirname(parent.filename), request) === stub) return real;
  return original.call(this, request, parent, isMain);
};
