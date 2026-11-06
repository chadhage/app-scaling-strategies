'use strict';

// F2 of the independent review, guard by guard (mutant M26 and its siblings): every condition of the suite verdict is
// pinned by a row that violates exactly that condition, and a block without tests (zero tests, exit 0) is a real run.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { countsPassed, describeSuite, runSuite, summaryComplete } = require('../requalify.cjs');

const CLEAN = { timedOut: false, spawnError: null, exitCode: 0, summaryFound: true, tests: 3, pass: 3, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
const ROWS = [
  ['the suite timed out', { timedOut: true }],
  ['the suite could not be started', { spawnError: 'ENOENT' }],
  ['node exited with 1', { exitCode: 1 }],
  ['node was ended by a signal (no exit code)', { exitCode: null }],
  ['no TAP summary was found', { summaryFound: false }],
  ['no test passed', { tests: 0, pass: 0 }],
  ['fewer tests passed than ran', { pass: 2 }],
  ['more tests passed than ran', { pass: 4 }],
  ['a test failed', { fail: 1 }],
  ['a test was cancelled', { cancelled: 1 }],
  ['a test was skipped', { skipped: 1 }],
  ['a test is todo', { todo: 1 }],
];

test('countsPassed accepts a clean run and refuses every run that violates one condition', () => {
  assert.equal(countsPassed(CLEAN), true);
  assert.equal(countsPassed({ ...CLEAN, tests: 1, pass: 1, suites: 0 }), true);
  for (const [why, change] of ROWS) assert.equal(countsPassed({ ...CLEAN, ...change }), false, why);
});

test('describeSuite names every reason a suite did not pass, with the number of tests that passed', () => {
  const base = {
    file: 'x.cjs', spawnError: null, timedOut: false, summaryFound: true, exitCode: 0, tests: 4, pass: 1, fail: 1, cancelled: 1, skipped: 1, todo: 0,
  };
  assert.equal(describeSuite(base), 'x.cjs passed 1 of 4 tests (1 failed, 1 cancelled, 1 skipped)');
  assert.equal(describeSuite({ ...base, fail: 0, cancelled: 0, skipped: 0, todo: 3 }), 'x.cjs passed 1 of 4 tests (3 todo)');
  const silent = { ...base, summaryFound: false, exitCode: null, tests: null, pass: null, fail: null, cancelled: null, skipped: null, todo: null };
  assert.equal(describeSuite({ ...silent, timedOut: true }), 'x.cjs passed 0 of 0 tests (timed out, no TAP summary)');
  assert.equal(describeSuite({ ...silent, spawnError: 'ENOENT' }), 'x.cjs passed 0 of 0 tests (could not start: ENOENT, no TAP summary)');
  assert.equal(describeSuite({ ...base, tests: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0 }), 'x.cjs passed 0 of 0 tests (no test ran)');
  assert.equal(describeSuite({ ...base, tests: 2, pass: 2, fail: 0, cancelled: 0, skipped: 0, exitCode: 3 }), 'x.cjs passed 2 of 2 tests (exit code 3)');
  assert.equal(describeSuite({ ...base, fail: 0, cancelled: 0, skipped: 0 }), 'x.cjs passed 1 of 4 tests (the counts do not add up)');
});

test('a summary that lacks one of its counters is incomplete, and suites is informational', () => {
  const full = { tests: 1, suites: 0, pass: 1, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
  assert.equal(summaryComplete(full), true);
  for (const name of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) assert.equal(summaryComplete({ ...full, [name]: null }), false, name);
  assert.equal(summaryComplete({ ...full, suites: null }), true);
});

test('a block without any test reports zero tests and exit 0 and still does not pass', { timeout: 120000 }, async () => {
  const result = await runSuite('empty-describe-suite.cjs', { cwd: path.join(__dirname, 'fixtures'), timeoutMs: 90000 });
  assert.deepEqual([result.exitCode, result.tests, result.pass, result.skipped, result.todo], [0, 0, 0, 0, 0]);
  assert.equal(result.summaryFound, true);
  assert.equal(result.testsPassed, false);
  assert.equal(result.passed, false);
});
