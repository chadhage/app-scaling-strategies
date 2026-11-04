'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { hash } = require('..\\pins.cjs');
const { root, repository } = require('./inventory.cjs');
if (process.argv.length !== 2) throw new Error('Only the exact own standard publication can be reported.');
const publication = JSON.parse(fs.readFileSync(path.join(root, 'publication.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(root, 'evidence-index.json'), 'utf8'));
assert.equal(publication.cardId, 'C036');
assert.equal(publication.workerId, 'worker-C036');
assert.equal(publication.remoteVerified, true);
assert.match(publication.commit, /^[0-9a-f]{40}$/);
assert.equal(publication.tag, `kanban/C036/${publication.commit.slice(0, 12)}`);
assert.deepEqual(publication.paths, ['capability\\C036']);
const options = { cwd: repository, timeout: 30000, maxBuffer: 65536, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] };
const refs = execFileSync('git', ['--no-pager', 'ls-remote', 'origin', 'refs/heads/main',
  `refs/tags/${publication.tag}`, `refs/tags/${publication.tag}^{}`], options).toString('utf8').trim().split(/\r?\n/);
const exact = (reference) => {
  const matching = refs.filter((line) => line.split(/\s+/)[1] === reference);
  assert.equal(matching.length, 1);
  return matching[0].split(/\s+/)[0];
};
const remoteMain = exact('refs/heads/main');
assert.equal(exact(`refs/tags/${publication.tag}^{}`), publication.commit);
execFileSync('git', ['--no-pager', 'merge-base', '--is-ancestor', publication.commit, remoteMain], options);
assert.equal(execFileSync('git', ['--no-pager', 'cat-file', '-t', `refs/tags/${publication.tag}`], options).toString('utf8').trim(), 'tag');
const report = {
  cardId: 'C036', workerId: 'worker-C036', outcome: 'published', kanoUnit: 'C036', kano: 'D',
  priority: 'P0', packet: 'H001', parents: ['H001', 'H007'], commit: publication.commit, tag: publication.tag,
  remoteMain, remotePeeledTag: publication.commit, remoteAnnotatedTagObject: exact(`refs/tags/${publication.tag}`),
  remoteVerified: true, publishedAtUtc: publication.publishedAtUtc, reportedAtUtc: new Date().toISOString(),
  publication, proof: index.sequence, evidenceIndex: 'capability\\C036\\evidence-index.json',
  evidenceIndexRawSha256: hash(fs.readFileSync(path.join(root, 'evidence-index.json'))),
  indexedSourceAndProofFiles: index.sourceAndProofFiles.length, preservedFailures: index.preservedFailures,
  counts: { ...index.counts, integrityLeaves: 5, originalDRequested: 1, extraCredits: 0 },
  actualBehavior: 'Wrong/stale/replayed/missing/unlinked evidence cannot cross the sole private local attachment/metric transition; positive controls are explicitly fictional only.',
  actualBrowserCleanup: index.browserCleanup, normalReadOnlyVerification: index.normalReadOnlyVerification,
  C015TestSetup: 'Only current-approved public persist exact closed epochs in three unique fresh C015 test UUIDs per focused run; exact created-file and empty-directory cleanup; zero retained demo/schema modifications.',
  currentPublicationAuthorizationSource: publication.publisherBoundary.currentCanonicalAuthorizationSource,
  currentPublisherSha256: publication.publisherBoundary.actualPublisherSha256,
  nativeCorrelationVerified: false, authenticatedIdentityVerified: false, leaseAuthority: false,
  productionNode24Validated: false, iac: 'N/A', liveAzureRuns: 0, authorizedCloudSpend: 0,
  incomplete: ['H001', 'H007', 'full native/authenticated client/run/user/lease correlation',
    'telemetry ingestion', 'native TCP/WS/CORS', 'broader browser helper lifecycle', 'production Node24'],
  acceptance: 'Published original C036 D only; independent parent acceptance pending. No worker Done or additional unit credit.'
};
fs.writeFileSync(path.join(root, 'published-report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({
  cardId: 'C036', outcome: 'published-report-ready', commit: report.commit, tag: report.tag,
  remoteVerified: true, counts: report.counts, proof: report.evidenceIndex,
  report: 'capability\\C036\\published-report.json', parentAcceptancePending: true
}));
