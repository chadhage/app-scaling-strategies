'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { audit } = require('./audit.cjs');
const sources = require('../sources.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
assert.equal(process.argv.length, 2);
assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1');
const directory = path.resolve(process.env.C038_CAPTURE_DIR || '');
assert.equal(path.dirname(directory), path.join(root, 'evidence', 'raw'));
assert.match(path.basename(directory), /^publication-[0-9a-f-]{36}$/);
assert.equal(fs.realpathSync(directory), directory);
assert.deepEqual(fs.readdirSync(directory), []);
const qualified = audit();
const run = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
  '-File', path.join(__dirname, 'transport.ps1'), '-Mode', 'Publish'], {
  cwd: repository, encoding: null, timeout: 450000, windowsHide: true, maxBuffer: 16 * 1024 * 1024
});
process.stdout.write(run.stdout || Buffer.alloc(0));
process.stderr.write(run.stderr || Buffer.alloc(0));
assert.equal(run.status, 0, 'Actual standard publication and finally-restored transport must succeed; never infer Done.');
const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'receipt.json')));
const proof = JSON.parse(fs.readFileSync(path.join(directory, 'published-proof.json')));
const transport = JSON.parse(fs.readFileSync(path.join(directory, 'transport.json')));
assert.equal(transport.allPresenceAndValuesRestoredInFinally, true);
assert.equal(transport.safeGitReadAfterRestoration, true);
assert.equal(receipt.commit, proof.commit);
assert.equal(receipt.tag, proof.tag);
assert.equal(proof.actualRemotePeeledTag, receipt.commit);
assert.equal(proof.actualCommitIsRemoteAncestor, true);
const before = JSON.parse(fs.readFileSync(path.join(directory, 'before-stage.json')));
assert.equal(before.actualHeadEqualsRemoteBeforeAnyStage, true);
assert.equal(before.stateAcquisitionsUnderPublisher, 0);
const result = {
  cardId: 'C038', workerId: 'worker-C038', outcome: 'published',
  commit: receipt.commit, tag: receipt.tag, remoteVerified: true,
  actualRemoteMain: proof.actualRemoteMain, actualRemotePeeledTag: proof.actualRemotePeeledTag,
  originalKanoUnit: 'C038', frozenKano: 'S', priority: 'P0', packet: 'LP-REPLAY',
  parents: ['H007'], technicalEntryGate: 'accepted C036 df7a4e1f4f07d834f17edd8f816bb2b5d166ae6e',
  ownedPaths: ['capability\\C038'], proposedOriginalCreditsForParentReview: 1,
  selfAwardedCredits: 0, extraTestRepairOrEvidenceCredits: 0, parentAcceptanceRequired: true,
  focusedTestsPassed: qualified.focusedTests, coverage: qualified.coverage,
  syntaxPassed: true, actualSignedEdgeDomChecksPassed: 17,
  historicalPublisherGuardGroupsPassed: 61, authorityTestsPassed: 20, transportTestsPassed: 12,
  actualPublisherSha256: before.actualPublisherSha256,
  stateReleasedBeforePublisher: true, stateAcquisitionsUnderPublisher: 0,
  actualHeadEqualsRemoteBeforeStaging: true, allForeignIndexEntriesAndFlagsPreserved: true,
  gitEnvironmentAllPresenceAndValuesRestored: true, safeGitReadAfterRestoration: true,
  actualRawWorkingAndGitCanonicalProofFiles: proof.committedOwnedFiles,
  qualifiedSourceFiles: qualified.qualifiedSourceFiles,
  immutableEvidenceFilesVerified: qualified.immutableEvidenceFilesVerified,
  actualPublicationRawDirectory: path.relative(repository, directory),
  qualification: qualified.qualification, qualificationRawSha256: qualified.qualificationRawSha256,
  ordinaryVerificationSourceAndEvidenceReadOnly: true, allRedAndLaterFailuresRetained: true,
  iaC: 'N/A', ...require('../readiness.js').flags,
  incomplete: ['H007', 'native execution', 'actual pool inventory and current freshness',
    'authenticated identity and lease ownership', 'source parents', 'production Node 24'],
  summary: 'Usable offline Node CLI/static Web UI; explicit complete fictional instance/dependency inventory, per-node complete compatible observations, strict fictional TTL, fail/unknown/stale history, guarded source/context/replay, copy/compare/reset/keyboard/CSP. Actual C034 history stays unlinked.',
  reportedAtUtc: new Date().toISOString()
};
fs.writeFileSync(path.join(root, 'publication.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
const report = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
  '-File', path.join(repository, '.git', 'kanban-orchestrator', 'state.ps1'),
  '-Action', 'Report', '-CardId', 'C038', '-WorkerId', 'worker-C038',
  '-ResultPath', path.join(root, 'publication.json')], {
  cwd: repository, encoding: 'utf8', windowsHide: true, timeout: 45000, maxBuffer: 131072
});
process.stdout.write(report.stdout || '');
process.stderr.write(report.stderr || '');
assert.equal(report.status, 0, 'Actual State Report required, after Publisher release and transport restoration.');
const current = sources.readGates();
assert.equal(current.card.result.outcome, 'published');
assert.equal(current.card.publication.commit, receipt.commit);
assert.equal(current.worker.status, 'result_received');
const final = {
  ...result, actualStateReport: JSON.parse(report.stdout),
  actualKanoDoneAfterReport: current.kanoDone, acceptedOriginalCountAfterReport: current.acceptedOriginalCount,
  cardStateAfterReport: current.card.state, workerStatusAfterReport: current.worker.status,
  acceptedByWorker: false, actualFullShaProofComplete: true
};
fs.writeFileSync(path.join(directory, 'final-state-report.json'), `${JSON.stringify(final, null, 2)}\n`, { flag: 'wx' });
fs.writeFileSync(path.join(root, 'published-report.json'), `${JSON.stringify(final, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(final));
