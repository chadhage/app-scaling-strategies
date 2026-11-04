'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const boundary = require('../publication/authorization.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
const record = JSON.parse(fs.readFileSync(path.join(repository, manifest.originalAuthorityCapture)));
const approval = JSON.parse(fs.readFileSync(path.join(repository, record.authorizationSnapshot)));
const snapshot = zlib.gunzipSync(fs.readFileSync(path.join(repository, record.publisherSnapshot)));
const clone = () => structuredClone(approval);

test('immutable original authority snapshot binds exact 60ae raw bytes without reading any mutable private publisher', () => {
  const proof = boundary.verifyCaptured(record, approval, snapshot);
  assert.equal(proof.actualRawSha256, boundary.INITIAL_SHA256);
  assert.equal(proof.kano, 'L');
  assert.equal(proof.packet, 'LP-LEARN');
  assert.equal(proof.additionalCompanionCredit, 0);
  assert.equal(Object.isFrozen(proof), true);
  assert.equal(record.usedForCommit, null);
  assert.equal(record.canonicalAuthorityReadUnderStateMutex, true);
  assert.equal(record.actualSourceReverifiedUnderPublisherMutex, true);
  const text = snapshot.toString('utf8');
  assert.equal((text.match(/\r\n/g) || []).length, 82);
  assert.equal(crypto.createHash('sha256').update(Buffer.from(text.replace(/\r\n/g, '\n'))).digest('hex'),
    record.gitCanonicalSha256);
  assert.notEqual(record.approvedRawSha256, record.gitCanonicalSha256);
});

test('current permission independently checks actual bytes against explicit canonical permission', () => {
  assert.equal(boundary.verifyAuthority(approval, snapshot).currentPermission, true);
  const changed = Buffer.from(snapshot);
  changed[0] ^= 1;
  assert.throws(() => boundary.verifyAuthority(approval, changed), { code: 'ERR_LIVE_PUBLISHER_BYTES' });
  for (const value of [undefined, null, Buffer.from('unapproved changed private publisher')]) {
    assert.throws(() => boundary.verifyAuthority(approval, value), { code: 'ERR_LIVE_PUBLISHER_BYTES' });
  }
});

test('a later explicit canonical controller approval does not invalidate immutable historical capture', () => {
  const later = clone();
  const laterBytes = Buffer.from('declared later-controller-source test fixture; not an executable publisher');
  later.localPublisherAuthorization.publisherSha256 = crypto.createHash('sha256').update(laterBytes).digest('hex');
  later.localPublisherAuthorization.id = 'explicit-later-parent-approval-test-fixture';
  assert.equal(boundary.verifyAuthority(later, laterBytes).actualRawSha256, later.localPublisherAuthorization.publisherSha256);
  assert.throws(() => boundary.verifyAuthority(approval, laterBytes), { code: 'ERR_LIVE_PUBLISHER_BYTES' });
  assert.equal(boundary.verifyCaptured(record, approval, snapshot).actualRawSha256, boundary.INITIAL_SHA256);
});

test('historical preflight cannot be silently repinned or relabeled as an old/new publication commit', () => {
  for (const changed of [
    { ...record, approvedRawSha256: '0'.repeat(64) },
    { ...record, usedForCommit: '0'.repeat(40) },
    { ...record, captureKind: 'published' },
    { ...record, cardId: 'C029' }
  ]) assert.throws(() => boundary.verifyCaptured(changed, approval, snapshot), { code: 'ERR_HISTORICAL_CAPTURE' });
  assert.throws(() => boundary.verifyCaptured(record, approval, Buffer.from('rewritten snapshot')),
    { code: 'ERR_HISTORICAL_CAPTURE' });
});

test('missing or weakened current controller authority has no arbitrary fallback', () => {
  assert.throws(() => boundary.verifyAuthority(undefined, snapshot), { code: 'ERR_CURRENT_AUTHORITY' });
  for (const key of ['approvedBy', 'publisherSha256', 'mainMustEqualRemoteBeforeStaging',
    'namespaceAndFrozenClassGuardsUnchanged', 'cloudAuthorityExpanded']) {
    const value = clone();
    delete value.localPublisherAuthorization[key];
    assert.throws(() => boundary.verifyAuthority(value, snapshot), { code: 'ERR_CURRENT_AUTHORITY' });
  }
  const arbitrary = clone();
  arbitrary.localPublisherAuthorization.publisherSha256 = '0'.repeat(64);
  assert.throws(() => boundary.verifyAuthority(arbitrary, snapshot), { code: 'ERR_LIVE_PUBLISHER_BYTES' });
});

test('original frozen class, unit, priority, packet, scope, owner and exact deliverable cannot be relabeled', () => {
  for (const [key, replacement] of Object.entries({
    kano: 'S', kanoUnit: 'X004', priority: 'P1', packet: 'LP-RINGS', owner: 'another-worker',
    state: 'Done', deliver: 'some different credit', authorization: 'cloud-execution', technicalEntryGate: 'none'
  })) {
    const value = clone();
    value.cards.find(card => card.id === 'X003')[key] = replacement;
    assert.throws(() => boundary.verifyAuthority(value, snapshot), { code: 'ERR_ORIGINAL_CARD' });
  }
  const value = clone();
  value.localPublisherAuthorization.exactAddedClasses.X003 = 'S';
  assert.throws(() => boundary.verifyAuthority(value, snapshot), { code: 'ERR_CURRENT_AUTHORITY' });
});

test('the already accepted six named original S companions are not recounted, replaced or duplicated', () => {
  for (const id of boundary.COMPANIONS) {
    for (const [key, replacement] of [['state', 'In Progress'], ['kano', 'L'], ['packet', 'other'], ['kanoUnit', 'replacement']]) {
      const value = clone();
      value.cards.find(card => card.id === id)[key] = replacement;
      assert.throws(() => boundary.verifyAuthority(value, snapshot), { code: 'ERR_NAMED_PACKET' });
    }
  }
  const value = clone();
  value.cards.push(structuredClone(value.cards.find(card => card.id === 'C005')));
  assert.throws(() => boundary.verifyAuthority(value, snapshot), { code: 'ERR_NAMED_PACKET' });
});

test('the recorded 51 guards, two class tokens and E6 predecessor are preserved original authority, not new credit', () => {
  for (const key of ['focusedGuardChecksPassed', 'onlyTwoExactClassTokensChanged',
    'previousPublisherSha256', 'ownedNamespaces', 'extraCredits', 'allSixDesignatedSatisfiersAlreadyAccepted']) {
    const value = clone();
    delete value.localPublisherAuthorization.budgetAndGoalRevision[key];
    assert.throws(() => boundary.verifyAuthority(value, snapshot), { code: 'ERR_ORIGINAL_APPROVAL' });
  }
  assert.equal(boundary.verifyAuthority(approval, snapshot).predecessorSha256, boundary.PREDECESSOR_SHA256);
});

test('standard captured publisher denies every other X ID and preserves annotated atomic main/tag publication', () => {
  const source = snapshot.toString('utf8');
  assert.match(source, /X003='L'/);
  for (const id of ['X001', 'X002', 'X004', 'X005', 'X006']) assert.doesNotMatch(source, new RegExp(`${id}=`));
  assert.match(source, /Only admitted portable lessons and explicitly approved local capability IDs are authorized/);
  assert.match(source, /Main must already equal remote before staging/);
  assert.match(source, /'commit','--only'/);
  assert.match(source, /'tag','-a'/);
  assert.match(source, /'push','--atomic'/);
  assert.match(source, /Co-authored-by: Copilot/);
});

test('owned wrapper locks state before publisher, preserves foreign entries/flags, rejects unmerged and releases without Report', () => {
  const source = fs.readFileSync(path.join(root, 'publication', 'publish.ps1'), 'utf8');
  assert.ok(source.indexOf('$stateHeld=$stateMutex.WaitOne') < source.indexOf('$publisherHeld=$publisherMutex.WaitOne'));
  assert.ok(source.indexOf('$fresh=Verify-Current') < source.indexOf('& $publisher -CardId X003'));
  assert.ok(source.indexOf("$indexReady=Capture-Index 'pre-delegation'") < source.indexOf('& $publisher -CardId X003'));
  assert.ok(source.indexOf("$indexAfter=Capture-Index 'after'") > source.indexOf('& $publisher -CardId X003'));
  assert.match(source, /Verify-ForeignIndex \$indexBefore \$indexAfter/);
  assert.match(source, /-Paths @\('capability\\X003'\)/);
  assert.match(source, /Actual HEAD must already equal remote main before staging/);
  assert.match(source, /Unmerged entries or index metadata rejected/);
  assert.doesNotMatch(source, /Assert-OwnedIndex|clean global index|may resolve it/);
  assert.match(source, /finally \{[\s\S]*\$publisherMutex\.ReleaseMutex[\s\S]*\$stateMutex\.ReleaseMutex/);
  assert.doesNotMatch(source, /-Action Report|git (?:add|commit|push|reset|restore)|-Admin|Remove-Item|amend|--force/);
});
