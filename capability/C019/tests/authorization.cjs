'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const types = require('..\\errors.js');
const manifest = require('..\\manifest.json');
const { root, repo, sha } = require('./provenance.cjs');

const revisions = Object.freeze({
  'localPublisherAuthorization.savedTraceRevision': {
    keys: ['approvedBy', 'acceptedDependencies', 'cloudIdentityOrInfrastructureAuthorityExpanded',
      'approvedAtUtc', 'publisherSha256', 'previousPublisherSha256', 'exactAddedClasses',
      'namespaceFrozenClassAdminHeadAndWhitespaceRulesUnchanged', 'focusedGuardChecksPassed', 'extraCredits'],
    guard: 'namespaceFrozenClassAdminHeadAndWhitespaceRulesUnchanged', count: 40,
    credits: 'extraCredits', classes: { C034: 'S' },
  },
  'localPublisherAuthorization.correlationGuardRevision': {
    keys: ['exactAddedClasses', 'previousPublisherSha256', 'acceptedPrerequisites', 'publisherSha256',
      'extraCredit', 'focusedGuardChecksPassed', 'namespaceFrozenClassAdminHeadWhitespaceAndCloudPermissionsUnchanged',
      'approvedBy', 'approvedAtUtc'],
    guard: 'namespaceFrozenClassAdminHeadWhitespaceAndCloudPermissionsUnchanged', count: 41,
    credits: 'extraCredit', classes: { C036: 'D' },
  },
  'localPublisherAuthorization.budgetAndGoalRevision': {
    keys: ['focusedGuardChecksPassed', 'namespaceFrozenClassAdminHeadAndWhitespaceRulesRetained',
      'cloudIdentityOrInfrastructureAuthorityExpanded', 'allSixDesignatedSatisfiersAlreadyAccepted',
      'ownedNamespaces', 'onlyTwoExactClassTokensChanged', 'approvedBy', 'exactAddedClasses',
      'previousPublisherSha256', 'publisherSha256', 'extraCredits', 'approvedAtUtc', 'namedDelighterPacket'],
    guard: 'namespaceFrozenClassAdminHeadAndWhitespaceRulesRetained', count: 51,
    credits: 'extraCredits', classes: { C029: 'D', X003: 'L' },
  },
});

function validateCurrent(value) {
  const item = types.record(value, ['schemaVersion', 'sourceSelector', 'controllerId', 'central', 'delegation']);
  if (!item || item.schemaVersion !== 1 || typeof item.sourceSelector !== 'string' ||
      !Object.hasOwn(revisions, item.sourceSelector) || item.controllerId !== manifest.publisherControllerId) return null;
  const central = types.record(item.central, ['id', 'approvedBy', 'publisherSha256', 'c019Class',
    'mainMustEqualRemoteBeforeStaging', 'namespaceAndFrozenClassGuardsUnchanged',
    'cloudAuthorityExpanded', 'originalKanoCredit', 'gitWritesDuringGuardTests', 'approvedRevision']);
  if (!central || central.id !== 'local-publisher-authorizations-19' ||
      central.approvedBy !== 'parent-controller' || central.c019Class !== 'S' ||
      central.mainMustEqualRemoteBeforeStaging !== true ||
      central.namespaceAndFrozenClassGuardsUnchanged !== true || central.cloudAuthorityExpanded !== false ||
      central.originalKanoCredit !== 0 || central.gitWritesDuringGuardTests !== 0) return null;
  const policy = revisions[item.sourceSelector];
  const revision = types.record(central.approvedRevision, policy.keys);
  if (!revision || revision.approvedBy !== 'parent-controller' || revision[policy.guard] !== true ||
      revision.focusedGuardChecksPassed !== policy.count || revision[policy.credits] !== 0 ||
      typeof revision.approvedAtUtc !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,7}Z$/.test(revision.approvedAtUtc) ||
      typeof revision.publisherSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(revision.publisherSha256) ||
      typeof revision.previousPublisherSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(revision.previousPublisherSha256) ||
      central.publisherSha256 !== revision.publisherSha256) return null;
  try {
    if (types.canonical(revision.exactAddedClasses) !== types.canonical(policy.classes)) return null;
    if (Object.hasOwn(revision, 'cloudIdentityOrInfrastructureAuthorityExpanded') &&
        revision.cloudIdentityOrInfrastructureAuthorityExpanded !== false) return null;
    if (item.sourceSelector.endsWith('.savedTraceRevision') &&
        types.canonical(revision.acceptedDependencies) !== '["C020","C015","C033"]') return null;
    if (item.sourceSelector.endsWith('.correlationGuardRevision') &&
        types.canonical(revision.acceptedPrerequisites) !== '["C015","C034"]') return null;
    if (item.sourceSelector.endsWith('.budgetAndGoalRevision') &&
        (revision.onlyTwoExactClassTokensChanged !== true || revision.namedDelighterPacket !== 'LP-LEARN' ||
         types.canonical(revision.ownedNamespaces) !== '["capability\\\\C029","capability\\\\X003"]' ||
         types.canonical(revision.allSixDesignatedSatisfiersAlreadyAccepted) !== '["C005","C006","C007","C008","A-S001","A-S010"]')) return null;
  } catch { return null; }
  const delegation = types.record(item.delegation, ['cardId', 'kano', 'priority', 'packet', 'gate',
    'state', 'owner', 'workerId', 'workerCardId', 'workerStatus', 'prerequisiteState']);
  if (!delegation || delegation.cardId !== 'C019' || delegation.kano !== 'S' || delegation.priority !== 'P0' ||
      delegation.packet !== 'H004' || delegation.gate !== 'C015' || delegation.workerId !== 'worker-C019' ||
      delegation.workerCardId !== 'C019' || delegation.prerequisiteState !== 'Done' ||
      !['To Do', 'In Progress', 'Done'].includes(delegation.state) || ![null, 'worker-C019'].includes(delegation.owner) ||
      !['dispatched', 'running', 'result_received', 'accepted'].includes(delegation.workerStatus)) return null;
  return types.freeze(JSON.parse(types.canonical(item)));
}

function readCurrent() {
  const result = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(__dirname, 'publisher-current.ps1')],
  { encoding: 'utf8', timeout: 45000, maxBuffer: 65536, windowsHide: true });
  if (result.error || result.status !== 0 || result.signal) {
    throw Object.assign(new Error('Controller publisher authorization unavailable; no historical fallback.'),
      { code: 'PUBLISHER_AUTHORIZATION_UNAVAILABLE' });
  }
  let value;
  try { value = JSON.parse(result.stdout); } catch {
    throw Object.assign(new Error('Controller publisher authorization is not valid JSON.'),
      { code: 'PUBLISHER_AUTHORIZATION_INVALID' });
  }
  const approved = validateCurrent(value);
  if (!approved) throw Object.assign(new Error('Explicit controller authorization did not validate.'),
    { code: 'PUBLISHER_AUTHORIZATION_INVALID' });
  return approved;
}

function loadSnapshot() {
  const relative = manifest.publisherAuthorizationSnapshot;
  if (typeof relative !== 'string' || !/^evidence\\authorization-[a-f0-9-]{36}\\authorization\.raw\.json$/.test(relative)) {
    throw Object.assign(new Error('Approved controller authorization snapshot required.'),
      { code: 'PUBLISHER_AUTHORIZATION_SNAPSHOT_MISSING' });
  }
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

function assess(current, snapshot, observedSha256) {
  const approved = validateCurrent(current);
  const captured = snapshot && validateCurrent(snapshot.authorization);
  if (!approved || !captured) return { approved: false, code: 'PUBLISHER_AUTHORIZATION_INVALID', authorizedSha256: null };
  if (types.canonical(approved.central) !== types.canonical(captured.central) ||
      approved.controllerId !== captured.controllerId || approved.sourceSelector !== captured.sourceSelector) {
    return { approved: false, code: 'PUBLISHER_AUTHORIZATION_CHANGED', authorizedSha256: null };
  }
  const authorizedSha256 = approved.central.approvedRevision.publisherSha256;
  if (manifest.publisherSha256 !== authorizedSha256 || observedSha256 !== authorizedSha256) {
    return { approved: false, code: 'PUBLISHER_SCRIPT_MISMATCH', authorizedSha256 };
  }
  return { approved: true, code: 'PUBLISHER_AUTHORIZED', authorizedSha256,
    sourceSelector: approved.sourceSelector, controllerId: approved.controllerId,
    approvedAtUtc: approved.central.approvedRevision.approvedAtUtc,
    historicalPublisherSha256: manifest.historicalPublisherSha256, historicalSnapshotIsCurrentAuthority: false,
    parentReportedGuardChecks: approved.central.approvedRevision.focusedGuardChecksPassed,
    delegationReady: approved.delegation.state === 'In Progress' &&
      approved.delegation.owner === 'worker-C019' && approved.delegation.workerStatus === 'running',
    originalUnitCredits: 0 };
}

function assessCurrent() {
  try {
    const current = readCurrent();
    const observedSha256 = sha(fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'publish.ps1')));
    return { ...assess(current, loadSnapshot(), observedSha256), observedSha256 };
  } catch (error) {
    return { approved: false, code: ['PUBLISHER_AUTHORIZATION_UNAVAILABLE', 'PUBLISHER_AUTHORIZATION_INVALID',
      'PUBLISHER_AUTHORIZATION_SNAPSHOT_MISSING'].includes(error.code) ? error.code : 'PUBLISHER_AUTHORIZATION_INVALID',
      authorizedSha256: null, observedSha256: null, originalUnitCredits: 0 };
  }
}

module.exports = Object.freeze({ validateCurrent, readCurrent, loadSnapshot, assess, assessCurrent });
