'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SCHEMA, formatPercent, judgeRun, evaluateFile, unrunFile, buildReport, formatSummary } = require('../evaluate.cjs');

const okRun = { status: 0, signal: null, spawnError: null, timedOut: false, stdout: '', stderr: '' };
const green = { tests: 3, pass: 3, fail: 0, cancelled: 0 };
const record = (lines, branches = [2, 2], functions = [1, 1]) => ({ lines: { covered: lines[0], total: lines[1] }, branches: { covered: branches[0], total: branches[1] }, functions: { covered: functions[0], total: functions[1] } });
const base = { file: 'a.cjs', min: 85, command: 'node --test', timeoutMs: 900000, run: okRun, summary: green, failedTests: [] };

test('formatPercent keeps enough decimals that a miss never prints as the minimum', () => {
  assert.equal(formatPercent({ covered: 861, total: 1013 }), '84.9951');
  assert.equal(formatPercent({ covered: 1, total: 1 }), '100');
  assert.equal(formatPercent({ covered: 0, total: 4 }), '0');
  assert.equal(formatPercent({ covered: 3, total: 4 }), '75');
  assert.equal(formatPercent({ covered: 45, total: 53 }), '84.9057');
});

test('a run that failed, timed out, was killed or found no tests is a failure whatever the coverage says', () => {
  const judge = (overrides, summary = green) => judgeRun({ run: { ...okRun, ...overrides }, summary, timeoutMs: 2500 });
  assert.equal(judge({}), null);
  assert.equal(judge({ status: 1 }), null, 'exit 1 is allowed: it is how Node reports a threshold miss, which the exact counts decide');
  assert.match(judge({ spawnError: 'spawn ENOENT' }), /could not start node: spawn ENOENT/);
  assert.match(judge({ timedOut: true, status: null }), /timed out after 2\.5 s: the child process tree this gate started was ended/);
  assert.match(judge({ signal: 'SIGKILL' }), /ended by signal SIGKILL/);
  assert.match(judge({}, null), /no test summary in the output, so no test ran$/);
  assert.match(judge({ stderr: '\n  Warning: node:test run() is being called recursively\n' }, null), /\(stderr: Warning: node:test run\(\) is being called recursively\)$/);
  assert.match(judge({}, { ...green, tests: 0, pass: 0 }), /no tests found: Node ran 0 tests/);
  assert.match(judge({}, { ...green, fail: 2, pass: 1 }), /2 test\(s\) failed or were cancelled/);
  assert.match(judge({}, { ...green, cancelled: 1, pass: 2 }), /1 test\(s\) failed or were cancelled/);
  assert.match(judge({}, { ...green, pass: 0 }), /no test passed/);
  assert.match(judge({ status: 9 }), /node exited with code 9/);
});

test('a file that meets the minimum in all three metrics passes with exact decimals and its evidence', () => {
  const entry = evaluateFile({ ...base, record: record([45, 50], [9, 10], [17, 20]), table: { lines: 90, branches: 90, functions: 85 } });
  assert.equal(entry.ok, true);
  assert.equal(entry.reason, null);
  assert.deepEqual([entry.lines, entry.branches, entry.functions], [90, 90, 85]);
  assert.deepEqual(entry.counts, { lines: [45, 50], branches: [9, 10], functions: [17, 20] });
  assert.equal(entry.loaded, true);
  assert.equal(entry.nodeExit, 0);
  assert.equal(entry.tests, 3);
  assert.equal(entry.command, 'node --test');
});

test('a file that no test loaded counts as 0/0/0 and fails', () => {
  const entry = evaluateFile({ ...base, record: undefined });
  assert.deepEqual([entry.loaded, entry.lines, entry.branches, entry.functions, entry.ok, entry.counts], [false, 0, 0, 0, false, null]);
  assert.match(entry.reason, /not loaded by any test: Node prints no row for it, so it counts as 0 percent/);
});

test('every metric below the minimum is named with its exact fraction and nothing is rounded up', () => {
  const entry = evaluateFile({ ...base, run: { ...okRun, status: 1 }, record: record([861, 1013], [84, 100], [6, 7]) });
  assert.equal(entry.ok, false);
  assert.equal(entry.lines < 85 && entry.lines > 84.99, true);
  assert.equal(entry.reason, 'lines 84.9951% (861 of 1013) is below 85; branches 84% (84 of 100) is below 85');
  const nothing = evaluateFile({ ...base, record: record([0, 0], [0, 0], [0, 0]) });
  assert.equal(nothing.ok, true, 'a file with nothing to count in a metric is vacuously at 100 like in the Node table');
  assert.deepEqual([nothing.lines, nothing.branches, nothing.functions], [100, 100, 100]);
});

test('a failing run fails a fully covered file and keeps the figures and the failing tests visible', () => {
  const entry = evaluateFile({
    ...base, run: { ...okRun, status: 1 }, summary: { tests: 2, pass: 1, fail: 1, cancelled: 0 }, failedTests: ['the failing test'], record: record([10, 10])
  });
  assert.equal(entry.ok, false);
  assert.equal(entry.reason, '1 test(s) failed or were cancelled');
  assert.deepEqual([entry.lines, entry.loaded], [100, true]);
  assert.deepEqual(entry.failedTests, ['the failing test']);
  assert.equal(entry.nodeExit, 1);
});

test('a timed out run reports the timeout once and does not blame the missing lcov report', () => {
  const entry = evaluateFile({ ...base, run: { ...okRun, status: null, timedOut: true }, summary: null, record: undefined, lcovError: 'no lcov file was written' });
  assert.equal(entry.reason, 'timed out after 900 s: the child process tree this gate started was ended');
  assert.equal(entry.nodeExit, null);
  assert.equal(entry.tests, null);
});

test('an unusable lcov report fails a run whose tests passed', () => {
  const entry = evaluateFile({ ...base, record: undefined, lcovError: 'no lcov file was written' });
  assert.equal(entry.ok, false);
  assert.equal(entry.reason, 'the lcov report is unusable: no lcov file was written');
});

test('the lcov counts must agree with the table Node printed in the same run', () => {
  const agree = evaluateFile({ ...base, record: record([87, 100]), table: { lines: 87, branches: 100, functions: 100 } });
  assert.equal(agree.ok, true);
  const rounded = evaluateFile({ ...base, record: record([3, 4], [2, 2], [1, 1]), min: 70, table: { lines: 75, branches: 100, functions: 100 } });
  assert.equal(rounded.ok, true);
  const different = evaluateFile({ ...base, record: record([90, 100]), table: { lines: 80, branches: 100, functions: 100 } });
  assert.equal(different.ok, false);
  assert.equal(different.reason, 'lcov and the table Node printed disagree: lines 90% in lcov but 80 in the table');
});

test('Node exiting non-zero while the exact counts meet the minimum is a disagreement, never a pass', () => {
  const entry = evaluateFile({ ...base, run: { ...okRun, status: 1 }, record: record([10, 10]) });
  assert.equal(entry.ok, false);
  assert.match(entry.reason, /node exited 1 although the exact counts meet 85/);
});

test('unrunFile fails a file whose tests could not be started, with every reason and no figures', () => {
  const entry = unrunFile({ file: 'a.cjs', reasons: ['test file not found: x', 'no tests found: y'] });
  assert.equal(entry.ok, false);
  assert.equal(entry.reason, 'test file not found: x; no tests found: y');
  assert.deepEqual([entry.lines, entry.branches, entry.functions, entry.loaded, entry.counts, entry.command], [0, 0, 0, false, null, null]);
});

const reportInput = (overrides = {}) => ({
  root: 'cap/C1', node: 'v22.0.0', min: 85, files: [evaluateFile({ ...base, record: record([10, 10]) })], unclassified: [], excluded: [],
  skippedDirectories: [], warnings: [], tests: ['cap/C1/tests/a.test.cjs'], filters: { include: [], exclude: [] }, timeoutMs: 900000, ...overrides
});

test('the report passes only when every file is ok, nothing is unclassified and something was measured', () => {
  const passing = buildReport(reportInput());
  assert.equal(passing.schema, SCHEMA);
  assert.equal(passing.schema, 'U009-coverage-gate/1');
  assert.deepEqual([passing.pass, passing.errors], [true, []]);
  for (const key of ['schema', 'root', 'node', 'min', 'files', 'unclassified', 'pass']) assert.ok(key in passing, key);
  assert.equal(buildReport(reportInput({ files: [evaluateFile({ ...base, record: undefined })] })).pass, false);
  assert.equal(buildReport(reportInput({ unclassified: [{ file: 'verify.cjs', reason: 'x' }] })).pass, false);
  const empty = buildReport(reportInput({ files: [] }));
  assert.equal(empty.pass, false);
  assert.match(empty.errors[0], /a gate over nothing is not a pass/);
});

test('the readable summary lists the enumerated files, the exclusions by origin, the failures and the verdict', () => {
  const failing = evaluateFile({ ...base, file: 'b.cjs', record: record([1, 2]) });
  const report = buildReport(reportInput({
    files: [evaluateFile({ ...base, record: record([10, 10]) }), failing],
    excluded: [{ file: 'tests/a.test.cjs', by: 'rule', reason: 'x' }, { file: 'v.cjs', by: 'manifest', reason: 'y' }, { file: 't2.cjs', by: 'rule', reason: 'x' }],
    unclassified: [{ file: 'verify.cjs', reason: 'looks like verification tooling' }], warnings: ['a warning']
  }));
  const text = formatSummary(report).join('\n');
  assert.match(text, /U009 coverage gate: root cap\/C1, minimum 85, node v22\.0\.0/);
  assert.match(text, /enumerated production files \(2\): a\.cjs, b\.cjs/);
  assert.match(text, /excluded \(3\): 2 by rule, 1 by manifest/);
  assert.match(text, /PASS {2}a\.cjs {2}lines 100\.00 {2}branches 100\.00 {2}functions 100\.00\n/);
  assert.match(text, /FAIL {2}b\.cjs {2}lines {2}50\.00 .*<- lines 50% \(1 of 2\) is below 85/);
  assert.match(text, /UNCLASSIFIED {2}verify\.cjs {2}<- looks like verification tooling/);
  assert.match(text, /note: a warning/);
  assert.match(text, /RESULT: FAIL$/);
  assert.match(formatSummary(buildReport(reportInput())).join('\n'), /RESULT: PASS$/);
  assert.match(formatSummary(buildReport(reportInput({ files: [] }))).join('\n'), /enumerated production files \(0\): none[\s\S]*note: no production files/);
});
