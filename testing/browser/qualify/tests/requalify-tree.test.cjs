'use strict';

// F5 of the independent review (mutant M24): the process-tree kill of a hung suite must reach a DETACHED grandchild, which
// escapes the job object that ends ordinary grandchildren with their parent. Also: a title is not a browser sighting.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { withoutKeys } = require('../adapters.cjs');
const requalify = require('../requalify.cjs');
const { scratchDir, removeDir } = require('./harness.cjs');

const fixtures = path.join(__dirname, 'fixtures');
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

test('a hung suite is ended together with a detached grandchild', { timeout: 120000 }, async () => {
  const dir = scratchDir();
  const pidFile = path.join(dir, 'detached.pid');
  try {
    const result = await requalify.runSuite('hang-detached-suite.cjs', {
      cwd: fixtures, timeoutMs: 8000, env: { ...process.env, FIXTURE_PID_FILE: pidFile },
    });
    assert.equal(result.timedOut, true);
    assert.equal(result.passed, false);
    const grandchild = Number(fs.readFileSync(pidFile, 'utf8'));
    assert.ok(grandchild > 0);
    for (let i = 0; i < 50 && alive(grandchild); i += 1) await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(alive(grandchild), false, 'the detached grandchild survived the tree kill');
  } finally {
    removeDir(dir);
  }
});

test('a test title that mentions Real Chromium is not a browser sighting, only the diagnostic line is', { timeout: 120000 }, async () => {
  const env = { ...process.env, FIXTURE_BROWSER_VERSION: '156.0.4314.58' };
  const titled = await requalify.runSuite('title-suite.cjs', { cwd: fixtures, timeoutMs: 90000, env });
  assert.equal(titled.testsPassed, true);
  assert.deepEqual(titled.browserVersionsSeen, []);
  assert.equal(titled.passed, false);
  const printed = await requalify.runSuite('version-suite.cjs', { cwd: fixtures, timeoutMs: 90000, env });
  assert.deepEqual(printed.browserVersionsSeen, ['156.0.4314.58']);
});

test('a nested run never writes V8 coverage into the coverage directory of the caller (L-0140)', { timeout: 120000 }, () => {
  const dir = scratchDir();
  try {
    const env = { ...withoutKeys(process.env, /^NODE_TEST_CONTEXT$/i), NODE_V8_COVERAGE: dir };
    const probe = spawnSync(process.execPath, [path.join(fixtures, 'coverage-probe.cjs')], { env, encoding: 'utf8', timeout: 100000, windowsHide: true });
    assert.equal(probe.status, 0, probe.stderr);
    assert.deepEqual(JSON.parse(probe.stdout.trim()), { exitCode: 0, tests: 2, files: 0 });
  } finally {
    removeDir(dir);
  }
});
