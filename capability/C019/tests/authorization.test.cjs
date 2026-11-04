'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateCurrent, readCurrent, loadSnapshot, assess, assessCurrent } = require('./authorization.cjs');
const { repo, root, sha } = require('./provenance.cjs');
const manifest = require('..\\manifest.json');
const snapshot = loadSnapshot();
const current = snapshot.authorization;
const actualBytes = () => fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'publish.ps1'));
const actual = () => sha(actualBytes());
const edited = (change) => { const value = structuredClone(current); change(value); return value; };

test('current canonical controller revision is authority, not a forever historical digest', () => {
  const result = assess(readCurrent(), snapshot, actual());
  assert.equal(result.approved, true);
  assert.equal(result.sourceSelector, manifest.publisherAuthorizationSelector);
  assert.equal(result.authorizedSha256, manifest.publisherSha256);
  assert.equal(result.historicalSnapshotIsCurrentAuthority, false);
  assert.equal(result.parentReportedGuardChecks, 51);
});
test('a digest without its explicit approved controller record cannot authorize publication', () => {
  for (const value of [{}, { publisherSha256: actual() }, null]) {
    assert.equal(assess(value, snapshot, actual()).approved, false);
  }
  assert.equal(validateCurrent(edited((value) => { delete value.central.approvedRevision; })), null);
});
test('unknown selectors, controllers or approvers fail closed', () => {
  for (const change of [
    (value) => { value.controllerId = 'unknown-controller'; },
    (value) => { value.sourceSelector = 'arbitrary.digest'; },
    (value) => { value.central.approvedBy = 'local-file'; },
    (value) => { value.central.approvedRevision.approvedBy = 'worker-C019'; },
  ]) assert.equal(validateCurrent(edited(change)), null);
});
test('unapproved actual guard changes fail despite unchanged earlier proof', () => {
  const result = assess(current, snapshot, '0'.repeat(64));
  assert.equal(result.approved, false);
  assert.equal(result.code, 'PUBLISHER_SCRIPT_MISMATCH');
  assert.equal(result.authorizedSha256, manifest.publisherSha256);
});
test('changed valid-looking controller data cannot silently replace the approved source snapshot', () => {
  const changed = edited((value) => {
    value.central.publisherSha256 = '0'.repeat(64);
    value.central.approvedRevision.publisherSha256 = '0'.repeat(64);
  });
  assert.ok(validateCurrent(changed));
  assert.equal(assess(changed, snapshot, '0'.repeat(64)).code, 'PUBLISHER_AUTHORIZATION_CHANGED');
});
test('namespace/class/HEAD/cloud/credit flags and numeric guard counts remain strict', () => {
  for (const change of [
    (value) => { value.central.c019Class = 'D'; },
    (value) => { value.central.mainMustEqualRemoteBeforeStaging = false; },
    (value) => { value.central.namespaceAndFrozenClassGuardsUnchanged = false; },
    (value) => { value.central.approvedRevision.namespaceFrozenClassAdminHeadAndWhitespaceRulesRetained = false; },
    (value) => { value.central.approvedRevision.cloudIdentityOrInfrastructureAuthorityExpanded = true; },
    (value) => { value.central.approvedRevision.extraCredits = 1; },
    (value) => { value.central.approvedRevision.focusedGuardChecksPassed = '51'; },
  ]) assert.equal(validateCurrent(edited(change)), null);
});
test('this explicit revision admits only C029 D and X003 L with the named accepted packet', () => {
  for (const change of [
    (value) => { value.central.approvedRevision.exactAddedClasses.X003 = 'D'; },
    (value) => { value.central.approvedRevision.exactAddedClasses.X004 = 'L'; },
    (value) => { value.central.approvedRevision.namedDelighterPacket = 'unknown'; },
    (value) => { value.central.approvedRevision.onlyTwoExactClassTokensChanged = false; },
  ]) assert.equal(validateCurrent(edited(change)), null);
});
test('removing only the two approved tokens reproduces historical E6 and then F6 exactly', () => {
  const bytes = actualBytes();
  const e6 = Buffer.from(bytes.toString().replace("; C029='D'", '').replace("; X003='L'", ''));
  assert.equal(sha(e6), 'e6d9e8bf9c9ff592bf463bd85656ecfec46c4eb33b0ab7f14bb7f317fcc65e22');
  const f6 = Buffer.from(e6.toString().replace("; C036='D'", ''));
  const historical = JSON.parse(fs.readFileSync(path.join(root, manifest.historicalF6AuthorizationSnapshot)));
  assert.equal(sha(f6), historical.actualPublisherSha256);
});
test('approved source alone cannot substitute for current running-owner admission or HEAD equality', () => {
  const idle = edited((value) => { value.delegation.workerStatus = 'result_received'; });
  assert.equal(assess(idle, snapshot, actual()).approved, true);
  assert.equal(assess(idle, snapshot, actual()).delegationReady, false);
  const wrapper = fs.readFileSync(path.join(__dirname, 'publisher-wrapper.ps1'), 'utf8');
  assert.ok(wrapper.includes('$head -eq $remoteMain'));
  assert.ok(wrapper.includes('if (-not $ready)'));
  assert.ok(wrapper.includes("-Paths @('capability\\C019')"));
});
test('current assessment preserves both approved and actual guard digests and creates no credits', () => {
  const result = assessCurrent();
  assert.equal(result.approved, true);
  assert.equal(result.authorizedSha256, actual());
  assert.equal(result.observedSha256, actual());
  assert.equal(result.originalUnitCredits, 0);
});
