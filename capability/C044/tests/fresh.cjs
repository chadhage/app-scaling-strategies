'use strict';

// Test tooling, not production code: load a private instance of a real production file with chosen collaborators
// replaced for that load only, so coverage lands on the real file and production code needs no injection points.
const Module = require('node:module');

function freshLoad(file, replacements) {
  const target = require.resolve(file);
  const original = Module._load;
  delete require.cache[target];
  Module._load = function patched(request, parent, isMain) {
    if (parent && parent.filename === target) {
      let resolved = request;
      try { resolved = Module._resolveFilename(request, parent, isMain); } catch { /* an unresolved request stays as written */ }
      if (Object.hasOwn(replacements, resolved)) return replacements[resolved];
    }
    return original.apply(this, arguments);
  };
  try {
    return require(target);
  } finally {
    Module._load = original;
    delete require.cache[target];
  }
}

module.exports = Object.freeze({ freshLoad });
