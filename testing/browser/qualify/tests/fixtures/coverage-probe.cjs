'use strict';

// Probe for the requalification runner: runs a suite through runSuite() and prints how many files the nested run left in the
// NODE_V8_COVERAGE directory of THIS process (a nested run must stay out of the caller's coverage directory).
const fs = require('node:fs');
const requalify = require('../../requalify.cjs');

requalify.runSuite('pass-suite.cjs', { cwd: __dirname, timeoutMs: 90000 }).then((result) => {
  console.log(JSON.stringify({ exitCode: result.exitCode, tests: result.tests, files: fs.readdirSync(process.env.NODE_V8_COVERAGE).length }));
});
