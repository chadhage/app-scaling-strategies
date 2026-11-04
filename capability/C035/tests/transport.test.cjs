'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
test('real caller process-only Git HTTP/1.1 append preserves existing slots and exact Presence+Value on success and failure', () => {
  const run = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
    '-File', path.join(__dirname, 'transport-selftest.ps1')], {
    cwd: path.resolve(__dirname, '..', '..', '..'), timeout: 30000,
    maxBuffer: 131072, encoding: 'utf8', windowsHide: true
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const lines = run.stdout.split(/\r?\n/);
  const receipts = lines.filter((line) => line.startsWith('C035_TRANSPORT_FINALLY_JSON='))
    .map((line) => JSON.parse(line.slice('C035_TRANSPORT_FINALLY_JSON='.length)));
  assert.equal(receipts.length, 3);
  for (const receipt of receipts) {
    assert.equal(receipt.exactPresenceAndValueRestored, true);
    assert.equal(receipt.workingGitReadAfterFinally, true);
    assert.equal(receipt.processLocalOnly, true);
    assert.equal(receipt.existingCountAndSlotsPreserved, true);
    assert.ok(receipt.entries.every((entry) => entry.exactPresenceAndValueRestored &&
      entry.beforePresent === entry.afterPresent));
    assert.equal(receipt.tlsProxyAuthOrGlobalConfigurationChanges, false);
  }
  const summary = JSON.parse(lines.find((line) => line.startsWith('C035_TRANSPORT_SELFTEST_JSON='))
    .slice('C035_TRANSPORT_SELFTEST_JSON='.length));
  assert.equal(summary.passed, true);
  assert.equal(summary.checks.length, 3);
  assert.equal(summary.gitWrites, 0);
});
