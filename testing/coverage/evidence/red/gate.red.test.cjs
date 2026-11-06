'use strict';

// RED for U009: behavioral assertions about the specified gate, run against the naive loadable stub (gate.stub.cjs).
// Every test fixes one scenario of U009.feature; each fails because the stub does not behave as specified.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repository = path.resolve(__dirname, '..', '..', '..', '..');
const gate = path.join(__dirname, 'gate.stub.cjs');
const fixture = (name) => path.join(repository, 'testing', 'coverage', 'fixtures', name);

function run(args, extraEnvironment = {}) {
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  delete environment.NODE_V8_COVERAGE;
  const result = spawnSync(process.execPath, [gate, ...args], {
    cwd: repository, env: { ...environment, ...extraEnvironment }, encoding: 'utf8', windowsHide: true, timeout: 120000
  });
  let report = null;
  try { report = JSON.parse(result.stdout); } catch { /* the stub may print nothing parseable */ }
  return { status: result.status, report, stdout: result.stdout, stderr: result.stderr };
}

test('a production file that no test loads counts as 0 percent and fails the gate', () => {
  const { status, report } = run(['--root', fixture('unloaded')]);
  assert.equal(status, 1, 'Node exits 0 for an unloaded file (L-0003); the gate must still fail.');
  assert.equal(report.pass, false);
  const idle = report.files.find((entry) => entry.file === 'idle.cjs');
  assert.ok(idle, 'idle.cjs must be in the enumerated list');
  assert.deepEqual([idle.loaded, idle.lines, idle.branches, idle.functions, idle.ok], [false, 0, 0, 0, false]);
  assert.equal(report.files.find((entry) => entry.file === 'used.cjs').ok, true);
});

test('a file at 84.9 percent of lines fails and the report keeps the exact decimals', () => {
  const { status, report } = run(['--root', fixture('below')]);
  assert.equal(status, 1);
  const entry = report.files[0];
  assert.equal(entry.file, 'below.cjs');
  assert.ok(entry.lines > 84.9 && entry.lines < 85, `lines must be 84.9057..., got ${entry.lines}`);
  assert.equal(entry.ok, false);
  assert.match(entry.reason, /lines/);
});

test('a failing nested test cannot pass because the gate inherited NODE_TEST_CONTEXT', () => {
  const { status, report } = run(['--root', fixture('failing')], { NODE_TEST_CONTEXT: 'child-v8' });
  assert.equal(status, 1, 'Under an inherited context a nested node --test exits 0 (L-0002).');
  assert.equal(report.pass, false);
  assert.match(report.files[0].reason, /fail/i);
});

test('a missing test file fails every enumerated file and names the missing file', () => {
  const { status, report } = run(['--root', fixture('pass'), '--tests', 'testing/coverage/fixtures/pass/tests/ghost.test.cjs']);
  assert.equal(status, 1);
  assert.equal(report.pass, false);
  assert.match(report.files[0].reason, /ghost\.test\.cjs/);
});

test('an unclassified production file fails the gate as UNCLASSIFIED and is never skipped', () => {
  const { status, report } = run(['--root', fixture('unclassified')]);
  assert.equal(status, 1);
  assert.deepEqual(report.unclassified.map((entry) => entry.file), ['verify.cjs']);
  assert.equal(report.pass, false);
});

test('a namespace with no tests at all fails instead of passing vacuously', () => {
  const { status, report } = run(['--root', fixture('notests')]);
  assert.equal(status, 1, 'Without tests Node runs nothing and exits 0; the gate must fail.');
  assert.match(report.files[0].reason, /no tests/i);
});

test('a passing namespace reports exact figures in the documented JSON shape', () => {
  const { status, report } = run(['--root', fixture('pass')]);
  assert.equal(status, 0);
  assert.equal(report.schema, 'U009-coverage-gate/1');
  assert.equal(report.min, 85);
  assert.equal(typeof report.node, 'string');
  assert.deepEqual(report.unclassified, []);
  assert.deepEqual(report.files.map((entry) => [entry.file, entry.lines, entry.branches, entry.functions, entry.loaded, entry.ok]),
    [['lib.cjs', 100, 100, 100, true, true]]);
  assert.equal(report.pass, true);
});
