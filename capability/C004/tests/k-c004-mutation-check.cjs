'use strict';

// K-C004 test tooling (not a test file, never auto-discovered): proves that k-c004-global-registration.test.cjs
// bites. Copies the real files into a private mini tree OUTSIDE the repository, applies one small mutation at a
// time to the copy of a production file, and requires the new test file to fail for each. The repository is only read.
// usage: node capability\C004\tests\k-c004-mutation-check.cjs <absolute scratch directory outside the repository>

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..', '..', '..');
const scratch = process.argv[2] && path.resolve(process.argv[2]);
if (!scratch || !path.isAbsolute(process.argv[2]) || (scratch + path.sep).toLowerCase().startsWith((repo + path.sep).toLowerCase())) {
  console.error('usage: node capability\\C004\\tests\\k-c004-mutation-check.cjs <absolute scratch directory outside the repository>');
  process.exit(2);
}
const tree = path.join(scratch, 'k-c004-mutation-tree');
fs.rmSync(tree, { recursive: true, force: true });

const testFile = 'capability/C004/tests/k-c004-global-registration.test.cjs';
const fixtures = 'capability/C004/plan-fixtures.js';
const provenance = 'capability/C004/plan-provenance.js';
const files = ['capability/C002/synthetic-fixture.js', 'capability/C003/matrix-data.js', fixtures, provenance, testFile];
const original = {};
for (const file of files) {
  original[file] = fs.readFileSync(path.join(repo, file), 'utf8').replaceAll('\r\n', '\n');
  fs.mkdirSync(path.dirname(path.join(tree, file)), { recursive: true });
  fs.writeFileSync(path.join(tree, file), original[file]);
}

const guard = 'if (!envelopeRequest || !matrix || !Array.isArray(matrix.rows)) return freeze({ unavailable: true });';
const noFlag = 'if (!firstTarget) return freeze({ unavailable: true });';
const mutants = [
  ['F1 drop the missing C002 fixture guard', fixtures, guard, 'if (!matrix || !Array.isArray(matrix.rows)) return freeze({ unavailable: true });'],
  ['F2 drop the missing C003 matrix guard', fixtures, guard, 'if (!envelopeRequest || !Array.isArray(matrix.rows)) return freeze({ unavailable: true });'],
  ['F3 drop the rows array guard', fixtures, guard, 'if (!envelopeRequest || !matrix) return freeze({ unavailable: true });'],
  ['F4 drop the no flagged row guard', fixtures, noFlag, ''],
  ['F5 take the first row instead of the flagged one', fixtures, 'matrix.rows.find(row => row.firstPlannedNativeTarget)', 'matrix.rows[0]'],
  ['F6 missing-dependency record not frozen', fixtures, guard, guard.replace('freeze({ unavailable: true })', '{ unavailable: true }')],
  ['F7 no-flag record not frozen', fixtures, noFlag, noFlag.replace('freeze({ unavailable: true })', '{ unavailable: true }')],
  ['F8 browser global is writable', fixtures, '{ value: factory(root.C002SyntheticFixture, root.C003Matrix) }', '{ value: factory(root.C002SyntheticFixture, root.C003Matrix), writable: true }'],
  ['F9 browser global is a plain assignment', fixtures, "Object.defineProperty(root, 'C004Fixtures', { value: factory(root.C002SyntheticFixture, root.C003Matrix) });", 'root.C004Fixtures = factory(root.C002SyntheticFixture, root.C003Matrix);'],
  ['F10 browser global registered under another name', fixtures, "'C004Fixtures', { value:", "'C004Examples', { value:"],
  ['F11 browser path reads the wrong C002 global', fixtures, 'factory(root.C002SyntheticFixture, root.C003Matrix)', 'factory(root.C002Fixture, root.C003Matrix)'],
  ['F12 native pricing becomes not-applicable', fixtures, "status: 'missing',", "status: 'not-applicable',"],
  ['F13 local example claims a cloud resource', fixtures, 'cloudResourceCount: 0,', 'cloudResourceCount: 1,'],
  ['F14 shallow freeze only', fixtures, 'Object.values(value).forEach(freeze);\n', '\n'],
  ['F15 browser path leaks a helper global', fixtures, "Object.defineProperty(root, 'C004Fixtures',", "root.leak = 1; Object.defineProperty(root, 'C004Fixtures',"],
  ['P1 provenance global is a plain assignment', provenance, "Object.defineProperty(root, 'C004Provenance', { value: factory() });", 'root.C004Provenance = factory();'],
  ['P2 provenance global is writable', provenance, '{ value: factory() }', '{ value: factory(), writable: true }'],
  ['P3 provenance shallow freeze', provenance, 'Object.values(value).forEach(freeze);\n', '\n'],
  ['P4 provenance leaks a global', provenance, "else Object.defineProperty(root, 'C004Provenance', { value: factory() });", "else { root.leak = 1; Object.defineProperty(root, 'C004Provenance', { value: factory() }); }"],
  ['P5 provenance registered under another name', provenance, "'C004Provenance', { value:", "'C004Pins', { value:"]
];

function runTestFile() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  return spawnSync(process.execPath, ['--test', '--test-reporter=tap', testFile], { cwd: tree, env, encoding: 'utf8' });
}

let problems = 0;
const baseline = runTestFile();
console.log(`unmutated copy: exit ${baseline.status} (must be 0)`);
if (baseline.status !== 0) problems++;
for (const [label, file, from, to] of mutants) {
  if (!original[file].includes(from)) {
    console.log(`SETUP-ERROR ${label}: the pattern is not in ${file}`);
    problems++;
    continue;
  }
  fs.writeFileSync(path.join(tree, file), original[file].replace(from, () => to));
  const result = runTestFile();
  fs.writeFileSync(path.join(tree, file), original[file]);
  const failing = /^# fail (\d+)/m.exec(result.stdout || '');
  const killed = result.status !== 0;
  if (!killed) problems++;
  console.log(`${killed ? 'KILLED  ' : 'SURVIVED'} ${label} (exit ${result.status}, failing tests ${failing ? failing[1] : 'unknown'})`);
}
fs.rmSync(tree, { recursive: true, force: true });
console.log(`mutants ${mutants.length}, problems ${problems}`);
process.exitCode = problems === 0 ? 0 : 1;
