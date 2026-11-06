'use strict';

const { spawnSync } = require('node:child_process');

// A nested "node --test" that inherits these variables reports through the outer runner and exits 0
// even when its own test fails (L-0002); NODE_V8_COVERAGE would also write into the outer coverage directory.
const inherited = Object.freeze(['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE']);

function childEnvironment(source = process.env) {
  return Object.fromEntries(Object.entries(source).filter(([name]) => !inherited.includes(name.toUpperCase())));
}
function runNodeTest(file, options = {}) {
  return spawnSync(process.execPath, ['--test', file], {
    timeout: 30000, windowsHide: true, encoding: 'utf8', ...options, env: childEnvironment(options.env)
  });
}
module.exports = Object.freeze({ inherited, childEnvironment, runNodeTest });
