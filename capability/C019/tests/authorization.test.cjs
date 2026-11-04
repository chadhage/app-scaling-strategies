'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateCurrent, assessAuthority, inspectCurrent, readCurrent, historicalPublisher,
  assessHistorical, assessCurrent } = require('./authorization.cjs');
const { repo, root, sha } = require('./provenance.cjs');
const manifest = require('..\\manifest.json');
const historical = historicalPublisher();
const edit = (value, change) => { const copy = structuredClone(value); change(copy); return copy; };

function successor() {
  const old = historical.snapshot.authorization;
  return {
    schemaVersion: 2, sourceSelector: 'localPublisherAuthorization', controllerId: old.controllerId,
    authorization: {
      id: old.central.id, approvedBy: 'parent-controller', publisherSha256: 'a'.repeat(64),
      exactAddedClasses: { C019: 'S', C030: 'D', C035: 'D', C037: 'S', C038: 'S' },
      mainMustEqualRemoteBeforeStaging: true, namespaceAndFrozenClassGuardsUnchanged: true,
      cloudAuthorityExpanded: false, originalKanoCredit: 0, gitWritesDuringGuardTests: 0,
      classificationAndInspectionRevision: { futureSourceNotUsedAsSelector: true },
    },
    card: { id: 'C019', kano: 'S', kanoUnit: 'C019', priority: 'P0', packet: 'H004',
      technicalEntryGate: 'C015', authorization: 'accepted-local-C015-public-fixture-API-consumer-only',
      localScope: 'Actual read-only local run progress or typed error/recovery inspection over unchanged accepted C015 public APIs. Test setup only via current-approved C015 public persist in unique created test-UUID scratch, then explicit tracked cleanup; no retained demo or shared source edits.',
      state: 'In Progress', owner: 'worker-C019', readiness: true },
    worker: { id: 'worker-C019', cardId: 'C019', status: 'running' },
    prerequisite: { id: 'C015', state: 'Done' }, stateMutexReleasedBeforeReturn: true,
  };
}

test('historical 09a used immutable own 60AE bytes and its actual approved record, never future live bytes', () => {
  assert.equal(assessHistorical(historical.snapshot, historical.bytes).approved, true);
  assert.equal(historical.sha256, '60ae100b96622c8ca828d7db2f8000780476e7c7411a9f3d26f0959fd182aeea');
  assert.equal(historical.actuallyUsedByCommit, '09a12f56863d2c749811fce1e2a4479111c5fb7d');
  assert.equal(historical.currentAuthority, false);
});
test('historical token chain strips only immutable 60AE tokens to reproduce E6 and F6', () => {
  const e6 = Buffer.from(historical.bytes.toString().replace("; C029='D'", '').replace("; X003='L'", ''));
  assert.equal(sha(e6), 'e6d9e8bf9c9ff592bf463bd85656ecfec46c4eb33b0ab7f14bb7f317fcc65e22');
  const f6 = Buffer.from(e6.toString().replace("; C036='D'", ''));
  const oldF6 = JSON.parse(fs.readFileSync(path.join(root, manifest.historicalF6AuthorizationSnapshot)));
  assert.equal(sha(f6), oldF6.actualPublisherSha256);
});
test('an explicitly approved top canonical successor succeeds while immutable historical authority stays 60AE', () => {
  const next = successor();
  const current = inspectCurrent(next, next.authorization.publisherSha256);
  assert.equal(current.approved, true);
  assert.equal(current.delegationReady, true);
  assert.equal(current.sourceSelector, 'localPublisherAuthorization');
  assert.equal(assessHistorical(historical.snapshot, historical.bytes).historicalSha256, historical.sha256);
  assert.notEqual(current.authorizedSha256, historical.sha256);
});
test('unknown actual private bytes reject even if current source and all historical proof validate', () => {
  const current = successor();
  assert.equal(inspectCurrent(current, 'b'.repeat(64)).approved, false);
  assert.equal(inspectCurrent(current, 'b'.repeat(64)).code, 'PUBLISHER_SCRIPT_MISMATCH');
});
test('digest-only and arbitrary caller source selectors never become canonical authority', () => {
  for (const value of [{ publisherSha256: 'a'.repeat(64) }, {}, null,
    edit(successor(), (item) => { item.sourceSelector = 'localPublisherAuthorization.classificationAndInspectionRevision'; }),
    edit(successor(), (item) => { item.sourceSelector = 'caller.digest'; })]) {
    assert.equal(assessAuthority(value).approved, false);
  }
});
test('wrong controller, forged approver, class, exact scope or typed invariant denies', () => {
  for (const change of [
    (item) => { item.controllerId = 'caller-controller'; },
    (item) => { item.authorization.approvedBy = 'worker-C019'; },
    (item) => { item.authorization.exactAddedClasses.C019 = 'D'; },
    (item) => { item.authorization.mainMustEqualRemoteBeforeStaging = 'true'; },
    (item) => { item.authorization.namespaceAndFrozenClassGuardsUnchanged = false; },
    (item) => { item.authorization.cloudAuthorityExpanded = true; },
    (item) => { item.card.localScope += ' repair'; },
    (item) => { item.card.technicalEntryGate = 'SOURCE'; },
    (item) => { item.authorization.publisherSha256 = 'not-a-digest'; },
  ]) assert.equal(validateCurrent(edit(successor(), change)), null);
});
test('approved source does not infer running owner, readiness or a completed prerequisite', () => {
  for (const change of [
    (item) => { item.card.owner = null; },
    (item) => { item.card.state = 'To Do'; },
    (item) => { item.card.readiness = false; },
    (item) => { item.worker.status = 'result_received'; },
  ]) assert.equal(assessAuthority(edit(successor(), change)).delegationReady, false);
  assert.equal(assessAuthority(edit(successor(), (item) => { item.prerequisite.state = 'In Progress'; })).approved, false);
});
test('forged current digest cannot match actual approved successor bytes', () => {
  const current = successor();
  const forged = edit(current, (item) => { item.authorization.publisherSha256 = 'c'.repeat(64); });
  assert.equal(inspectCurrent(forged, current.authorization.publisherSha256).approved, false);
});
test('current real controller top source and actual private bytes match without nested revision enums', () => {
  const current = readCurrent();
  const actual = sha(fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'publish.ps1')));
  const result = inspectCurrent(current, actual);
  assert.equal(current.sourceSelector, 'localPublisherAuthorization');
  assert.equal(result.approved, true);
  assert.equal(result.authorizedSha256, actual);
  assert.equal(assessCurrent().observedSha256, actual);
});
test('current classification successor differs from immutable 60AE by only the approved four tokens', () => {
  const bytes = fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'publish.ps1'));
  const stripped = Buffer.from(bytes.toString().replace("; C030='D'", '').replace("; C035='D'", '')
    .replace("; C037='S'", '').replace("; C038='S'", ''));
  assert.deepEqual(stripped, historical.bytes);
});
test('wrapper reads State before Publisher and cannot indirectly reacquire State under Publisher', () => {
  const source = fs.readFileSync(path.join(__dirname, 'publisher-wrapper.ps1'), 'utf8');
  const state = source.indexOf('$canonical = Read-ApprovedSource');
  const publisher = source.indexOf('$held = $mutex.WaitOne');
  assert.ok(state >= 0 && state < publisher);
  assert.equal(source.slice(publisher).includes('Read-ApprovedSource'), false);
  assert.ok(source.includes('$head -eq $remoteMain'));
  assert.ok(source.includes("-Paths @('capability\\C019')"));
});
test('historical hash mutation or incomplete actual approval cannot fabricate 09a history', () => {
  assert.equal(assessHistorical(historical.snapshot, Buffer.from('not the used publisher')).approved, false);
  const altered = structuredClone(historical.snapshot);
  altered.authorization.central.approvedBy = 'caller';
  assert.equal(assessHistorical(altered, historical.bytes).approved, false);
});
