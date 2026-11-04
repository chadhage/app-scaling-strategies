'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { gunzipSync } = require('node:zlib');
const { parseJsonInput } = require('..\\..\\C002\\json-input.js');
const manifest = require('..\\manifest.json');
const { root, repo, sha } = require('./provenance.cjs');
const scope = 'Actual read-only local run progress or typed error/recovery inspection over unchanged accepted C015 public APIs. Test setup only via current-approved C015 public persist in unique created test-UUID scratch, then explicit tracked cleanup; no retained demo or shared source edits.';

function hold(code) {
  return Object.freeze({ approved: false, code, authorizedSha256: null, delegationReady: false,
    normalVerificationAuthorizesPublication: false, publicationPerformed: false, originalUnitCredits: 0 });
}

function validateCurrent(value) {
  try {
    const approval = value?.authorization;
    const card = value?.card;
    const worker = value?.worker;
    if (value?.schemaVersion !== 2 || value.sourceSelector !== 'localPublisherAuthorization' ||
        value.controllerId !== manifest.publisherControllerId || value.stateMutexReleasedBeforeReturn !== true ||
        approval?.approvedBy !== 'parent-controller' || approval.id !== 'local-publisher-authorizations-19' ||
        typeof approval.publisherSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(approval.publisherSha256) ||
        approval.exactAddedClasses?.C019 !== 'S' || approval.mainMustEqualRemoteBeforeStaging !== true ||
        approval.namespaceAndFrozenClassGuardsUnchanged !== true || approval.cloudAuthorityExpanded !== false ||
        approval.originalKanoCredit !== 0 || approval.gitWritesDuringGuardTests !== 0 ||
        card?.id !== 'C019' || card.kano !== 'S' || card.kanoUnit !== 'C019' || card.priority !== 'P0' ||
        card.packet !== 'H004' || card.technicalEntryGate !== 'C015' ||
        card.authorization !== 'accepted-local-C015-public-fixture-API-consumer-only' || card.localScope !== scope ||
        worker?.id !== 'worker-C019' || worker.cardId !== 'C019' ||
        value.prerequisite?.id !== 'C015' || value.prerequisite.state !== 'Done') return null;
    return value;
  } catch { return null; }
}

function assessAuthority(value) {
  const current = validateCurrent(value);
  if (!current) return hold('PUBLISHER_AUTHORIZATION_INVALID');
  return Object.freeze({
    approved: true, code: 'CANONICAL_PARENT_AUTHORITY',
    authorizedSha256: current.authorization.publisherSha256,
    sourceSelector: 'localPublisherAuthorization', controllerId: current.controllerId,
    authorityId: current.authorization.id,
    delegationReady: current.card.state === 'In Progress' && current.card.owner === 'worker-C019' &&
      current.card.readiness === true && current.worker.status === 'running',
    normalVerificationAuthorizesPublication: false, historicalSnapshotIsCurrentAuthority: false,
    stateReadBeforePublisher: true, publicationPerformed: false, originalUnitCredits: 0,
  });
}

function inspectCurrent(value, actualSha256) {
  const authority = assessAuthority(value);
  if (!authority.approved) return { ...authority, observedSha256: actualSha256 || null, exactAuthorizedBytes: false };
  const exact = typeof actualSha256 === 'string' && actualSha256 === authority.authorizedSha256;
  return { ...authority, observedSha256: actualSha256 || null, exactAuthorizedBytes: exact,
    approved: exact, code: exact ? 'PUBLISHER_AUTHORIZED' : 'PUBLISHER_SCRIPT_MISMATCH' };
}

function readCurrent() {
  const observed = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(__dirname, 'publisher-current.ps1')],
  { encoding: 'utf8', timeout: 45000, maxBuffer: 262144, windowsHide: true });
  if (observed.error || observed.status !== 0 || observed.signal) {
    throw Object.assign(new Error('Current canonical controller authority unavailable; no fallback.'),
      { code: 'PUBLISHER_AUTHORIZATION_UNAVAILABLE' });
  }
  const parsed = parseJsonInput(observed.stdout, 'current-controller-publisher');
  if (parsed.errors.length || !validateCurrent(parsed.value)) {
    throw Object.assign(new Error('Current canonical controller authority invalid; no fallback.'),
      { code: 'PUBLISHER_AUTHORIZATION_INVALID' });
  }
  return parsed.value;
}

function readCurrentAuthority() {
  try {
    const snapshot = readCurrent();
    return { snapshot, assessment: assessAuthority(snapshot) };
  } catch (error) {
    return { snapshot: null, assessment: hold(error.code === 'PUBLISHER_AUTHORIZATION_UNAVAILABLE'
      ? error.code : 'PUBLISHER_AUTHORIZATION_INVALID') };
  }
}

function loadSnapshot() {
  return JSON.parse(fs.readFileSync(path.join(root, manifest.historical60AEAuthorizationSnapshot), 'utf8'));
}

function historicalPublisher() {
  const relative = manifest.historical60AEAuthorizationSnapshot;
  const directory = path.dirname(path.join(root, relative));
  const snapshot = loadSnapshot();
  const capture = JSON.parse(fs.readFileSync(path.join(directory, 'capture.raw.json'), 'utf8'));
  const archived = capture.snapshots.find((item) => item.path === '.git\\kanban-orchestrator\\publish.ps1');
  if (!archived) throw new Error('Actual immutable 60AE publisher snapshot is required.');
  const bytes = gunzipSync(fs.readFileSync(path.join(directory, archived.working.file)));
  if (sha(bytes) !== snapshot.actualPublisherSha256 || sha(bytes) !== manifest.historical60AEPublisherSha256) {
    throw new Error('Historical 09a publisher bytes differ from their immutable receipt.');
  }
  return { snapshot, capture, bytes, sha256: sha(bytes), actuallyUsedByCommit: manifest.historicalPublicationCommit,
    currentAuthority: false };
}

function assessHistorical(snapshot, bytes) {
  const approval = snapshot?.authorization?.central;
  const revision = approval?.approvedRevision;
  const historicalSha = manifest.historical60AEPublisherSha256;
  if (snapshot?.actualPublisherSha256 !== historicalSha || sha(bytes) !== historicalSha ||
      snapshot.authorization.sourceSelector !== 'localPublisherAuthorization.budgetAndGoalRevision' ||
      approval.approvedBy !== 'parent-controller' || approval.c019Class !== 'S' ||
      approval.publisherSha256 !== historicalSha || revision?.publisherSha256 !== historicalSha ||
      revision.approvedBy !== 'parent-controller' || revision.focusedGuardChecksPassed !== 51 ||
      revision.namespaceFrozenClassAdminHeadAndWhitespaceRulesRetained !== true ||
      revision.cloudIdentityOrInfrastructureAuthorityExpanded !== false || revision.extraCredits !== 0 ||
      revision.exactAddedClasses?.C029 !== 'D' || revision.exactAddedClasses?.X003 !== 'L') {
    return hold('HISTORICAL_PUBLICATION_SOURCE_MISMATCH');
  }
  return { approved: true, code: 'IMMUTABLE_ACTUAL_09A_60AE_HISTORY', historicalSha256: historicalSha,
    actuallyUsedByCommit: manifest.historicalPublicationCommit, currentAuthority: false, originalUnitCredits: 0 };
}

function assessCurrent() {
  const current = readCurrentAuthority();
  if (!current.snapshot) return current.assessment;
  return inspectCurrent(current.snapshot, sha(fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'publish.ps1'))));
}

module.exports = Object.freeze({ validateCurrent, assessAuthority, inspectCurrent, readCurrent, readCurrentAuthority,
  loadSnapshot, historicalPublisher, assessHistorical, assessCurrent });
