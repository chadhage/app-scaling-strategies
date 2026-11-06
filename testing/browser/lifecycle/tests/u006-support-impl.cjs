'use strict';

const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const lifecycleRoot = path.resolve(__dirname, '..');

// The RED archive runs the U006 tests against an archived naive close (U006_RED_IMPL, a repository-relative path, mode in U006_NAIVE_MODE);
// the mutation tool runs them against a mutated copy of the source files (U006_IMPL_DIR); normal runs load the production modules.
function loadImplementation() {
  const redPath = process.env.U006_RED_IMPL;
  if (redPath) {
    const naive = require(path.resolve(repoRoot, redPath));
    return { red: true, close: naive, session: naive };
  }
  const dir = process.env.U006_IMPL_DIR ? path.resolve(repoRoot, process.env.U006_IMPL_DIR) : lifecycleRoot;
  return { red: false, close: require(path.join(dir, 'close.cjs')), session: require(path.join(dir, 'session.cjs')) };
}

module.exports = { loadImplementation, repoRoot, lifecycleRoot };
