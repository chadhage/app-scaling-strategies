'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { root, repository } = require('./inventory.cjs');
const { hash, readRegular } = require('..\\pins.cjs');
if (process.argv.length !== 2) throw new Error('Only exact own corrective standard publication may be reported.');
const receipts = fs.readdirSync(path.join(root, 'evidence', 'raw')).filter((name) => /^publication-[0-9a-f-]{36}$/.test(name))
  .flatMap((name) => {
    const relative = path.join('capability', 'C036', 'evidence', 'raw', name, 'receipt.json');
    if (!fs.existsSync(path.join(repository, relative))) return [];
    const receipt = JSON.parse(readRegular(relative).toString('utf8'));
    return receipt.recoveryForCommit === '4b2339f77704c79449270598b0896704ce7533c8' ? [{ receipt, relative }] : [];
  });
assert.equal(receipts.length, 1, 'Only this one unambiguous corrective receipt may be reported, never the old 4b result.');
const { receipt: publication, relative: receiptPath } = receipts[0];
assert.equal(publication.cardId, 'C036');
assert.equal(publication.workerId, 'worker-C036');
assert.equal(publication.remoteVerified, true);
assert.equal(publication.unownedIndexEntriesAndFlagsUnchanged, true);
assert.equal(publication.extraCredits, 0);
assert.equal(publication.tag, `kanban/C036/${publication.commit.slice(0, 12)}`);
const options = { cwd: repository, timeout: 30000, maxBuffer: 65536, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] };
const refs = execFileSync('git', ['--no-pager', 'ls-remote', 'origin', 'refs/heads/main',
  `refs/tags/${publication.tag}`, `refs/tags/${publication.tag}^{}`], options).toString('utf8').trim().split(/\r?\n/);
const reference = (name) => {
  const matches = refs.filter((line) => line.split(/\s+/)[1] === name);
  assert.equal(matches.length, 1);
  return matches[0].split(/\s+/)[0];
};
const remoteMain = reference('refs/heads/main');
assert.equal(reference(`refs/tags/${publication.tag}^{}`), publication.commit);
execFileSync('git', ['--no-pager', 'merge-base', '--is-ancestor', publication.commit, remoteMain], options);
const index = JSON.parse(fs.readFileSync(path.join(root, 'publisher-recovery-index-v2.json'), 'utf8'));
const report = {
  cardId: 'C036', workerId: 'worker-C036', outcome: 'published', kano: 'D', kanoUnit: 'C036',
  priority: 'P0', packet: 'H001', commit: publication.commit, tag: publication.tag,
  remoteMain, remotePeeledTag: publication.commit, remoteVerified: true,
  publication, receiptPath, previousCommit: index.previousCommit, previousTag: index.previousTag,
  evidenceIndex: 'capability\\C036\\publisher-recovery-index-v2.json',
  evidenceIndexRawSha256: hash(fs.readFileSync(path.join(root, 'publisher-recovery-index-v2.json'))),
  proof: index.proof, counts: index.counts, qualification: index.qualification,
  originalDRequested: 1, extraCredits: 0, reportedAtUtc: new Date().toISOString(),
  interpretation: 'Same original C036 D, bounded provenance correction only; old actual 4b/60AE/E6 and parent/current GREEN preserved.',
  currentAuthorizationSource: '.docs\\wiki\\flow-state.json.localPublisherAuthorization',
  currentPublisherSha256: publication.publisherBoundary.actualPublisherSha256,
  nativeCorrelationVerified: false, authenticatedIdentityVerified: false, leaseAuthority: false,
  productionNode24Validated: false, liveAzureRuns: 0, cloudSpend: 0,
  incomplete: ['H001', 'H007', 'native/authenticated correlation', 'production Node24'],
  acceptance: 'Parent-only single original C036 D acceptance pending; no corrective or test credit.'
};
const file = path.join(root, `published-provenance-report-${randomUUID()}.json`);
fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ cardId: 'C036', commit: report.commit, tag: report.tag,
  report: path.relative(repository, file), remoteVerified: true, counts: report.counts }));
