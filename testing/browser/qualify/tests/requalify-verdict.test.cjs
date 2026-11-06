'use strict';

// F2 of the independent review: a requalification must not pass when nothing ran. A suite passes only when every
// test passed (none skipped, todo or cancelled) and it printed the "Real Chromium <version>" line of the Edge under test.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const requalify = require('../requalify.cjs');
const { SHA } = require('./support.cjs');

const fixtures = path.join(__dirname, 'fixtures');
const VERSION = '156.0.4314.58';
const LIMIT = { timeout: 180000 };
const okReport = () => ({
  ok: true, reasons: [], reasonCodes: [], path: 'C:\\e\\msedge.exe', version: VERSION, major: 156,
  signature: { status: 'Valid', publisher: 'Microsoft Corporation' }, sha256: SHA, qualifiedMajors: [156], candidates: [],
});
const run = (suites, env = { FIXTURE_BROWSER_VERSION: VERSION }) => requalify.requalifyEdge({
  qualify: async () => okReport(), cwd: fixtures, suiteTimeoutMs: 120000, suites, env: { ...process.env, ...env },
});
const MISSING = /^BROWSER_VERSION_MISSING: (\S+(?:, \S+)*) printed no "Real Chromium <version>" line/;

test('suites that ran every test and printed the qualified browser version pass', LIMIT, async () => {
  const report = await run(['pass-suite.cjs', 'version-suite.cjs']);
  assert.equal(report.ok, true);
  assert.deepEqual(report.reasonCodes, []);
  assert.equal(report.requalification.passed, true);
  assert.deepEqual(report.requalification.suites.map((suite) => [suite.file, suite.tests, suite.pass, suite.passed]),
    [['pass-suite.cjs', 2, 2, true], ['version-suite.cjs', 1, 1, true]]);
  assert.deepEqual(report.requalification.browserVersionsSeen, [VERSION]);
});

test('a suite whose tests are all skipped does not pass although node exits 0', LIMIT, async () => {
  const report = await run(['all-skipped-suite.cjs']);
  const [suite] = report.requalification.suites;
  assert.deepEqual([suite.exitCode, suite.tests, suite.pass, suite.skipped, suite.fail], [0, 2, 0, 2, 0]);
  assert.equal(suite.passed, false);
  assert.equal(report.requalification.passed, false);
  assert.equal(report.ok, false);
  assert.ok(report.reasons.includes('REQUALIFICATION_FAILED: all-skipped-suite.cjs passed 0 of 2 tests (2 skipped)'), report.reasons.join(' | '));
});

test('a suite whose tests are all todo does not pass, even when the todo tests would fail', LIMIT, async () => {
  const report = await run(['all-todo-suite.cjs']);
  const [suite] = report.requalification.suites;
  assert.deepEqual([suite.exitCode, suite.tests, suite.pass, suite.todo, suite.fail], [0, 2, 0, 2, 0]);
  assert.equal(suite.passed, false);
  assert.equal(report.ok, false);
  assert.ok(report.reasons.includes('REQUALIFICATION_FAILED: all-todo-suite.cjs passed 0 of 2 tests (2 todo)'), report.reasons.join(' | '));
});

test('one conditional skip is enough to fail the suite, and it is the only thing reported', LIMIT, async () => {
  const report = await run(['skip-one-suite.cjs']);
  const [suite] = report.requalification.suites;
  assert.deepEqual([suite.exitCode, suite.tests, suite.pass, suite.skipped], [0, 2, 1, 1]);
  assert.deepEqual(suite.browserVersionsSeen, [VERSION]);
  assert.equal(suite.passed, false);
  assert.equal(report.ok, false);
  assert.deepEqual(report.reasonCodes, ['REQUALIFICATION_FAILED']);
  assert.equal(report.reasons[0], 'REQUALIFICATION_FAILED: skip-one-suite.cjs passed 1 of 2 tests (1 skipped)');
});

test('an empty file counts as one passing test for node and must still fail: no browser line, nothing ran', LIMIT, async () => {
  const report = await run(['empty-suite.cjs']);
  const [suite] = report.requalification.suites;
  assert.deepEqual([suite.exitCode, suite.tests, suite.pass], [0, 1, 1]);
  assert.deepEqual(suite.browserVersionsSeen, []);
  assert.equal(suite.passed, false);
  assert.equal(report.ok, false);
  assert.deepEqual(report.reasonCodes, ['BROWSER_VERSION_MISSING']);
});

test('a suite that passes but prints no browser version line fails with its own code', LIMIT, async () => {
  const report = await run(['pass-suite.cjs'], {});
  const [suite] = report.requalification.suites;
  assert.deepEqual([suite.tests, suite.pass, suite.skipped, suite.todo], [2, 2, 0, 0]);
  assert.deepEqual(suite.browserVersionsSeen, []);
  assert.equal(suite.passed, false);
  assert.equal(report.requalification.passed, false);
  assert.equal(report.ok, false);
  assert.deepEqual(report.reasonCodes, ['BROWSER_VERSION_MISSING']);
  assert.match(report.reasons[0], MISSING);
  assert.equal(MISSING.exec(report.reasons[0])[1], 'pass-suite.cjs');
});

test('every suite needs its own browser line: one sighting elsewhere does not rescue a silent suite', LIMIT, async () => {
  const report = await run(['version-suite.cjs', 'empty-suite.cjs']);
  assert.deepEqual(report.requalification.browserVersionsSeen, [VERSION]);
  assert.deepEqual(report.requalification.suites.map((suite) => suite.passed), [true, false]);
  assert.equal(report.ok, false);
  assert.deepEqual(report.reasonCodes, ['BROWSER_VERSION_MISSING']);
  assert.equal(MISSING.exec(report.reasons[0])[1], 'empty-suite.cjs');
});

test('a suite that ran another Chromium than the qualified msedge.exe still fails closed', LIMIT, async () => {
  const report = await run(['pass-suite.cjs'], { FIXTURE_BROWSER_VERSION: '156.0.9999.1' });
  assert.equal(report.ok, false);
  assert.deepEqual(report.reasonCodes, ['BROWSER_VERSION_MISMATCH']);
  assert.match(report.reasons[0], /Chromium 156\.0\.9999\.1 but the qualified msedge\.exe is 156\.0\.4314\.58/);
  const mixed = await run(['mixed-suite.cjs'], { FIXTURE_BROWSER_VERSION: VERSION, FIXTURE_OTHER_VERSION: '155.0.1.1' });
  assert.deepEqual(mixed.requalification.browserVersionsSeen, [VERSION, '155.0.1.1']);
  assert.deepEqual(mixed.reasonCodes, ['BROWSER_VERSION_MISMATCH']);
  assert.match(mixed.reasons[0], /Chromium 155\.0\.1\.1 but/);
});

test('a forged summary printed by a suite does not replace the real counts', LIMIT, async () => {
  const report = await run(['fake-summary-suite.cjs']);
  const [suite] = report.requalification.suites;
  assert.deepEqual([suite.tests, suite.pass, suite.skipped], [2, 1, 1]);
  assert.equal(report.ok, false);
  assert.deepEqual(report.reasonCodes, ['REQUALIFICATION_FAILED']);
});

test('a failing suite names its counts, and a run without any suite never passes', LIMIT, async () => {
  const failing = await run(['fail-suite.cjs']);
  assert.equal(failing.ok, false);
  assert.deepEqual(failing.reasonCodes, ['REQUALIFICATION_FAILED']);
  assert.equal(failing.reasons[0], 'REQUALIFICATION_FAILED: fail-suite.cjs passed 1 of 2 tests (1 failed)');
  const none = await run([]);
  assert.equal(none.ok, false);
  assert.equal(none.requalification.passed, false);
  assert.deepEqual(none.reasonCodes, ['REQUALIFICATION_FAILED']);
  assert.equal(none.reasons[0], 'REQUALIFICATION_FAILED: no suite was run');
});
