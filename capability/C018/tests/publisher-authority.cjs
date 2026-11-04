'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseJsonInput } = require('..\\..\\C002\\json-input.js');

const root = path.resolve(__dirname, '..');
const originalScope = JSON.parse(fs.readFileSync(path.join(root,
  'evidence', 'publisher-parent-authorization-025d4080-4d41-44fd-8368-be53b526d690.json'), 'utf8')).currentCard.localScope;

function hold(code) {
  return Object.freeze({ approved: false, code, authorizedSha256: null, delegationReady: false,
    diagnosticOnly: true, normalVerificationAuthorizesPublication: false, publicationPerformed: false });
}

function assessAuthority(snapshot) {
  try {
    const authority = snapshot?.authorization;
    const card = snapshot?.card;
    const worker = snapshot?.worker;
    if (snapshot?.schemaVersion !== 1 || snapshot.sourceSelector !== 'localPublisherAuthorization' ||
        snapshot.controllerId !== '942b9aec-aa3f-4179-b6ed-e2bc57abeed2' ||
        authority?.approvedBy !== 'parent-controller' || typeof authority.id !== 'string' || !authority.id ||
        !/^[a-f0-9]{64}$/.test(authority.publisherSha256 || '') ||
        authority.exactAddedClasses?.C018 !== 'S' ||
        authority.mainMustEqualRemoteBeforeStaging !== true ||
        authority.namespaceAndFrozenClassGuardsUnchanged !== true ||
        authority.cloudAuthorityExpanded !== false || authority.originalKanoCredit !== 0 ||
        authority.gitWritesDuringGuardTests !== 0 ||
        card?.id !== 'C018' || card.kano !== 'S' || card.kanoUnit !== 'C018' ||
        card.priority !== 'P0' || card.packet !== 'LP-REPLAY' || card.technicalEntryGate !== 'C015' ||
        card.authorization !== 'accepted-local-C015-public-fixture-API-consumer-only' ||
        card.localScope !== originalScope || worker?.id !== 'worker-C018' || worker.cardId !== 'C018' ||
        snapshot.prerequisite?.id !== 'C015' || snapshot.prerequisite.state !== 'Done') {
      return hold('HOLD_UNKNOWN_CONTROLLER_AUTHORITY');
    }
    return Object.freeze({
      approved: true, code: 'CANONICAL_PARENT_AUTHORITY', authorizedSha256: authority.publisherSha256,
      authorityId: authority.id,
      delegationReady: card.state === 'In Progress' && card.owner === 'worker-C018' &&
        card.readiness === true && worker.status === 'running',
      diagnosticOnly: true, normalVerificationAuthorizesPublication: false, publicationPerformed: false,
    });
  } catch {
    return hold('HOLD_UNKNOWN_CONTROLLER_AUTHORITY');
  }
}

function inspectCurrent(snapshot, actualSha256) {
  const authority = assessAuthority(snapshot);
  if (!authority.approved) return Object.freeze({ ...authority, actualSha256: actualSha256 || null, exactAuthorizedBytes: false });
  const exact = typeof actualSha256 === 'string' && actualSha256 === authority.authorizedSha256;
  return Object.freeze({ ...authority, actualSha256: actualSha256 || null, exactAuthorizedBytes: exact,
    code: exact ? 'CURRENT_CONTROLLER_BYTES_MATCH' : 'HOLD_UNAPPROVED_PUBLISHER' });
}

function readCurrentAuthority() {
  const observed = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(__dirname, 'publisher-current.ps1')],
  { encoding: 'utf8', timeout: 45000, maxBuffer: 262144, windowsHide: true });
  if (observed.error || observed.status !== 0 || observed.signal) {
    return Object.freeze({ snapshot: null, assessment: hold('HOLD_CURRENT_AUTHORITY_UNAVAILABLE') });
  }
  const parsed = parseJsonInput(observed.stdout, 'current-parent-publisher-authority');
  if (parsed.errors.length) return Object.freeze({ snapshot: null, assessment: hold('HOLD_CURRENT_AUTHORITY_INVALID') });
  return Object.freeze({ snapshot: parsed.value, assessment: assessAuthority(parsed.value) });
}

module.exports = Object.freeze({ assessAuthority, inspectCurrent, readCurrentAuthority });
