'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { verify } = require('./verify.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
if (process.argv.length !== 2 || process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Exact explicit own publication report only.');
const directory = path.resolve(process.env.C037_CAPTURE_DIR || '');
assert.equal(path.dirname(directory), path.join(root, 'evidence', 'raw'));
assert.match(path.basename(directory), /^report-[0-9a-f-]{36}$/);
assert.deepEqual(fs.readdirSync(directory), []);
const verified = verify();
const raw = path.join(root, 'evidence', 'raw');
const published = fs.readdirSync(raw).filter((entry) => /^publication-[0-9a-f-]{36}$/.test(entry) &&
  fs.existsSync(path.join(raw, entry, 'receipt.json'))).map((entry) => ({
  entry, receipt: JSON.parse(fs.readFileSync(path.join(raw, entry, 'receipt.json'), 'utf8')),
  transport: JSON.parse(fs.readFileSync(path.join(raw, entry, 'transport.json'), 'utf8'))
}));
assert.equal(published.length, 1, 'Exactly one original C037 publication, not extra repair commits.');
const { receipt, transport, entry } = published[0];
assert.equal(transport.exitCode, 0);
assert.equal(transport.restoredPresenceAndValueInFinally, true);
assert.equal(transport.safeGitReadAfterRestorePassed, true);
assert.equal(transport.unchangedStandardPublisherInvoked, true);
assert.equal(receipt.unownedIndexEntriesAndFlagsUnchanged, true);
assert.equal(receipt.remoteVerified, true);
const qualified = receipt.qualification;
assert.equal(qualified.sourceAndEvidenceQualified, true);
for (const file of qualified.files) {
  assert.equal(require('..\\pins.cjs').hash(fs.readFileSync(path.join(repository, file.path))), file.rawSha256);
}
const result = {
  cardId: 'C037', workerId: 'worker-C037', outcome: 'published',
  commit: receipt.commit, tag: receipt.tag, remoteMain: receipt.remoteMain,
  remotePeeledTag: receipt.remotePeeledTag, remoteVerified: true,
  remoteAnnotatedTagObject: qualified.remoteAnnotatedTagObject,
  original: { kano: 'S', kanoUnit: 'C037', priority: 'P0', packet: 'LP-REPLAY', parents: ['H007'], technicalEntryGate: 'C036' },
  acceptedC036Commit: 'df7a4e1f4f07d834f17edd8f816bb2b5d166ae6e',
  originalSProposed: 1, extraTestRepairCredits: 0, parentOnlyAcceptance: true, doneClaimedByWorker: false,
  focusedTestsPassed: true, browserObserved: true, tests: verified,
  publication: {
    publisherSha256: receipt.publisherBoundary.actualPublisherSha256,
    currentTopCanonicalApprovalLedgerRevision: receipt.publisherBoundary.currentCanonicalSnapshot.ledgerRevision,
    preStagingHead: receipt.publisherBoundary.preStagingHead,
    preStagingRemoteMain: receipt.publisherBoundary.preStagingRemoteMain,
    stateReleasedBeforePublisher: true, stateAcquiredUnderPublisher: false,
    unownedIndexEntriesAndFlagsUnchanged: true, unownedIndexBefore: receipt.publisherBoundary.unownedIndexBefore,
    unownedIndexAfter: receipt.unownedIndexAfter, transport,
    publishedOwnedFileCount: qualified.publishedOwnedFileCount, publishedChangedPaths: qualified.publishedChangedPaths,
    currentPublishedFileCount: qualified.currentPublishedFileCount, currentRawGitDifferences: qualified.currentRawGitDifferences,
    currentRawCanonicalQualification: true,
    receipt: path.join('capability', 'C037', 'evidence', 'raw', entry, 'receipt.json')
  },
  remaining: verified.remaining, liveAzureRuns: 0, cloudSpend: 0,
  actualCurrentAttributedRequests: 0, iaC: 'N/A',
  reportedAtUtc: new Date().toISOString()
};
const file = path.join(root, 'published-report.json');
fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'report.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
const output = execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
  path.join(repository, '.git', 'kanban-orchestrator', 'state.ps1'), '-Action', 'Report',
  '-CardId', 'C037', '-WorkerId', 'worker-C037', '-ResultPath', file], {
  cwd: repository, windowsHide: true, timeout: 45000, maxBuffer: 32768, encoding: 'utf8'
});
console.log(output.trim());
console.log(JSON.stringify({ cardId: 'C037', outcome: 'published-parent-acceptance-pending', commit: result.commit,
  tag: result.tag, focusedTests: verified.focusedTests, publisherGuardGroups: verified.publisherGuardGroups,
  signedEdgeDomGroups: verified.signedEdgeDomGroups, publishedOwnedFileCount: qualified.publishedOwnedFileCount,
  extraTestRepairCredits: 0, doneClaimedByWorker: false }));
