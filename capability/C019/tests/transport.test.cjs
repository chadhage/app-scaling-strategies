'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('process-local HTTP/1.1 restores absent/present-empty/existing/throwing cases and rejects invalid counts', () => {
  const result = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(__dirname, 'transport-probe.ps1')],
  { encoding: 'utf8', timeout: 60000, maxBuffer: 65536, windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const proof = JSON.parse(result.stdout);
  assert.equal(proof.passed, true);
  assert.equal(proof.checks.length, 4);
  assert.ok(Number.isInteger(proof.callerPid) && proof.callerPid > 0);
  assert.equal(proof.restoredOriginalPresenceAndValue, true);
  assert.equal(proof.freshSafeGitRead, true);
  assert.equal(proof.originalFailedCallerStillFailed, true);
  assert.equal(proof.publicationPerformed, false);
  process.stdout.write('C019_TRANSPORT_PROBE=' + JSON.stringify(proof) + '\n');
});
