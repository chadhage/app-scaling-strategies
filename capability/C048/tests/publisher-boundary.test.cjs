'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const fixture = require('../publication/publisher-boundary.cjs.txt');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
const old = zlib.gunzipSync(fs.readFileSync(path.join(repository, manifest.publicationAuthority.sourceSnapshot)));
const current = zlib.gunzipSync(fs.readFileSync(path.join(repository, manifest.currentPublicationApproval.sourceSnapshot)));
const live = current;
const currentSha = manifest.currentPublicationApproval.approvedRawSha256;
const authorization = JSON.parse(fs.readFileSync(path.join(repository, manifest.currentPublicationApproval.authorizationSnapshot)));
const verify = (value, liveBytes, snapshotBytes) => fixture.verifyCurrent(value, liveBytes, snapshotBytes, authorization);
const approval = () => JSON.parse(JSON.stringify(manifest.currentPublicationApproval));

test('versioned current-at-capture proof verifies explicit controller approval and preserved source bytes', () => {
  const proof = verify(approval(), live, current);
  assert.equal(proof.rawSha256, currentSha);
  assert.equal(Object.isFrozen(proof), true);
});

test('immutable 06377e attribution validates its 91c8 snapshot independently of current live publisher', () => {
  const proof = fixture.verifyHistorical(manifest.publicationAuthority, old);
  assert.equal(proof.commit, fixture.historicalCommit);
  assert.equal(proof.rawSha256, fixture.historicalSha256);
  assert.notDeepEqual(old, live);
});

test('current captured bytes cannot be passed off as the historical publication source', () => {
  assert.throws(() => fixture.verifyHistorical(manifest.publicationAuthority, live), { code: 'HISTORICAL_SNAPSHOT_MISMATCH' });
});

test('historical commit may not be silently relabeled with current publisher hash', () => {
  assert.throws(() => fixture.verifyHistorical({
    ...manifest.publicationAuthority, approvedRawSha256: currentSha
  }, old), { code: 'HISTORICAL_ATTRIBUTION_MISMATCH' });
});

test('historical source cannot be attributed to another commit', () => {
  assert.throws(() => fixture.verifyHistorical({
    ...manifest.publicationAuthority, usedForCommit: '0'.repeat(40)
  }, old), { code: 'HISTORICAL_ATTRIBUTION_MISMATCH' });
});

test('arbitrary new publisher digest is not an approval', () => {
  const value = approval();
  value.approvedRawSha256 = '0'.repeat(64);
  assert.throws(() => verify(value, live, current), { code: 'UNKNOWN_CURRENT_APPROVAL' });
});

test('old historical 91c8 approval is not a fallback current version', () => {
  const value = approval();
  value.approvedRawSha256 = fixture.historicalSha256;
  assert.throws(() => verify(value, old, old), { code: 'UNKNOWN_CURRENT_APPROVAL' });
});

test('one changed live byte fails before publication', () => {
  const changed = Buffer.from(live);
  changed[0] ^= 1;
  assert.throws(() => verify(approval(), changed, current), { code: 'CURRENT_BOUNDARY_MISMATCH' });
});

test('unknown live source fails closed despite valid approval and snapshot', () => {
  assert.throws(() => verify(approval(), Buffer.from('unknown'), current), { code: 'CURRENT_BOUNDARY_MISMATCH' });
});

test('forged source snapshot cannot bless the live publisher', () => {
  assert.throws(() => verify(approval(), live, Buffer.from('forged')), { code: 'CURRENT_SNAPSHOT_MISMATCH' });
});

test('frozen original C048 D cannot be changed to another class', () => {
  const value = approval();
  value.kano = 'S';
  assert.throws(() => verify(value, live, current), { code: 'UNKNOWN_CURRENT_APPROVAL' });
});

test('current approval cannot authorize another card', () => {
  const value = approval();
  value.cardId = 'C015';
  assert.throws(() => verify(value, live, current), { code: 'UNKNOWN_CURRENT_APPROVAL' });
});

test('undeclared approval version has no positive default', () => {
  const value = approval();
  value.version = '488-v2';
  assert.throws(() => verify(value, live, current), { code: 'UNKNOWN_CURRENT_APPROVAL' });
});

test('missing or malformed approval evidence fails closed', () => {
  for (const value of [null, undefined, {}, { approvedRawSha256: currentSha }]) {
    assert.throws(() => verify(value, live, current), { code: 'UNKNOWN_CURRENT_APPROVAL' });
  }
});

test('historical inspection remains valid without querying any current live source', () => {
  const before = Buffer.from(old);
  fixture.verifyHistorical(manifest.publicationAuthority, old);
  assert.deepEqual(old, before);
  assert.throws(() => verify(approval(), undefined, current), { code: 'CURRENT_BOUNDARY_MISMATCH' });
  assert.equal(Object.isFrozen(fixture), true);
});

test('a later explicitly authorized controller source does not invalidate immutable captured or historical proof', () => {
  const laterSource = Buffer.from('synthetic later parent-approved source fixture');
  const later = JSON.parse(JSON.stringify(authorization));
  later.localPublisherAuthorization.publisherSha256 = crypto.createHash('sha256').update(laterSource).digest('hex');
  later.localPublisherAuthorization.id = 'explicit-later-controller-approval-fixture';
  assert.equal(fixture.verifyLive(later, laterSource).rawSha256, later.localPublisherAuthorization.publisherSha256);
  fixture.verifyCaptured(approval(), current, authorization);
  fixture.verifyHistorical(manifest.publicationAuthority, old);
  assert.throws(() => fixture.verifyLive(authorization, laterSource), { code: 'CURRENT_BOUNDARY_MISMATCH' });
});

test('missing or weakened canonical controller authorization never becomes a positive fallback', () => {
  assert.throws(() => fixture.verifyLive(undefined, live), { code: 'UNKNOWN_CONTROLLER_AUTHORIZATION' });
  for (const key of ['approvedBy', 'mainMustEqualRemoteBeforeStaging', 'namespaceAndFrozenClassGuardsUnchanged', 'cloudAuthorityExpanded']) {
    const bad = JSON.parse(JSON.stringify(authorization));
    delete bad.localPublisherAuthorization[key];
    assert.throws(() => fixture.verifyLive(bad, live), { code: 'UNKNOWN_CONTROLLER_AUTHORIZATION' });
  }
});
