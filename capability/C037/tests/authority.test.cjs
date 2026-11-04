'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const authority = require('..\\authority.cjs');
const pins = require('..\\pins.cjs');
const root = path.resolve(__dirname, '..');
function initial() {
  const history = JSON.parse(fs.readFileSync(path.join(root, 'authority-history.json'), 'utf8'));
  const approval = fs.readFileSync(path.join(root, history.approval));
  assert.equal(pins.hash(approval), history.approvalSha256);
  return JSON.parse(approval);
}
test('initial archived guards are historical, while actual current top approval is read under State', () => {
  const current = authority.readCurrent();
  assert.equal(current.assessment.approved, true);
  const bytes = pins.readRegular(path.join('.git', 'kanban-orchestrator', 'publish.ps1'));
  assert.equal(authority.inspect(current.snapshot, pins.hash(bytes)).exactAuthorizedBytes, true);
  assert.equal(current.snapshot.stateMutexReleasedBeforePublisher, true);
  assert.equal(current.assessment.publicationPerformed, false);
  const historical = initial();
  assert.equal(authority.assess(historical).approved, true);
});
test('unknown actual private bytes, snapshot-as-authority, invalid scopes and unaccepted entry gates fail closed', () => {
  const initialSnapshot = initial();
  assert.equal(authority.inspect(initialSnapshot, '0'.repeat(64)).exactAuthorizedBytes, false);
  const edits = [
    (s) => { s.sourceSelector = 'classificationAndInspectionRevision'; },
    (s) => { s.authorization.publisherSha256 = 'unknown'; },
    (s) => { s.authorization.approvedBy = 'worker-C037'; },
    (s) => { s.authorization.exactAddedClasses.C037 = 'D'; },
    (s) => { s.authorization.focusedGuardChecksPassed = 60; },
    (s) => { s.authorization.mainMustEqualRemoteBeforeStaging = false; },
    (s) => { s.authorization.namespaceAndFrozenClassGuardsUnchanged = false; },
    (s) => { s.authorization.cloudAuthorityExpanded = true; },
    (s) => { s.authorization.originalKanoCredit = 1; },
    (s) => { s.authorization.gitWritesDuringGuardTests = 1; },
    (s) => { s.authorization.syntaxPassed = 'true'; },
    (s) => { s.card.kano = 'D'; },
    (s) => { s.card.kanoUnit = 'repair-C037'; },
    (s) => { s.card.priority = 'P1'; },
    (s) => { s.card.parents = ['H001']; },
    (s) => { s.card.packet = 'LP-OTHER'; },
    (s) => { s.card.technicalEntryGate = 'SOURCE'; },
    (s) => { s.card.localScope += ' cloud'; },
    (s) => { s.card.authorization = 'cloud'; },
    (s) => { s.worker.id = 'worker-C038'; },
    (s) => { s.ownedPaths.push('capability\\C036'); },
    (s) => { s.C001LocalConsent = false; },
    (s) => { s.C015FixtureApproval = null; },
    (s) => { s.stateMutexReleasedBeforePublisher = false; },
    (s) => { s.prerequisites[0].accepted = 'true'; },
    (s) => { s.prerequisites[0].publication.commit = '4b2339f77704c79449270598b0896704ce7533c8'; },
    (s) => { s.prerequisites[0].reviewTag = 'unreviewed'; },
    (s) => { s.prerequisites[0].state = 'In Progress'; },
    (s) => { s.prerequisites[0].remoteVerified = false; },
    (s) => { s.prerequisites[1] = structuredClone(s.prerequisites[0]); }
  ];
  for (const edit of edits) {
    const snapshot = structuredClone(initialSnapshot);
    edit(snapshot);
    assert.equal(authority.assess(snapshot).approved, false);
  }
});
test('current explicit successor approval is not constrained by a historical nested revision hash', () => {
  const snapshot = initial();
  snapshot.authorization.publisherSha256 = 'a'.repeat(64);
  snapshot.authorization.id = 'pure-explicit-successor-unit-control-NOT-live-approval';
  snapshot.authorization.focusedGuardChecksPassed = 62;
  assert.equal(authority.inspect(snapshot, 'a'.repeat(64)).exactAuthorizedBytes, true);
  assert.notEqual(snapshot.authorization.classificationAndInspectionRevision.publisherSha256, snapshot.authorization.publisherSha256);
  snapshot.card.owner = 'other-worker';
  assert.equal(authority.assess(snapshot).delegationReady, false);
  assert.equal(authority.assess(snapshot).publicationPerformed, false);
});
test('61 archived actual-approved standard publisher guard groups perform zero actual Git writes', () => {
  const output = execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(__dirname, 'publisher-guards.ps1')], {
    cwd: path.resolve(root, '..', '..'), timeout: 180000, maxBuffer: 65536, windowsHide: true
  });
  const result = JSON.parse(output.toString('utf8'));
  assert.equal(result.checks.length, 61);
  assert.ok(result.checks.every((item) => item.passed === true));
  assert.equal(result.actualGitWrites, 0);
  assert.equal(result.archivedNotMutablePrivateSource, true);
});
test('process-local HTTP/1.1 preserves count and all slot presence/value through successful and failing operations', () => {
  const output = execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(__dirname, 'transport.test.ps1')], {
    cwd: path.resolve(root, '..', '..'), timeout: 30000, maxBuffer: 32768, windowsHide: true
  });
  const result = JSON.parse(output.toString('utf8'));
  assert.equal(result.checks.length, 7);
  assert.ok(result.checks.every((item) => item.passed === true && item.originalEnvironmentRestored === true));
  assert.equal(result.actualGitWrites, 0);
});
