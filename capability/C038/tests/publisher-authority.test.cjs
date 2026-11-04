'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { assessAuthority, inspectActual } = require('../boundary.cjs');
const root = path.resolve(__dirname, '..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'raw',
  'archive-241ff245-f8f4-4f6b-a8ad-f48b95603a37', 'authority.json'), 'utf8'));
test('historical fixture uses top authorization, not nested historical hash', () => {
  const copy = structuredClone(baseline);
  copy.authorization.publisherSha256 = 'f'.repeat(64);
  assert.notEqual(copy.authorization.publisherSha256, copy.authorization.classificationAndInspectionRevision.publisherSha256);
  const result = inspectActual(copy, 'f'.repeat(64));
  assert.equal(result.exactAuthorizedBytes, true);
  assert.equal(result.nestedRevisionsAreHistoricalNotCurrentHashes, true);
  assert.equal(result.normalVerificationAuthorizesPublication, false);
  assert.equal(result.publicationPerformed, false);
  assert.equal(inspectActual(copy, baseline.authorization.publisherSha256).exactAuthorizedBytes, false);
});
const changes = [
  ['wrong top class', (s) => { s.authorization.exactAddedClasses.C038 = 'D'; }],
  ['string top invariant', (s) => { s.authorization.mainMustEqualRemoteBeforeStaging = 'true'; }],
  ['cloud expansion', (s) => { s.authorization.cloudAuthorityExpanded = true; }],
  ['unknown authority', (s) => { delete s.authorization.approvedBy; }],
  ['nested revision substituted as top', (s) => { s.authorization = s.authorization.classificationAndInspectionRevision; }],
  ['insufficient guard count', (s) => { s.authorization.focusedGuardChecksPassed = 60; }],
  ['changed frozen original', (s) => { s.card.kano = 'D'; }],
  ['changed packet', (s) => { s.card.packet = 'H007'; }],
  ['changed parent', (s) => { s.card.parents = ['H001']; }],
  ['expanded original scope', (s) => { s.card.localScope += ' authorize actual pool'; }],
  ['expanded owned namespace', (s) => { s.ownedPaths.push('capability\\C036'); }],
  ['wrong owner', (s) => { s.card.owner = 'worker-C037'; }],
  ['unknown worker', (s) => { s.worker.status = 'other'; }],
  ['wrong worker identity', (s) => { s.worker.id = 'worker-C048'; }],
  ['false consent', (s) => { s.C001LocalConsent = false; }],
  ['string consent', (s) => { s.C015FixtureApproval = 'true'; }],
  ['wrong accepted DF7', (s) => { s.prerequisites.find((p) => p.id === 'C036').publication.commit = '0'.repeat(40); }],
  ['unknown source selector', (s) => { s.sourceSelector = 'budgetAndGoalRevision'; }]
];
for (const [name, change] of changes) test(`${name} denied before publication`, () => {
  const copy = structuredClone(baseline);
  change(copy);
  assert.equal(assessAuthority(copy).approved, false);
  assert.equal(inspectActual(copy, baseline.authorization.publisherSha256).exactAuthorizedBytes, false);
});
test('unapproved actual bytes deny; result-received/accepted authority never grants new delegation', () => {
  assert.equal(inspectActual(baseline, '0'.repeat(64)).exactAuthorizedBytes, false);
  const copy = structuredClone(baseline);
  copy.worker.status = 'accepted';
  copy.card.state = 'Done';
  copy.card.readiness = false;
  assert.equal(assessAuthority(copy).approved, true);
  assert.equal(assessAuthority(copy).delegationReady, false);
});
