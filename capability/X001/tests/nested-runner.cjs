'use strict';

// A nested "node --test" that inherits NODE_TEST_CONTEXT reports through the outer runner and exits 0 even when its own test fails (L-0002).
// spawn re-injects process.env.NODE_V8_COVERAGE into any child whose env has no OWN key of that name (L-0140), so the key gets an own empty value.
const { spawnSync } = require('node:child_process');

function childEnvironment(source = process.env) {
  const env = Object.fromEntries(Object.entries(source).filter(([name]) => !['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE'].includes(name.toUpperCase())));
  return { ...env, NODE_V8_COVERAGE: '' };
}

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, { timeout: 120000, windowsHide: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options, env: childEnvironment(options.env) });
}

// The coverage gate itself starts `node --test --experimental-test-coverage`, which manages NODE_V8_COVERAGE itself and exits 1 when the
// variable exists but is empty; so the gate (run directly, never under node --test) only removes both names.
function coverageEnvironment(source = process.env) {
  return Object.fromEntries(Object.entries(source).filter(([name]) => !['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE'].includes(name.toUpperCase())));
}

module.exports = Object.freeze({ childEnvironment, coverageEnvironment, runNode });
