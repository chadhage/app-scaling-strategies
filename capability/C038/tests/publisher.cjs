'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const run = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
  '-File', path.join(__dirname, 'publisher-boundary.ps1')], {
  encoding: 'utf8', timeout: 180000, maxBuffer: 131072, windowsHide: true
});
assert.equal(run.status, 0, run.stderr || run.stdout);
const result = JSON.parse(run.stdout);
assert.equal(result.count, 61);
assert.ok(result.checks.every((item) => item.passed === true));
assert.equal(result.actualGitWrites, 0);
assert.equal(result.mutablePrivateSourceRead, false);
assert.equal(result.whitespaceUsedRealGitNoIndex, true);
const tests = spawnSync(process.execPath, ['--test', '--test-concurrency=1',
  path.join(__dirname, 'publisher-authority.test.cjs'), path.join(__dirname, 'transport.test.cjs')],
  { encoding: 'utf8', windowsHide: true, timeout: 240000, maxBuffer: 131072 });
process.stdout.write(tests.stdout || '');
process.stderr.write(tests.stderr || '');
assert.equal(tests.status, 0);
console.log(JSON.stringify(result));
