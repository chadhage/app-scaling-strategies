'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { root, repo, inventory, dependencies, sha } = require('./provenance.cjs');
const { readCurrent } = require('./authorization.cjs');
const current = readCurrent();
const publisher = fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'publish.ps1'));
if (sha(publisher) !== current.central.approvedRevision.publisherSha256) {
  throw new Error('Actual publisher differs from the explicit approved controller trace; no capture of permission.');
}
const files = inventory();
const permittedMetadata = new Set(['manifest.json', 'README.md', 'evidence-index.json',
  'tests\\verify.cjs', 'tests\\integrity.test.cjs', 'tests\\capture.cjs', 'tests\\provenance.cjs', 'tests\\boundary.cjs',
  'tests\\authorization.test.cjs', 'tests\\publisher-wrapper.ps1']);
const runtime = Object.fromEntries(Object.entries(files).filter(([file]) =>
  !file.startsWith('evidence\\') && !permittedMetadata.has(file) &&
  !['tests\\publisher-current.ps1', 'tests\\authorization.cjs', 'tests\\capture-authorization.cjs'].includes(file)));
const historicalEvidence = Object.fromEntries(Object.entries(files).filter(([file]) => file.startsWith('evidence\\')));
process.stdout.write('C019_AUTHORIZATION_RECORD=' + JSON.stringify({
  schemaVersion: 1, cardId: 'C019', workerId: 'worker-C019',
  capturedAtUtc: new Date().toISOString(), kind: 'explicit-controller-approved-publisher-source',
  authorization: current,
  actualPublisherSha256: sha(publisher),
  authorizationNotInferredFromDigest: true,
  historicalPublisherSha256: current.central.approvedRevision.previousPublisherSha256,
  originalHistoricalPublisherSha256: require('..\\manifest.json').historicalPublisherSha256,
  preservation: { runtime, historicalEvidence, dependencies: dependencies() },
  runtimeErrorsActionsC015AndHistoricalProofChanged: false,
  parentReportedGuardChecks: current.central.approvedRevision.focusedGuardChecksPassed,
  independentlyRerunParentGuardChecks: false,
  publicationAttempted: false, originalUnitCredits: 0,
}) + '\n');
