'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const trace = require('..\\C034\\trace.js');
const root = path.resolve(__dirname);
const usedCommit = '4b2339f77704c79449270598b0896704ce7533c8';
const usedSha256 = '60ae100b96622c8ca828d7db2f8000780476e7c7411a9f3d26f0959fd182aeea';
const e6Sha256 = 'e6d9e8bf9c9ff592bf463bd85656ecfec46c4eb33b0ab7f14bb7f317fcc65e22';
function fail(code) { throw Object.assign(new Error(code), { code }); }
function history() {
  const value = JSON.parse(fs.readFileSync(path.join(root, 'publisher-history.json'), 'utf8'));
  if (value.schemaVersion !== 1 || value.cardId !== 'C036' || value.kano !== 'D' ||
      value.role !== 'immutable-actually-used-publication' || value.usedForCommit !== usedCommit ||
      value.tag !== 'kanban/C036/4b2339f77704' || value.usedPublisherSha256 !== usedSha256 ||
      value.previousPublisherSha256 !== e6Sha256 || value.extraCredits !== 0) fail('HISTORICAL_PUBLICATION_IDENTITY_MISMATCH');
  return value;
}
function readSnapshot(entry) {
  const pins = require('./pins.cjs');
  if (!entry || typeof entry.path !== 'string' ||
      !/^evidence\\raw\\provenance-archive-[0-9a-f-]{36}\\[^\\]+$/.test(entry.path) ||
      typeof entry.rawSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.rawSha256)) fail('OWN_HISTORICAL_SNAPSHOT_REQUIRED');
  const bytes = pins.readRegular(path.join('capability', 'C036', entry.path), 8388608);
  if (pins.hash(bytes) !== entry.rawSha256) fail('HISTORICAL_SNAPSHOT_BYTE_MISMATCH');
  return bytes;
}
function historicalPublisherBoundary() {
  if (arguments.length) fail('NO_HISTORICAL_SOURCE_OVERRIDES');
  const manifest = history();
  const pins = require('./pins.cjs');
  const source = readSnapshot(manifest.publisherSource);
  const predecessor = readSnapshot(manifest.exactTwoTokenPredecessor);
  const approval = JSON.parse(readSnapshot(manifest.actualUsedApproval).toString('utf8'));
  const initial = JSON.parse(readSnapshot(manifest.initialE6Boundary).toString('utf8'));
  const stripped = Buffer.from(source.toString('utf8').replace("; C029='D'", '').replace("; X003='L'", ''), 'utf8');
  const canonical = approval.currentCanonicalAuthorization;
  if (pins.hash(source) !== usedSha256 || pins.hash(predecessor) !== e6Sha256 || !stripped.equals(predecessor) ||
      approval.actualPublisherSha256 !== usedSha256 || canonical.publisherSha256 !== usedSha256 ||
      canonical.approvedBy !== 'parent-controller' || canonical.exactAddedClasses.C036 !== 'D' ||
      canonical.budgetAndGoalRevision.publisherSha256 !== usedSha256 ||
      canonical.budgetAndGoalRevision.previousPublisherSha256 !== e6Sha256 ||
      canonical.budgetAndGoalRevision.onlyTwoExactClassTokensChanged !== true ||
      initial.actualSha256 !== e6Sha256) fail('HISTORICAL_APPROVAL_OR_EXACT_TOKEN_LINK_MISMATCH');
  return Object.freeze({
    role: manifest.role, usedForCommit: usedCommit, tag: manifest.tag,
    usedPublisherSha256: usedSha256, predecessorSha256: e6Sha256,
    ownSnapshotPath: manifest.publisherSource.path, historicalParentAuthorization: canonical,
    historicalSnapshotVerified: true, exactHistoricalTwoTokenLinkVerified: true,
    diagnosticOnly: true, normalVerificationAuthorizesPublication: false, publicationPerformed: false
  });
}
function denied(code) {
  return Object.freeze({ approved: false, code, authorizedSha256: null, delegationReady: false,
    diagnosticOnly: true, normalVerificationAuthorizesPublication: false, publicationPerformed: false });
}
function assessAuthority(snapshot) {
  try {
    trace.canonical(snapshot);
    const authority = snapshot?.authorization;
    const card = snapshot?.card;
    const worker = snapshot?.worker;
    const original = history().originalCard;
    if (snapshot?.schemaVersion !== 1 || snapshot.sourceSelector !== 'localPublisherAuthorization' ||
        snapshot.controllerId !== '942b9aec-aa3f-4179-b6ed-e2bc57abeed2' ||
        authority?.approvedBy !== 'parent-controller' || typeof authority.id !== 'string' || !authority.id ||
        typeof authority.publisherSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(authority.publisherSha256) ||
        authority.exactAddedClasses?.C036 !== 'D' || authority.mainMustEqualRemoteBeforeStaging !== true ||
        authority.namespaceAndFrozenClassGuardsUnchanged !== true || authority.cloudAuthorityExpanded !== false ||
        authority.originalKanoCredit !== 0 || authority.gitWritesDuringGuardTests !== 0 || authority.syntaxPassed !== true ||
        !Number.isSafeInteger(authority.focusedGuardChecksPassed) || authority.focusedGuardChecksPassed < 51 ||
        card?.id !== 'C036' || card.kano !== 'D' || card.kanoUnit !== 'C036' ||
        card.priority !== 'P0' || card.packet !== 'H001' || card.technicalEntryGate !== 'C015, C034' ||
        card.authorization !== original.authorization || card.localScope !== original.localScope ||
        typeof card.state !== 'string' || typeof card.readiness !== 'boolean' ||
        worker?.id !== 'worker-C036' || worker.cardId !== 'C036' || typeof worker.status !== 'string' ||
        !Array.isArray(snapshot.ownedPaths) || snapshot.ownedPaths.length !== 1 || snapshot.ownedPaths[0] !== 'capability\\C036' ||
        snapshot.C001LocalConsent !== true || snapshot.C015FixtureApproval !== true ||
        !Array.isArray(snapshot.prerequisites) || snapshot.prerequisites.length !== 2) return denied('HOLD_UNKNOWN_CURRENT_AUTHORITY');
    const expected = require('./pins.cjs').imports().accepted;
    const seen = new Set();
    for (const prerequisite of snapshot.prerequisites) {
      const pin = expected[prerequisite.id];
      if (!pin || seen.has(prerequisite.id) || prerequisite.state !== 'Done' ||
          prerequisite.publication?.commit !== pin.commit || prerequisite.publication?.tag !== pin.tag ||
          prerequisite.reviewCommit !== pin.commit || prerequisite.reviewTag !== pin.tag ||
          ['accepted', 'focusedTestsPassed', 'browserObserved', 'remoteVerified'].some((key) => prerequisite[key] !== true)) {
        return denied('HOLD_CURRENT_ACCEPTED_PREREQUISITES');
      }
      seen.add(prerequisite.id);
    }
    return Object.freeze({
      approved: true, code: 'CURRENT_CANONICAL_PARENT_AUTHORITY', authorizedSha256: authority.publisherSha256,
      authorityId: authority.id,
      delegationReady: card.state === 'In Progress' && card.owner === 'worker-C036' &&
        card.readiness === true && worker.status === 'running',
      diagnosticOnly: true, normalVerificationAuthorizesPublication: false, publicationPerformed: false
    });
  } catch { return denied('HOLD_UNKNOWN_CURRENT_AUTHORITY'); }
}
function inspectCurrent(snapshot, actualSha256) {
  const assessed = assessAuthority(snapshot);
  const exact = assessed.approved && typeof actualSha256 === 'string' && actualSha256 === assessed.authorizedSha256;
  return Object.freeze({
    ...assessed, actualSha256: typeof actualSha256 === 'string' ? actualSha256 : null,
    exactAuthorizedBytes: exact,
    code: !assessed.approved ? assessed.code : exact ? 'CURRENT_APPROVED_BYTES_MATCH' : 'HOLD_UNAPPROVED_ACTUAL_PUBLISHER'
  });
}
function readCurrentAuthority() {
  if (arguments.length) fail('NO_CURRENT_AUTHORITY_OVERRIDES');
  const bytes = execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(root, 'tests', 'publisher-current.ps1')], {
    timeout: 45000, maxBuffer: 65536, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  const snapshot = trace.parseJson(bytes.toString('utf8'));
  return Object.freeze({ snapshot, assessment: assessAuthority(snapshot) });
}
module.exports = Object.freeze({ history, readSnapshot, historicalPublisherBoundary, assessAuthority, inspectCurrent, readCurrentAuthority });
