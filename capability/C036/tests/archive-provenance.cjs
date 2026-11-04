'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { gzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const commit = '4b2339f77704c79449270598b0896704ce7533c8';
const usedSha = '60ae100b96622c8ca828d7db2f8000780476e7c7411a9f3d26f0959fd182aeea';
const previousSha = 'e6d9e8bf9c9ff592bf463bd85656ecfec46c4eb33b0ab7f14bb7f317fcc65e22';
const allowedChanges = ['pins.cjs', 'README.md', 'tests\\current.test.cjs', 'tests\\integrity.test.cjs',
  'tests\\publisher.cjs', 'tests\\publisher-boundary.ps1', 'tests\\publish.cjs',
  'tests\\publish-owned.ps1', 'tests\\record.cjs', 'tests\\verify.cjs'];
if (process.argv.length !== 2 || process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('One-time own provenance archive requires exact CAPTURE_BROWSER_EVIDENCE=1.');
const index = JSON.parse(fs.readFileSync(path.join(root, 'evidence-index.json'), 'utf8'));
const publisher = fs.readFileSync(path.join(repository, '.git', 'kanban-orchestrator', 'publish.ps1'));
assert.equal(hash(publisher), usedSha, 'Only bytes matching the actually recorded 4b-used 60AE may be archived; no future repin.');
const lockedPath = 'capability\\C036\\evidence\\raw\\publication-318c70a6-802b-4ca4-b9ea-633507064bf0\\publisher-boundary-locked.json';
const gitOptions = { cwd: repository, timeout: 15000, maxBuffer: 8388608, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] };
const locked = execFileSync('git', ['--no-pager', 'show', `${commit}:${lockedPath.replaceAll('\\', '/')}`], gitOptions);
const used = JSON.parse(locked.toString('utf8'));
assert.equal(used.actualPublisherSha256, usedSha);
assert.equal(used.currentCanonicalAuthorization.publisherSha256, usedSha);
assert.equal(used.currentCanonicalAuthorization.budgetAndGoalRevision.publisherSha256, usedSha);
assert.equal(used.currentCanonicalAuthorization.budgetAndGoalRevision.previousPublisherSha256, previousSha);
const stripped = Buffer.from(publisher.toString('utf8').replace("; C029='D'", '').replace("; X003='L'", ''), 'utf8');
assert.equal(hash(stripped), previousSha);
const observed = execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
  "$m=[Threading.Mutex]::new($false,'Local\\AppScalingStrategies_KanbanState_v1');$held=$false;try{$held=$m.WaitOne([TimeSpan]::FromSeconds(30));if(-not $held){throw 'State timeout'};$l=[IO.File]::ReadAllText((Join-Path (Get-Location) '.docs\\wiki\\flow-state.json'))|ConvertFrom-Json -AsHashtable;$c=@($l.cards|Where-Object{$_.id -eq 'C036'})[0];[ordered]@{controllerId=$l.controllerId;card=($c|Select-Object id,kano,kanoUnit,priority,packet,technicalEntryGate,authorization,localScope);parentGreenPath=$c.futurePublisherProvenanceRecovery.parentCurrentGreenReport;parentGreenSha256=$c.futurePublisherProvenanceRecovery.parentCurrentGreenReportSha256}|ConvertTo-Json -Depth 6 -Compress}finally{if($held){$m.ReleaseMutex()};$m.Dispose()}"],
{ ...gitOptions, maxBuffer: 32768 });
const original = JSON.parse(observed.toString('utf8'));
assert.equal(original.controllerId, '942b9aec-aa3f-4179-b6ed-e2bc57abeed2');
assert.equal(original.card.id, 'C036');
assert.equal(original.card.kano, 'D');
const parentPath = path.join('.git', 'kanban-orchestrator', 'reviews', 'C036-parent-verified-4b2339.tap');
const parentGreen = fs.readFileSync(path.join(repository, parentPath));
assert.equal(hash(parentGreen), original.parentGreenSha256);
const directory = path.join(root, 'evidence', 'raw', `provenance-archive-${randomUUID()}`);
fs.mkdirSync(directory);
const save = (name, bytes) => {
  fs.writeFileSync(path.join(directory, name), bytes, { flag: 'wx' });
  return { path: path.relative(root, path.join(directory, name)), rawSha256: hash(bytes) };
};
const snapshots = {};
for (const [i, relative] of allowedChanges.entries()) {
  const full = `capability\\C036\\${relative}`;
  const entry = index.sourceAndProofFiles.find((file) => file.path === full);
  assert.ok(entry, full);
  const bytes = fs.readFileSync(path.join(root, relative));
  assert.equal(hash(bytes), entry.rawSha256, 'Archive before changing an indexed original helper.');
  const blob = execFileSync('git', ['--no-pager', 'show', `${commit}:${full.replaceAll('\\', '/')}`], gitOptions);
  assert.equal(hash(blob), entry.crlfToLfSha256 || entry.rawSha256);
  snapshots[relative] = { ...save(`original-${i}.snapshot`, bytes), acceptedGitSha256: hash(blob) };
}
const manifest = {
  schemaVersion: 1, cardId: 'C036', kano: 'D', role: 'immutable-actually-used-publication',
  usedForCommit: commit, tag: 'kanban/C036/4b2339f77704', usedPublisherSha256: usedSha,
  previousPublisherSha256: previousSha, originalCard: original.card, approvedRecoveryPaths: allowedChanges,
  publisherSource: save('actual-4b-used-60ae.publisher.snapshot', publisher),
  exactTwoTokenPredecessor: save('exact-two-token-e6.publisher.snapshot', stripped),
  actualUsedApproval: save('actual-4b-used-approval.snapshot', locked),
  initialE6Boundary: save('initial-e6-boundary.snapshot', fs.readFileSync(path.join(root, 'publisher-boundary.json'))),
  originalEvidenceIndex: save('original-evidence-index.snapshot', fs.readFileSync(path.join(root, 'evidence-index.json'))),
  originalPublication: save('original-publication.snapshot', fs.readFileSync(path.join(root, 'publication.json'))),
  originalPublishedReport: save('original-published-report.snapshot', fs.readFileSync(path.join(root, 'published-report.json'))),
  parentGreen: { ...save('parent-current-green.tap.raw.gz', gzipSync(parentGreen)), decompressedRawSha256: hash(parentGreen),
    source: parentPath, interpretation: 'Parent actually executed GREEN, not a new worker execution.' },
  snapshots, archivedAtUtc: new Date().toISOString(), extraCredits: 0,
  policy: 'Immutable 4b-used 60AE/old E6 and raw original helpers. No mutable future publisher or nested historical revision authorizes current delegation.'
};
fs.writeFileSync(path.join(root, 'publisher-history.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
const stdout = Buffer.from(`${JSON.stringify({ role: manifest.role, commit, usedSha, archivedHelpers: allowedChanges.length, parentGreenRawSha256: hash(parentGreen) })}\n`);
save('stdout.raw.gz', gzipSync(stdout));
save('stderr.raw.gz', gzipSync(Buffer.alloc(0)));
save('run.json', Buffer.from(`${JSON.stringify({
  cardId: 'C036', workerId: 'worker-C036', stage: 'provenance-archive', exitCode: 0,
  startedAtUtc: manifest.archivedAtUtc, completedAtUtc: new Date().toISOString(),
  stdoutSha256: hash(stdout), stderrSha256: hash(Buffer.alloc(0)),
  capture: 'exact CAPTURE_BROWSER_EVIDENCE=1; append own verified original archive only'
}, null, 2)}\n`));
process.stdout.write(stdout);
