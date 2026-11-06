'use strict';

// Writes evidence-index-addendum-1.json exactly once (flag wx: a seal is never rewritten). It pins the accepted dependency list,
// copied from the sealed F6 authorization snapshot after proving that the bytes on disk are the pinned bytes, and it records the
// tooling bytes this repair replaced or added. Previous bytes stay in the named RED capture and in Git history.
// Usage: CAPTURE_BROWSER_EVIDENCE=1 node capability\C019\tests\seal-provenance-addendum.cjs <provenance-red capture directory name>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { root, repo, sha, lfSha } = require('./provenance.cjs');
const manifest = require('..\\manifest.json');

if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1' || process.argv.length !== 3 || !/^provenance-red-[0-9a-f-]{36}$/.test(process.argv[2])) {
  throw new Error('Exact guarded addendum capture with the archived provenance RED directory only.');
}
const red = path.join(root, 'evidence', process.argv[2]);
const redRecord = JSON.parse(fs.readFileSync(path.join(red, 'capture.raw.json'), 'utf8'));
assert.equal(redRecord.mode, 'provenance-red');
assert.equal(redRecord.genuineAssertionRed, true);
const lfLength = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')).length;
const describe = (relative, bytes) => ({ path: relative, lfSha256: lfSha(bytes), lfByteLength: lfLength(bytes) });
function before(relative) {
  const snapshot = redRecord.snapshots.find((entry) => entry.path === relative);
  assert.ok(snapshot, `The RED capture archived the previous ${relative}.`);
  const bytes = gunzipSync(fs.readFileSync(path.join(red, snapshot.working.file)));
  assert.equal(sha(bytes), snapshot.working.originalSha256);
  return bytes;
}
const supersedes = ['tests\\provenance.cjs', 'tests\\verify.cjs'].map((relative) => {
  const previous = before(relative);
  return { ...describe(relative, fs.readFileSync(path.join(root, relative))), previousLfSha256: lfSha(previous), previousLfByteLength: lfLength(previous) };
});
const adds = ['C019-provenance-scope.feature', 'tests\\provenance.test.cjs', 'tests\\provenance-hook.cjs',
  'tests\\capture-provenance.cjs', 'tests\\seal-provenance-addendum.cjs']
  .map((relative) => describe(relative, fs.readFileSync(path.join(root, relative))));

const sourceBytes = fs.readFileSync(path.join(root, manifest.historicalF6AuthorizationSnapshot));
const files = JSON.parse(sourceBytes.toString('utf8')).preservation.dependencies;
assert.equal(Object.keys(files).length, 161);
for (const [file, digest] of Object.entries(files)) {
  assert.equal(sha(fs.readFileSync(path.join(repo, file))), digest, `The accepted bytes are on disk: ${file}`);
}
const sealedIndex = fs.readFileSync(path.join(root, 'evidence-index.json'));
const value = {
  schema: 'C019-evidence-index-addendum/1', cardId: 'C019', workerId: 'worker-U021', sequence: 1,
  capturedAtUtc: new Date().toISOString(), exactCapture: 'CAPTURE_BROWSER_EVIDENCE=1',
  policy: 'The sealed index and every raw capture, RED and failure stay immutable. This addendum pins the accepted dependency list and records only later tooling bytes; previous bytes remain in the named RED capture and in Git history.',
  reason: 'U021: the provenance check hashed every file under capability\\C001, C002 and C015, so a file added there while a C019 verifier ran failed it although all 161 accepted bytes were unchanged. It now hashes exactly the pinned list.',
  previousIndex: { path: 'evidence-index.json', rawSha256: lfSha(sealedIndex), lfByteLength: lfLength(sealedIndex) },
  dependencyScope: {
    source: manifest.historicalF6AuthorizationSnapshot, sourceRawSha256: sha(sourceBytes), count: Object.keys(files).length, files,
  },
  previousBytesCapture: `evidence\\${process.argv[2]}\\capture.raw.json`,
  supersedes, adds, extraCredits: 0,
};
fs.writeFileSync(path.join(root, 'evidence-index-addendum-1.json'), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ sequence: 1, pinned: value.dependencyScope.count, superseded: supersedes.map((entry) => entry.path), added: adds.map((entry) => entry.path) }));
