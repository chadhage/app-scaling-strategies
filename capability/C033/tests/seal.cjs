'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
if (process.argv.length !== 3 || process.argv[2] !== 'finalize') {
  throw new Error('Only deliberate one-time C033 seal.cjs finalize is supported; normal checks never refresh evidence.');
}
const manifestPath = path.join(root, 'evidence.json');
assert.equal(fs.existsSync(manifestPath), false, 'Refuse to rewrite an existing evidence manifest.');
function files(directory, skipEvidence = false) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (skipEvidence && ['evidence', 'evidence.json', 'publication.json'].includes(entry.name)) return [];
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? files(target, skipEvidence) : [target];
  });
}
const rawRoot = path.join(root, 'evidence', 'raw');
const runs = fs.readdirSync(rawRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
  const file = path.join(rawRoot, entry.name, 'run.json');
  return { file, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
}).sort((a, b) => a.startedAtUtc.localeCompare(b.startedAtUtc));
const first = (stage) => runs.find((run) => run.stage === stage);
const latestPass = (stage) => runs.filter((run) => run.stage === stage && run.exitCode === 0).at(-1);
const workflowRuns = {
  bdd: first('bdd'), stub: first('stub'), red: first('red'), iac: first('iac'),
  green: latestPass('green'), syntax: latestPass('syntax'), browser: latestPass('browser')
};
for (const [stage, run] of Object.entries(workflowRuns)) {
  assert.ok(run, `Missing ${stage} capture.`);
  assert.equal(run.exitCode, stage === 'red' ? 1 : 0, stage);
}
for (const [before, after] of [['bdd', 'stub'], ['stub', 'red'], ['red', 'iac'], ['iac', 'green'], ['green', 'browser']]) {
  assert.ok(workflowRuns[before].completedAtUtc < workflowRuns[after].startedAtUtc, `Actual ${before} -> ${after} chronology.`);
}
const redOutput = gunzipSync(fs.readFileSync(path.resolve(repository, workflowRuns.red.stdout))).toString('utf8');
assert.equal((redOutput.match(/name: 'AssertionError'/g) || []).length, 4);
assert.doesNotMatch(redOutput, /Cannot find module|SyntaxError/);
const browser = JSON.parse(fs.readFileSync(path.join(path.dirname(workflowRuns.browser.file), 'summary.json'), 'utf8'));
assert.equal(browser.outcome, 'passed');
assert.equal(workflowRuns.browser.captureBrowserEvidence, '1');
assert.ok(Object.values(browser.cleanup).every((value) => value === true));
const sourceFiles = [...files(root, true), ...files(path.join(root, 'evidence', 'red'))].sort();
const sourceHashes = sourceFiles.map((file) => {
  const raw = fs.readFileSync(file);
  return {
    path: path.relative(repository, file), rawSha256: hash(raw),
    crlfToLfSha256: hash(Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'), 'utf8'))
  };
});
const recheck = runs.filter((run) => run.stage === 'red').at(-1);
assert.notEqual(recheck.file, workflowRuns.red.file, 'Retain the original RED and a distinct explicit RED provenance recheck.');
for (const file of files(path.join(root, 'evidence', 'red'))) {
  const relative = path.relative(repository, file);
  assert.equal(recheck.sourceHashes.find((item) => item.path === relative)?.rawSha256, hash(fs.readFileSync(file)));
}
const workflow = Object.fromEntries(Object.entries(workflowRuns).map(([stage, run]) => [stage, path.relative(repository, run.file)]));
const sealFile = path.join(root, 'evidence', `seal-${randomUUID()}.json`);
const seal = {
  cardId: 'C033', createdAtUtc: new Date().toISOString(),
  policy: 'Immutable captured raw bytes; separate working raw and CRLF-to-LF/Git bytes. No automatic refresh or normalization.',
  sourceHashes, evidenceHashes: files(rawRoot).sort().map((file) => ({
    path: path.relative(repository, file), rawSha256: hash(fs.readFileSync(file))
  }))
};
fs.writeFileSync(sealFile, `${JSON.stringify(seal, null, 2)}\n`, { flag: 'wx' });
const manifest = {
  cardId: 'C033', workerId: 'worker-C033', originalUnit: 'C033', kano: 'S', priority: 'P0', packet: 'H006',
  originalObjective: 'Pause/resume a browser journey around a chosen boundary; verify state and timing remain measurable.',
  entryGate: require(path.join(root, 'imports.json')).acceptedC020,
  banner: 'Training rehearsal - synthetic data - not a live Azure result',
  acceptanceOwner: 'parent/controller only', maximumOriginalUnits: 1, repairsTestsProofRefinementExtraCredits: 0,
  workflow, redProvenanceRecheck: path.relative(repository, recheck.file),
  retainedExecutionHistory: runs.map((run) => ({ stage: run.stage, exitCode: run.exitCode, path: path.relative(repository, run.file) })),
  seal: { path: path.relative(repository, sealFile), rawSha256: hash(fs.readFileSync(sealFile)) },
  browser: {
    summary: path.relative(repository, path.join(path.dirname(workflowRuns.browser.file), 'summary.json')),
    browserVersion: browser.browserVersion, testRuntime: browser.testRuntime,
    playwrightVersion: browser.playwrightVersion, actualOwnedBrowserPid: browser.actualSignedEdge.actualOwnedBrowserPid,
    actualCallerNodePid: browser.server.actualCallerPid, actualOrigin: browser.server.origin,
    checks: browser.checks.length, actualProviderRequests: browser.actualProviderRequests.length,
    cleanup: browser.cleanup, helperRawSha256: browser.helperRawSha256,
    interpretation: browser.mode
  },
  integrityCommand: 'node --test capability\\C033\\tests\\integrity.test.cjs',
  normalReadOnlyCommand: 'node capability\\C033\\tests\\read-only.cjs',
  iac: 'N/A - local read-only synthetic fixture, no infrastructure',
  fullH006JourneyQualified: false, H006Complete: false, nativeOrSourceParentsComplete: false,
  nativeTransportQualified: false, productionRuntimeValidated: false,
  identityVerified: false, durableStoreImplemented: false, liveAzureRuns: 0, authorizedCloudSpend: 0,
  remainder: path.join('capability', 'C033', 'remainder.json')
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
console.log(`C033 deliberate immutable finalization: ${path.relative(repository, sealFile)}; ${sourceHashes.length} source files; ${seal.evidenceHashes.length} raw evidence files.`);
