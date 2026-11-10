'use strict';

// Test tooling, not production code. Preload for `node --test` runs: a child process of the test runner (the runner sets NODE_TEST_CONTEXT in it) moves to
// a scratch folder inside this namespace (ignored by git), so a test or a naive stub that writes a relative path can never create a file in the repository
// root (L-0182: NUL and nul.json once appeared there). The runner itself keeps its working directory, so relative test paths still resolve.
if (process.env.NODE_TEST_CONTEXT) {
  const directory = require('node:path').join(__dirname, 'scratch');
  require('node:fs').mkdirSync(directory, { recursive: true });
  process.chdir(directory);
}
