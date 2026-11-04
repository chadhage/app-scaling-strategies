'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, repo, sha } = require('./provenance.cjs');

const controllerId = '942b9aec-aa3f-4179-b6ed-e2bc57abeed2';
const scope = 'Actual local idempotent/epoch-conditional commands over unchanged accepted C015 public APIs and isolated newly created C015 test-UUID scratch only. No retained demo edits, shared source change or global/native mutation authority.';
const historicalCommit = '2dd1199364eecf26b34cd5f727dfb4c33041d95e';
const historicalSha256 = 'f6df80bdafc028538813330fe810bd81a69a50822a4a862e0bf42f59b2b0b2a4';

function reject(code, message) {
  throw Object.assign(new Error(message), { code });
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

function verifyHistorical(boundary, bytes) {
  if (boundary?.role !== 'historical-publication-source' || boundary.historicalUsedForCommit !== historicalCommit ||
      boundary.parentApprovedSha256 !== historicalSha256) {
    reject('HISTORICAL_ATTRIBUTION_MISMATCH', 'The immutable original 2dd publication used F6, not a future publisher.');
  }
  if (!Buffer.isBuffer(bytes) || sha(bytes) !== historicalSha256) {
    reject('HISTORICAL_SNAPSHOT_MISMATCH', 'Historical provenance must hash its existing preserved F6 source snapshot.');
  }
  return Object.freeze({ commit: historicalCommit, rawSha256: historicalSha256, role: boundary.role });
}

function verifyAuthorization(value) {
  const central = value?.central;
  if (value?.schemaVersion !== 1 || value.sourceSelector !== 'localPublisherAuthorization' ||
      value.controllerId !== controllerId || !central || central.approvedBy !== 'parent-controller' ||
      typeof central.id !== 'string' || !central.id ||
      typeof central.publisherSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(central.publisherSha256) ||
      central.exactAddedClasses?.C016 !== 'D' || central.mainMustEqualRemoteBeforeStaging !== true ||
      central.namespaceAndFrozenClassGuardsUnchanged !== true || central.cloudAuthorityExpanded !== false ||
      central.originalKanoCredit !== 0 || central.gitWritesDuringGuardTests !== 0 ||
      central.syntaxPassed !== true || !Number.isSafeInteger(central.focusedGuardChecksPassed) ||
      central.focusedGuardChecksPassed < 39) {
    reject('UNKNOWN_CONTROLLER_AUTHORIZATION', 'Complete explicit current canonical parent authorization for original C016 D is required.');
  }
  const expected = {
    cardId: 'C016', kano: 'D', kanoUnit: 'C016', priority: 'P0', packet: 'H004', gate: 'C015',
    workerId: 'worker-C016', workerCardId: 'C016', prerequisiteState: 'Done',
    authorization: 'accepted-local-C015-public-fixture-API-consumer-only', localScope: scope,
  };
  const delegation = value.delegation;
  if (!delegation || Object.entries(expected).some(([key, item]) => delegation[key] !== item) ||
      !['To Do', 'In Progress', 'Done'].includes(delegation.state) ||
      ![null, 'worker-C016'].includes(delegation.owner) ||
      !['dispatched', 'running', 'result_received', 'accepted'].includes(delegation.workerStatus) ||
      typeof delegation.readiness !== 'boolean') {
    reject('C016_DELEGATION_INVALID', 'Original worker, frozen D/unit, entry gate and exact approved C015-consumer scope must not change.');
  }
  return Object.freeze({
    id: central.id, authorizedSha256: central.publisherSha256,
    canonicalParentRecordSha256: sha(Buffer.from(canonical(central))),
    delegationReady: delegation.state === 'In Progress' && delegation.owner === 'worker-C016' &&
      delegation.workerStatus === 'running' && delegation.readiness === true,
    parentReportedGuardChecks: central.focusedGuardChecksPassed,
  });
}

function verifyLive(value, bytes) {
  const authority = verifyAuthorization(value);
  if (!Buffer.isBuffer(bytes) || sha(bytes) !== authority.authorizedSha256) {
    reject('PUBLISHER_SCRIPT_MISMATCH', 'Unknown or changed actual private publisher bytes cannot authorize a transaction.');
  }
  return Object.freeze({ ...authority, approved: true, originalUnitCredits: 0 });
}

function readCurrent() {
  const result = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(root, 'tests', 'publisher-current.ps1')],
  { encoding: 'utf8', timeout: 45000, maxBuffer: 65536, windowsHide: true });
  if (result.error || result.status !== 0 || result.signal) {
    reject('PUBLISHER_AUTHORIZATION_UNAVAILABLE', 'Current mutex-protected parent authorization is unavailable; no historical fallback.');
  }
  let value;
  try { value = JSON.parse(result.stdout); } catch {
    reject('PUBLISHER_AUTHORIZATION_INVALID', 'Current parent authorization is not valid JSON.');
  }
  verifyAuthorization(value);
  return value;
}

function assessCurrent() {
  const authorizationSnapshot = readCurrent();
  const live = fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'publish.ps1'));
  return { ...verifyLive(authorizationSnapshot, live), authorizationSnapshot };
}

module.exports = Object.freeze({ verifyHistorical, verifyAuthorization, verifyLive, readCurrent, assessCurrent,
  historicalCommit, historicalSha256, controllerId, scope });
