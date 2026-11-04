'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, sha, historicalPublisherBoundary, verifyHistoricalPublisher } = require('./provenance.cjs');
const { assessAuthority, inspectCurrent } = require('./publisher-authority.cjs');

const history = JSON.parse(fs.readFileSync(path.join(root, 'publisher-history.json'), 'utf8'));
const data = (entry) => JSON.parse(fs.readFileSync(path.join(root, entry.path), 'utf8'));
const source = fs.readFileSync(path.join(root, history.publisherSourceSnapshot.path));
const captured = data(history.files.authority);
const boundary = data(history.files.boundary);
const report = data(history.files.publishedReport);
function snapshot() {
  return {
    schemaVersion: 1, sourceSelector: 'localPublisherAuthorization',
    controllerId: '942b9aec-aa3f-4179-b6ed-e2bc57abeed2',
    authorization: structuredClone(captured.currentParentAuthorization),
    card: { ...structuredClone(captured.currentCard), kanoUnit: 'C018', readiness: true },
    worker: { id: 'worker-C018', cardId: 'C018', status: 'running' },
    prerequisite: { id: 'C015', state: 'Done' },
  };
}

test('authentic parent failure and published F6 report remain byte-exact historical evidence', () => {
  for (const entry of Object.values(history.files)) assert.equal(sha(fs.readFileSync(path.join(root, entry.path))), entry.rawSha256);
  const failure = fs.readFileSync(path.join(root, history.files.parentFailure.path), 'utf8');
  assert.match(failure, /^# tests 15$/m);
  assert.match(failure, /^# pass 14$/m);
  assert.match(failure, /^# fail 1$/m);
  assert.match(failure, /^# duration_ms 203238\.5242$/m);
  assert.equal(historicalPublisherBoundary().historicalSnapshotVerified, true);
});

test('later canonical parent authority cannot relabel the immutable 845079 F6 source or report', () => {
  const laterBytes = Buffer.from('synthetic later explicitly approved controller publisher for unit comparison only');
  const later = snapshot();
  later.authorization.publisherSha256 = sha(laterBytes);
  const current = inspectCurrent(later, sha(laterBytes));
  assert.equal(current.exactAuthorizedBytes, true);
  assert.equal(current.normalVerificationAuthorizesPublication, false);
  assert.equal(current.publicationPerformed, false);
  assert.equal(verifyHistoricalPublisher(history, source, boundary, captured, report).usedPublisherSha256, history.publisherRawSha256);
  assert.throws(() => verifyHistoricalPublisher({ ...history, publisherRawSha256: sha(laterBytes) },
    source, boundary, captured, report), /HISTORICAL_ATTRIBUTION_MISMATCH/);
  assert.throws(() => verifyHistoricalPublisher(history, laterBytes, boundary, captured, report), /HISTORICAL_SOURCE_MISMATCH/);
});

test('unknown live bytes remain HOLD despite valid parent data, and historical F6 is not a current fallback', () => {
  const later = snapshot();
  later.authorization.publisherSha256 = 'a'.repeat(64);
  assert.equal(inspectCurrent(later, 'b'.repeat(64)).code, 'HOLD_UNAPPROVED_PUBLISHER');
  assert.equal(inspectCurrent(later, history.publisherRawSha256).exactAuthorizedBytes, false);
  assert.equal(inspectCurrent(later, null).exactAuthorizedBytes, false);
  assert.equal(historicalPublisherBoundary().historicalSnapshotVerified, true);
});

test('missing, wrong-class, wrong-scope and weakened canonical authority never gain a positive default', () => {
  assert.equal(assessAuthority(null).approved, false);
  for (const mutate of [
    (value) => { value.authorization.approvedBy = 'visitor'; },
    (value) => { value.authorization.exactAddedClasses.C018 = 'D'; },
    (value) => { value.authorization.mainMustEqualRemoteBeforeStaging = 'true'; },
    (value) => { value.authorization.namespaceAndFrozenClassGuardsUnchanged = false; },
    (value) => { value.authorization.cloudAuthorityExpanded = true; },
    (value) => { value.card.localScope += ' expanded'; },
    (value) => { value.card.kanoUnit = 'new-unit'; },
    (value) => { value.card.technicalEntryGate = 'SOURCE'; },
    (value) => { value.worker.id = 'another-worker'; },
    (value) => { value.prerequisite.state = 'To Do'; },
    (value) => { delete value.authorization.publisherSha256; },
  ]) {
    const invalid = snapshot();
    mutate(invalid);
    assert.equal(assessAuthority(invalid).approved, false);
    assert.equal(inspectCurrent(invalid, history.publisherRawSha256).exactAuthorizedBytes, false);
  }
});

test('read-only current diagnostics cannot authorize publication and wrong live ownership is not ready', () => {
  const valid = snapshot();
  assert.equal(assessAuthority(valid).delegationReady, true);
  for (const mutate of [
    (value) => { value.card.owner = 'another-worker'; },
    (value) => { value.card.state = 'Done'; },
    (value) => { value.card.readiness = 'true'; },
    (value) => { value.worker.status = 'result_received'; },
  ]) {
    const held = snapshot();
    mutate(held);
    const observed = inspectCurrent(held, held.authorization.publisherSha256);
    assert.equal(observed.delegationReady, false);
    assert.equal(observed.normalVerificationAuthorizesPublication, false);
    assert.equal(observed.publicationPerformed, false);
  }
});

test('actual publication wrapper reads released canonical state before acquiring publisher lock and uses unchanged standard delegation', () => {
  const wrapper = fs.readFileSync(path.join(__dirname, 'publisher-wrapper.ps1'), 'utf8');
  assert.equal(wrapper.indexOf('Read-CanonicalParent') < wrapper.indexOf('$held = $mutex.WaitOne'), true);
  assert.match(wrapper, /-CardId C018 -WorkerId worker-C018 -Paths @\('capability\\C018'\)/);
  assert.doesNotMatch(wrapper, /-Admin|git add|git commit|git push|Register|Claim|Reset|Force/);
});
