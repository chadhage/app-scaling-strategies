'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const lifecycleRoot = path.resolve(__dirname, '..');

// The fix RED replays the first-publication bytes of owned.cjs and startup.cjs (archived as .txt snapshots) as if they sat in the lifecycle
// folder, so their relative requires resolve to the real tree.cjs and windows.cjs; the snapshot of startup.cjs gets the snapshot of owned.cjs.
const snapshots = new Map();

function loadSnapshot(directory) {
  if (snapshots.has(directory)) return snapshots.get(directory);
  const real = createRequire(path.join(lifecycleRoot, 'startup.cjs'));
  const loaded = new Map();
  const load = (name) => {
    if (loaded.has(name)) return loaded.get(name);
    const file = path.join(directory, `${name}.txt`);
    const holder = { exports: {} };
    const wrapper = vm.runInThisContext(`(function (exports, require, module, __filename, __dirname) {${fs.readFileSync(file, 'utf8')}\n})`, { filename: file });
    wrapper.call(holder.exports, holder.exports, (request) => (request === './owned.cjs' ? load('owned.cjs') : real(request)), holder, path.join(lifecycleRoot, name), lifecycleRoot);
    loaded.set(name, holder.exports);
    return holder.exports;
  };
  const implementation = { red: false, owned: load('owned.cjs'), startup: load('startup.cjs') };
  snapshots.set(directory, implementation);
  return implementation;
}

// The RED archive runs these same tests against an archived naive implementation (U005_RED_IMPL, a repository-relative path,
// mode in U005_NAIVE_MODE) and the mutation tool runs them against a mutated copy of the four source files (U005_IMPL_DIR);
// the fix RED runs them against the archived first-publication bytes (U005_FIRST_PUBLICATION, a repository-relative directory);
// normal runs load the production modules. The naive file exports every name of both modules.
function loadImplementation() {
  const redPath = process.env.U005_RED_IMPL;
  if (redPath) {
    const naive = require(path.resolve(repoRoot, redPath));
    return { red: true, owned: naive, startup: naive };
  }
  if (process.env.U005_FIRST_PUBLICATION) return loadSnapshot(path.resolve(repoRoot, process.env.U005_FIRST_PUBLICATION));
  const dir = process.env.U005_IMPL_DIR ? path.resolve(repoRoot, process.env.U005_IMPL_DIR) : lifecycleRoot;
  return {
    red: false,
    owned: require(path.join(dir, 'owned.cjs')),
    startup: require(path.join(dir, 'startup.cjs')),
  };
}

module.exports = { loadImplementation, repoRoot, lifecycleRoot };
