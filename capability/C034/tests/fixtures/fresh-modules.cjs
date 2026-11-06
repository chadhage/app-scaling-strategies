'use strict';

const Module = require('node:module');

// Loads a new instance of a module from its real file with chosen dependencies replaced in the module cache for that load only.
// The code under test is always the real file; only what it imports can be replaced to reach faults the real data cannot produce.
function freshLoad(target, replacements = {}) {
  const keys = [target, ...Object.keys(replacements)];
  const saved = keys.map((key) => [key, require.cache[key]]);
  delete require.cache[target];
  for (const [key, exports] of Object.entries(replacements)) {
    const stub = new Module(key);
    stub.filename = key;
    stub.loaded = true;
    stub.exports = exports;
    require.cache[key] = stub;
  }
  try {
    return require(target);
  } finally {
    for (const [key, entry] of saved) {
      if (entry) require.cache[key] = entry;
      else delete require.cache[key];
    }
  }
}

// Wraps fs functions for exactly one action, always restoring them, to simulate a concurrent actor or a failing disk.
function withFs(patches, action) {
  const fs = require('node:fs');
  const originals = Object.fromEntries(Object.keys(patches).map((name) => [name, fs[name]]));
  for (const [name, wrap] of Object.entries(patches)) fs[name] = wrap(originals[name]);
  try {
    return action();
  } finally {
    for (const [name, original] of Object.entries(originals)) fs[name] = original;
  }
}

const shadow = (stat, values) => Object.create(stat, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])));

module.exports = Object.freeze({ freshLoad, withFs, shadow });
