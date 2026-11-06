'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const requalify = require('../requalify.cjs');
const { fakeShell, scratchDir, removeDir } = require('./harness.cjs');

const fixtures = path.join(__dirname, 'fixtures');
const runFixture = (name, options = {}) => requalify.runSuite(name, { cwd: fixtures, timeoutMs: 90000, ...options });

test('the default suites are the two isolated helper suites that sit next to the namespace', () => {
  assert.deepEqual(requalify.SUITES, ['isolated.test.cjs', 'loopback.test.cjs']);
  assert.equal(requalify.BROWSER_DIR, path.resolve(__dirname, '..', '..'));
  for (const suite of requalify.SUITES) assert.ok(fs.existsSync(path.join(requalify.BROWSER_DIR, suite)), suite);
});

test('parseTap reads the node:test summary and the names of failed tests', () => {
  const tap = ['ok 1 - a', 'not ok 2 - b broke', 'not ok 3 - c broke', '# tests 3', '# suites 0', '# pass 1', '# fail 2',
    '# cancelled 0', '# skipped 0', '# todo 0', '# duration_ms 12.5'].join('\n');
  const parsed = requalify.parseTap(tap);
  assert.deepEqual(parsed.counts, { tests: 3, suites: 0, pass: 1, fail: 2, cancelled: 0, skipped: 0, todo: 0 });
  assert.deepEqual(parsed.failedTests, ['b broke', 'c broke']);
  assert.deepEqual(requalify.parseTap('no summary here').counts.tests, null);
});

test('childEnvironment removes NODE_TEST_CONTEXT and NODE_V8_COVERAGE in any case and keeps the rest', () => {
  const env = { NODE_TEST_CONTEXT: 'child-v8', node_v8_coverage: 'x', Keep: '1' };
  assert.deepEqual(requalify.childEnvironment(env), { Keep: '1' });
  assert.equal('NODE_TEST_CONTEXT' in requalify.childEnvironment(), false);
});

test('a passing suite is recorded with its counts, command, duration and output hash', async () => {
  const result = await runFixture('pass-suite.cjs');
  assert.equal(result.passed, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.timedOut, false);
  assert.equal(result.spawnError, null);
  assert.equal(result.summaryFound, true);
  assert.deepEqual([result.tests, result.pass, result.fail, result.cancelled, result.skipped], [2, 2, 0, 0, 0]);
  assert.deepEqual(result.command, ['node.exe', '--test', '--test-concurrency=1', '--test-reporter=tap', 'pass-suite.cjs']);
  assert.match(result.stdoutSha256, /^[0-9a-f]{64}$/);
  assert.ok(result.stdoutBytes > 0 && result.elapsedMs >= 0 && result.startedAtUtc.endsWith('Z'));
});

test('a nested run never inherits NODE_TEST_CONTEXT or NODE_V8_COVERAGE, so a failing suite is seen as failing', async () => {
  const dir = scratchDir();
  try {
    const env = { ...process.env, NODE_TEST_CONTEXT: 'child-v8', NODE_V8_COVERAGE: dir };
    const result = await runFixture('fail-suite.cjs', { env });
    assert.equal(result.passed, false);
    assert.equal(result.exitCode, 1);
    assert.deepEqual([result.tests, result.pass, result.fail], [2, 1, 1]);
    assert.deepEqual(result.failedTests, ['second fixture fails']);
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally {
    removeDir(dir);
  }
});

test('a suite that hangs is ended with its whole process tree at the timeout', async () => {
  const dir = scratchDir();
  const pidFile = path.join(dir, 'grandchild.pid');
  try {
    const result = await runFixture('hang-suite.cjs', { timeoutMs: 10000, env: { ...process.env, FIXTURE_PID_FILE: pidFile } });
    assert.equal(result.timedOut, true);
    assert.equal(result.passed, false);
    const grandchild = Number(fs.readFileSync(pidFile, 'utf8'));
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.throws(() => process.kill(grandchild, 0), { code: 'ESRCH' });
  } finally {
    removeDir(dir);
  }
});

test('the browser versions that a suite prints are recorded, and a suite that prints none records none', async () => {
  const env = { ...process.env, FIXTURE_BROWSER_VERSION: '156.0.4314.58' };
  assert.deepEqual((await runFixture('version-suite.cjs', { env })).browserVersionsSeen, ['156.0.4314.58']);
  assert.deepEqual((await runFixture('pass-suite.cjs')).browserVersionsSeen, []);
});

test('a missing node, an invalid working directory and a missing suite file all fail closed', async () => {
  const noNode = await runFixture('pass-suite.cjs', { timeoutMs: 20000, nodePath: path.join(__dirname, 'no-such-node.exe') });
  assert.equal(noNode.passed, false);
  assert.match(noNode.spawnError, /ENOENT/);
  const noDir = await runFixture('pass-suite.cjs', { timeoutMs: 20000, cwd: 'a\u0000b' });
  assert.equal(noDir.passed, false);
  assert.ok(noDir.spawnError);
  assert.equal(noDir.exitCode, null);
  const noFile = await runFixture('no-such-suite.cjs', { timeoutMs: 30000 });
  assert.equal(noFile.passed, false);
  assert.notEqual(noFile.exitCode, 0);
});

test('summarize adds the counters and an empty list of suites never counts as passed', () => {
  assert.deepEqual(requalify.summarize([]), { totals: { tests: 0, suites: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, todo: 0 }, allSuitesPassed: false });
  const suites = [{ tests: 2, pass: 2, fail: 0, passed: true }, { tests: 3, pass: 2, fail: 1, passed: false }];
  const summary = requalify.summarize(suites);
  assert.equal(summary.totals.tests, 5);
  assert.equal(summary.totals.fail, 1);
  assert.equal(summary.allSuitesPassed, false);
});

test('the heavy slot hook runs the script with -Action Acquire and Release and returns the slot number', async () => {
  const echo = "process.stdout.write(process.argv.slice(1).join(' '))";
  const slot = requalify.createSlot({ script: 'S.ps1', owner: 'U018', ...fakeShell(echo), buildArgs: (action) => ['-e', echo, action, 'x'] });
  assert.equal(await slot.acquire(), 'Acquire x');
  assert.equal(await slot.release(), undefined);
  const failing = requalify.createSlot({ script: 'S.ps1', owner: 'U018', ...fakeShell('process.exit(1)') });
  await assert.rejects(failing.acquire(), { code: 'SHELL_FAILED' });
  const noShell = requalify.createSlot({ script: 'S.ps1', owner: 'U018', env: { PATH: path.join(__dirname, 'no-such-bin') } });
  await assert.rejects(noShell.release(), (error) => error.code === 'SHELL_SPAWN' && /pwsh\.exe/.test(error.message));
});
