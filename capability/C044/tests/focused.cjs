'use strict';

// Test tooling, not production code: the focused node:test files, shared by the recorder and the coverage gate.
const FOCUSED = Object.freeze(['cursor', 'reducer', 'run', 'store', 'context', 'stream', 'server', 'page', 'surface', 'imports', 'restart',
  'resync', 'resync-page', 'resync-server', 'recovery-property', 'hardening'].map((name) => `${name}.test.cjs`));

module.exports = Object.freeze({ FOCUSED });
