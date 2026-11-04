'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const phase = process.argv[2];
if (phase === 'bdd') {
  const feature = fs.readFileSync(path.join(root, 'C033.feature'), 'utf8');
  for (const term of ['before-first-read', 'between-reads', 'performance.now', 'original budget', 'unknown', 'local.probe']) {
    assert.ok(feature.includes(term), term);
  }
  console.log('BDD authored: original C033 safe boundaries, continuity, original clock/budget, uncertainty and consent.');
} else if (phase === 'stub') {
  const stub = require(path.join(root, 'evidence', 'red', 'journey.stub.cjs'));
  assert.equal(typeof stub.createJourney, 'function');
  assert.equal(stub.createJourney().snapshot().phase, 'idle');
  console.log('LOADABLE stub: createJourney imported and invoked successfully; behavior is not implemented.');
} else if (phase === 'iac') {
  console.log(JSON.stringify({
    cardId: 'C033', iac: 'N/A', reason: 'Local synthetic read-only test fixture; no infrastructure is provisioned.',
    liveAzureRuns: 0, authorizedCloudSpend: 0, identityRegistration: false,
    productionRuntimeValidated: false, nativeTargetQualified: false
  }));
} else if (phase === 'consent') {
  const { spawnSync } = require('node:child_process');
  const run = spawnSync('pwsh.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(root, 'read-consent.ps1')
  ], { timeout: 10000, windowsHide: true, encoding: null });
  if (run.status !== 0) {
    process.stderr.write(run.stderr || Buffer.alloc(0));
    process.exitCode = run.status || 1;
  } else {
    const record = JSON.parse(run.stdout.toString('utf8'));
    console.log(JSON.stringify({
      approvalStatus: record.approval?.status, dependency: record.dependency,
      mutex: record.mutex, readHandlesClosedBeforeRelease: record.readHandlesClosedBeforeRelease
    }));
  }
} else {
  throw new Error('Only closed BDD, stub, IaC-N/A and consent-reader checks are supported.');
}
