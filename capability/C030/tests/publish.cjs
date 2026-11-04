'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { gzipSync, gunzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
assert.equal(process.argv.length, 2);
assert.equal(process.cwd(), repository);
assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1');
const seal = JSON.parse(fs.readFileSync(path.join(root, 'evidence-index.json'), 'utf8'));
for (const entry of [...seal.files, ...seal.artifactFiles]) {
  const file = path.resolve(root, entry.path);
  assert.ok(file.startsWith(`${root}${path.sep}`));
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.length, entry.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.path);
}
const rawRoot = path.join(root, 'evidence', 'raw');
const verified = fs.readdirSync(rawRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() &&
  fs.existsSync(path.join(rawRoot, entry.name, 'record.json'))).map((entry) => {
  const directory = path.join(rawRoot, entry.name);
  return { directory, record: JSON.parse(fs.readFileSync(path.join(directory, 'record.json'), 'utf8')) };
}).filter((entry) => entry.record.stage === 'verify' && entry.record.exitCode === 0)
  .sort((a, b) => a.record.endedAtUtc.localeCompare(b.record.endedAtUtc)).at(-1);
assert.ok(verified, 'Complete read-only focused/integrity/syntax/actual-browser verification is required before publication.');
const verifiedStdout = gunzipSync(fs.readFileSync(path.join(verified.directory, 'stdout.raw.gz')));
assert.equal(createHash('sha256').update(verifiedStdout).digest('hex'), verified.record.stdoutRawSha256);
const fullTestCount = Number(/# tests (\d+)/.exec(verifiedStdout.toString('utf8'))?.[1]);
assert.equal(fullTestCount, seal.proofCounts.focusedTests + 10);
assert.match(verifiedStdout.toString('utf8'), /# fail 0/);
assert.match(verifiedStdout.toString('utf8'), /"verified":true/);
const id = randomUUID();
const directory = path.join(root, 'evidence', 'raw', `publication-${id}`);
fs.mkdirSync(directory);
const write = (name, bytes) => fs.writeFileSync(path.join(directory, name), bytes, { flag: 'wx' });
const startedAtUtc = new Date().toISOString();
write('intent.json', JSON.stringify({
  cardId: 'C030', workerId: 'worker-C030', startedAtUtc, oneOriginalOnly: true, extraCredits: 0,
  meaning: 'Prepublication intent only, not a result or qualification. Actual stdout/stderr/result are separate append-only postpublication bytes.'
}, null, 2) + '\n');
const output = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(root, 'publish.ps1')], {
  cwd: repository, windowsHide: true, timeout: 300000, maxBuffer: 32 * 1024 * 1024
});
const stdout = output.stdout || Buffer.alloc(0);
const stderr = output.stderr || Buffer.alloc(0);
write('stdout.raw.gz', gzipSync(stdout));
write('stderr.raw.gz', gzipSync(stderr));
write('capture.json', JSON.stringify({
  schema: 'C030-publication-raw/1', startedAtUtc, endedAtUtc: new Date().toISOString(), exitCode: output.status,
  signal: output.signal, error: output.error?.message || null,
  stdoutRawSha256: createHash('sha256').update(stdout).digest('hex'),
  stderrRawSha256: createHash('sha256').update(stderr).digest('hex'),
  rawWhitespacePreserved: true, postPublicationBytesAreNotRetroactivelyGitCanonical: true
}, null, 2) + '\n');
const lines = stdout.toString('utf8').split(/\r?\n/).filter((line) => line.startsWith('C030_PUBLICATION_RESULT '));
let result;
if (output.status === 0 && lines.length === 1) {
  result = JSON.parse(lines[0].slice('C030_PUBLICATION_RESULT '.length));
  assert.match(result.commit, /^[0-9a-f]{40}$/);
  assert.equal(result.tag, `kanban/C030/${result.commit.slice(0, 12)}`);
  assert.equal(result.transportProof.providerPresenceAndValuesRestored, true);
  assert.equal(result.transportProof.freshSafeGitReadAfterRestore, true);
  result.proofCounts = { ...seal.proofCounts, integrityTests: 10, completeReadOnlySuiteTests: fullTestCount,
    publishedCanonicalFiles: result.rawCanonicalQualification.publishedCanonicalFiles };
  result.completeReadOnlyVerificationCapture = path.relative(repository, verified.directory);
  result.evidence = path.relative(repository, directory);
  result.postPublicationProof = 'Unique raw stdout/stderr/capture/result appended after commit; not asserted to be in that implementation commit.';
  result.blocker = 'Published original C030; independent parent empirical acceptance required.';
} else {
  result = {
    cardId: 'C030', workerId: 'worker-C030', outcome: 'blocked', originalUnits: 1, extraCredits: 0,
    blocker: `Publication qualification stopped (actual exit ${output.status}); no Done or remote success inferred. Exact raw evidence: ${path.relative(repository, directory)}. ${stderr.toString('utf8').slice(-6000)}`,
    verifiedLocalScope: 'Usable bounded local effect detector, CLI, static UI, fixed accepted C023/C029 source, focused/syntax/actual signed Edge proof.',
    proofCounts: { ...seal.proofCounts, integrityTests: 10, completeReadOnlySuiteTests: fullTestCount }, evidence: path.relative(repository, directory),
    parentsH006H012Complete: false, nativeProof: false, productionNode24Validated: false
  };
}
const report = path.join(root, `publication-result-${id}.json`);
fs.writeFileSync(report, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
try {
  const state = execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(repository, '.git', 'kanban-orchestrator', 'state.ps1'), '-Action', 'Report',
    '-CardId', 'C030', '-WorkerId', 'worker-C030', '-ResultPath', report],
  { cwd: repository, timeout: 45000, windowsHide: true, maxBuffer: 32768 });
  write('state-report.stdout.raw', state);
} catch (error) {
  write('state-report.failure.raw', Buffer.concat([error.stdout || Buffer.alloc(0), error.stderr || Buffer.alloc(0)]));
  throw error;
}
console.log(JSON.stringify({
  cardId: 'C030', outcome: result.outcome, commit: result.commit || null, tag: result.tag || null,
  proofCounts: result.proofCounts, resultPath: path.relative(repository, report),
  stateReportedAfterPublisherExited: true, parentAcceptanceRequired: true
}));
if (result.outcome !== 'published') {
  process.stderr.write(stderr);
  process.exitCode = 3;
}
