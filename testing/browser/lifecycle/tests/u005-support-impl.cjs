'use strict';

const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const lifecycleRoot = path.resolve(__dirname, '..');

// The RED archive runs these same tests against an archived naive implementation (U005_RED_IMPL, a repository-relative path,
// mode in U005_NAIVE_MODE) and the mutation tool runs them against a mutated copy of the four source files (U005_IMPL_DIR);
// normal runs load the production modules. The naive file exports every name of both modules.
function loadImplementation() {
  const redPath = process.env.U005_RED_IMPL;
  if (redPath) {
    const naive = require(path.resolve(repoRoot, redPath));
    return { red: true, owned: naive, startup: naive };
  }
  const dir = process.env.U005_IMPL_DIR ? path.resolve(repoRoot, process.env.U005_IMPL_DIR) : lifecycleRoot;
  return {
    red: false,
    owned: require(path.join(dir, 'owned.cjs')),
    startup: require(path.join(dir, 'startup.cjs')),
  };
}

module.exports = { loadImplementation, repoRoot, lifecycleRoot };
