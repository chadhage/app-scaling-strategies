'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, repo, sha, randomUUID } = require('./provenance.cjs');

if (process.argv.length !== 3 || process.argv[2] !== 'capture-parent-approved-successor') {
  throw new Error('Explicit capture-parent-approved-successor only; no hash, path or approval override.');
}
const original = '48846487727dd2ef35f03d88d65e64121059b6867188bbf34daeaee3fda1c09d';
const current = 'f6df80bdafc028538813330fe810bd81a69a50822a4a862e0bf42f59b2b0b2a4';
const script = "$m=[Threading.Mutex]::new($false,'Local\\AppScalingStrategies_KanbanState_v1');$held=$false;" +
  "try{$held=$m.WaitOne(30000);if(-not $held){throw 'Mutex unavailable'};" +
  "$s=Get-Content .docs\\wiki\\flow-state.json -Raw|ConvertFrom-Json;$a=$s.localPublisherAuthorization;" +
  "[ordered]@{publisherSha256=$a.publisherSha256;durabilityConsumerRevision=$a.durabilityConsumerRevision;" +
  "savedTraceRevision=$a.savedTraceRevision}|ConvertTo-Json -Depth 12 -Compress}" +
  "finally{if($held){$m.ReleaseMutex()};$m.Dispose()}";
const processResult = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
  { cwd: repo, timeout: 45000, windowsHide: true });
assert.ifError(processResult.error);
assert.equal(processResult.status, 0, processResult.stderr.toString('utf8'));
const authority = JSON.parse(processResult.stdout);
assert.equal(authority.publisherSha256, current);
assert.equal(authority.durabilityConsumerRevision.publisherSha256, original);
assert.equal(authority.durabilityConsumerRevision.exactAddedClasses.C016, 'D');
const successor = authority.savedTraceRevision;
assert.equal(successor.approvedBy, 'parent-controller');
assert.equal(successor.publisherSha256, current);
assert.equal(successor.previousPublisherSha256, original);
assert.deepEqual(successor.exactAddedClasses, { C034: 'S' });
assert.equal(successor.namespaceFrozenClassAdminHeadAndWhitespaceRulesUnchanged, true);
assert.equal(successor.cloudIdentityOrInfrastructureAuthorityExpanded, false);
assert.equal(successor.extraCredits, 0);
const publisher = fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'publish.ps1'));
assert.equal(sha(publisher), current);
const token = "; C034='S'";
const text = publisher.toString('utf8');
assert.equal(text.split(token).length, 2);
assert.equal(sha(Buffer.from(text.replace(token, ''), 'utf8')), original,
  'Every byte other than the parent-authorized C034=S addition must equal the task-original exact approved publisher.');
const priorBoundary = fs.readFileSync(path.join(root, 'publisher-boundary.json'));
assert.equal(JSON.parse(priorBoundary).parentApprovedSha256, original);
const id = `publisher-${randomUUID()}`;
function save(suffix, bytes) {
  const file = `${id}.${suffix}`;
  fs.writeFileSync(path.join(root, 'evidence', file), bytes, { flag: 'wx' });
  return { file, bytes: bytes.length, sha256: sha(bytes) };
}
const report = {
  schemaVersion: 1, cardId: 'C016', kind: 'parent-approved-publisher-successor',
  capturedAtUtc: new Date().toISOString(), exitCode: 0, authority,
  taskOriginalApprovedSha256: original, parentApprovedSuccessorSha256: current,
  independentlyVerifiedOnlyDifference: token,
  parentGuardFixtureChecks: { count: successor.focusedGuardChecksPassed, source: 'parent-reported, not independently executed by C016' },
  stdout: save('stdout.raw', processResult.stdout), stderr: save('stderr.raw', processResult.stderr),
  sourceSnapshots: [save('approved-publisher.snapshot', publisher), save('original-boundary.snapshot', priorBoundary)],
  sharedSourceWrites: 0, captureByNormalVerifier: false, originalUnitCredits: 0,
};
const raw = Buffer.from(`${JSON.stringify(report, null, 2).replace(/\n/g, '\r\n')}\r\n`);
console.log(JSON.stringify({ ...save('raw.json', raw), approvedBy: successor.approvedBy,
  current, original, exactOneTokenSuccessorVerified: true, sharedSourceWrites: 0 }));
