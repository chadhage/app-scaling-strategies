'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const {
  root, SOURCE_COMMIT, SOURCES, sha, git, liveSources, acceptance, inventoryCards,
} = require('.\\provenance.cjs');
if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  throw new Error('Only exact CAPTURE_BROWSER_EVIDENCE=1 permits deliberate source proof capture.');
}
const live = liveSources();
const raw = Object.fromEntries(SOURCES.map((source) => [source.key, live[source.file]]));
const canonicalGit = Object.fromEntries(SOURCES.map((source) =>
  [source.key, git(['show', `${SOURCE_COMMIT}:${source.gitPath}`])]));
assert.deepEqual(acceptance(raw), acceptance(canonicalGit), 'Exact source acceptance must still match the immutable Git pin.');
const cards = inventoryCards(live);
assert.equal(cards.length, 2);
assert.equal(cards.find((card) => card.id === 'A-S150').deliver,
  'Retire v1 with outstanding dependencies; identify the check that must prevent deletion.');
const captures = [];
const entries = SOURCES.map((source) => {
  const rawSnapshot = `source-${source.key}-raw.snapshot.gz`;
  const gitSnapshot = `source-${source.key}-git.snapshot.gz`;
  const rawGzip = zlib.gzipSync(raw[source.key]);
  const gitGzip = zlib.gzipSync(canonicalGit[source.key]);
  captures.push([rawSnapshot, rawGzip], [gitSnapshot, gitGzip]);
  return {
    repositoryPath: source.file, gitObjectPath: source.gitPath, rawSnapshot, gitSnapshot,
    rawSha256: sha(raw[source.key]), gitSourceSha256: sha(canonicalGit[source.key]),
    rawSnapshotSha256: sha(rawGzip), gitSnapshotSha256: sha(gitGzip),
    rawLength: raw[source.key].length, gitLength: canonicalGit[source.key].length,
    rawCRLFCount: (raw[source.key].toString().match(/\r\n/g) || []).length,
    gitCRLFCount: (canonicalGit[source.key].toString().match(/\r\n/g) || []).length,
  };
});
captures.push(['source-contract.json', Buffer.from(`${JSON.stringify({
  schemaVersion: 1, cardId: 'A-S150', workerId: 'worker-A-S150',
  sourceCommit: SOURCE_COMMIT, capturedAtUtc: new Date().toISOString(),
  captureExplicitlyEnabled: true, mutex: 'Local\\AppScalingStrategies_KanbanState_v1',
  readHandlesClosedBeforeRelease: true,
  acceptance: acceptance(raw), inventoryCards: cards, entries,
  snapshotScope: 'Supplied root source documentation only. No other lesson/capability code, flow-state.json, worker ledger or catalog files captured.',
  catalogAvailabilityClaim: 'None: the documentation pin is not a current catalog or acceptance refresh.',
  extraKanoCredit: 0,
}, null, 2)}\n`)]);
for (const [name] of captures) assert.equal(fs.existsSync(path.join(root, 'evidence', name)), false, `No overwrite: ${name}`);
for (const [name, bytes] of captures) fs.writeFileSync(path.join(root, 'evidence', name), bytes, { flag: 'wx' });
console.log('Exact source acceptance captured; working raw CRLF and immutable Git bytes independently preserved.');
