'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const u005 = require('./u005-support-impl.cjs');

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const lifecycleRoot = path.resolve(__dirname, '..');

// The fix RED replays the first-publication bytes of close.cjs and session.cjs (archived as .txt snapshots) as if they sat in the lifecycle folder:
// their relative requires resolve to the real tree.cjs and windows.cjs, the snapshot of session.cjs gets the snapshot of close.cjs, and owned.cjs and startup.cjs come from the
// U005 loader: the real ones, or (when U005_FIRST_PUBLICATION is set as well) the archived UNFIXED U005 bytes, so that the whole first-publication stack, including the defect of
// the U005 ownership (rev-U005 F1, which the U006 close inherited), is what the tests run against.
const snapshots = new Map();

function loadSnapshot(directory) {
  if (snapshots.has(directory)) return snapshots.get(directory);
  const real = createRequire(path.join(lifecycleRoot, 'session.cjs'));
  const loaded = new Map();
  const resolve = (request) => {
    if (request === './close.cjs') return load('close.cjs');
    if (request === './owned.cjs') return u005.loadImplementation().owned;
    if (request === './startup.cjs') return u005.loadImplementation().startup;
    return real(request);
  };
  const load = (name) => {
    if (loaded.has(name)) return loaded.get(name);
    const file = path.join(directory, `${name}.txt`);
    const holder = { exports: {} };
    const wrapper = vm.runInThisContext(`(function (exports, require, module, __filename, __dirname) {${fs.readFileSync(file, 'utf8')}\n})`, { filename: file });
    wrapper.call(holder.exports, holder.exports, resolve, holder, path.join(lifecycleRoot, name), lifecycleRoot);
    loaded.set(name, holder.exports);
    return holder.exports;
  };
  const implementation = { red: false, close: load('close.cjs'), session: load('session.cjs') };
  snapshots.set(directory, implementation);
  return implementation;
}

// The RED archive runs the U006 tests against an archived naive close (U006_RED_IMPL, a repository-relative path, mode in U006_NAIVE_MODE);
// the fix RED runs them against the archived first-publication bytes (U006_FIRST_PUBLICATION, a repository-relative directory);
// the mutation tool runs them against a mutated copy of the source files (U006_IMPL_DIR); normal runs load the production modules.
function loadImplementation() {
  const redPath = process.env.U006_RED_IMPL;
  if (redPath) {
    const naive = require(path.resolve(repoRoot, redPath));
    return { red: true, close: naive, session: naive };
  }
  if (process.env.U006_FIRST_PUBLICATION) return loadSnapshot(path.resolve(repoRoot, process.env.U006_FIRST_PUBLICATION));
  const dir = process.env.U006_IMPL_DIR ? path.resolve(repoRoot, process.env.U006_IMPL_DIR) : lifecycleRoot;
  return { red: false, close: require(path.join(dir, 'close.cjs')), session: require(path.join(dir, 'session.cjs')) };
}

module.exports = { loadImplementation, repoRoot, lifecycleRoot };
