'use strict';

// Test tooling, not production code: node --require preload that redirects require('../engine.cjs') to a RETAINED pre-fix engine
// snapshot (C017_ENGINE_SNAPSHOT), while the snapshot's own relative requires resolve against the live namespace.
const Module = require('node:module');
const path = require('node:path');

const snapshot = path.resolve(process.env.C017_ENGINE_SNAPSHOT || '');
const root = path.resolve(__dirname, '..', '..');
const live = path.join(root, 'engine.cjs');
const resolve = Module._resolveFilename;

Module._resolveFilename = function patchedResolve(request, parent, ...rest) {
  if (parent && parent.filename === snapshot && request.startsWith('.')) return resolve.call(this, path.resolve(root, request), parent, ...rest);
  const found = resolve.call(this, request, parent, ...rest);
  return found === live ? snapshot : found;
};
