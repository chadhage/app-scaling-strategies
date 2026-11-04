'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const { hash, normalize, pins } = require('..\\pins.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const indexFile = path.join(root, 'evidence-index.json');
assert.equal(process.argv.length, 2);
assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1', 'Deliberate one-time own evidence finalization requires the exact capture flag.');
assert.equal(fs.existsSync(indexFile), false, 'Never overwrite finalized evidence.');
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Linked capture evidence is forbidden.');
    if (entry.isDirectory()) return walk(file);
    if (file === path.join(root, 'publication.json') || file === indexFile) return [];
    const bytes = fs.readFileSync(file);
    const result = { path: path.relative(repository, file), rawSha256: hash(bytes) };
    if (/\.(?:cjs|js|json|ps1|feature|md|html|css)$/.test(file)) result.crlfToLfSha256 = hash(normalize(bytes));
    return [result];
  });
}
const raw = path.join(root, 'evidence', 'raw');
const runs = fs.readdirSync(raw, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
  const file = path.join(raw, entry.name, 'run.json');
  const run = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const stream of ['stdout', 'stderr']) assert.equal(hash(gunzipSync(fs.readFileSync(path.join(repository, run[stream])))), run[`${stream}Sha256`]);
  return { stage: run.stage, path: path.relative(repository, file), exitCode: run.exitCode, startedAtUtc: run.startedAtUtc, completedAtUtc: run.completedAtUtc };
}).sort((a, b) => a.startedAtUtc.localeCompare(b.startedAtUtc));
const workflow = {};
for (const stage of ['bdd', 'stub', 'red', 'iac', 'trace', 'focused', 'syntax', 'browser']) {
  const matching = runs.filter((run) => run.stage === stage && run.exitCode === (stage === 'red' ? 1 : 0));
  assert.ok(matching.length, `An actual completed ${stage} proof is required.`);
  workflow[stage] = matching.at(-1).path;
}
const browserDirectory = path.dirname(path.join(repository, workflow.browser));
const browser = JSON.parse(fs.readFileSync(path.join(browserDirectory, 'summary.json'), 'utf8'));
assert.equal(browser.outcome, 'passed');
assert.ok(Object.values(browser.cleanup).every((value) => value === true));
const files = walk(root);
const evidencePrefix = path.join('capability', 'C034', 'evidence') + path.sep;
const seal = {
  cardId: 'C034', createdAtUtc: new Date().toISOString(),
  sourceHashes: files.filter((file) => !file.path.startsWith(evidencePrefix)),
  evidenceHashes: files.filter((file) => file.path.startsWith(evidencePrefix))
};
const sealFile = path.join(root, 'evidence', `seal-${randomUUID()}.json`);
const sealBytes = Buffer.from(`${JSON.stringify(seal, null, 2)}\n`);
fs.writeFileSync(sealFile, sealBytes, { flag: 'wx' });
const index = {
  cardId: 'C034', workerId: 'worker-C034', originalUnit: 'C034', frozenKanoClass: 'S',
  priority: 'P0', packet: 'LP-REPLAY', parents: ['H006', 'H007'],
  objective: 'Inspect an actually saved per-client trace; verify action, version and outcome ordering.',
  banner: 'Training rehearsal - synthetic data - not a live Azure result',
  acceptedReadOnlyPrerequisites: pins.accepted, maximumOriginalUnits: 1, testsRepairsProofRefinementExtraCredits: 0,
  parentAloneAccepts: true, workflow, retainedExecutionHistory: runs,
  savedTrace: {
    json: 'capability\\C034\\evidence\\raw\\trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116\\bundle.json',
    browserData: 'capability\\C034\\evidence\\raw\\trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116\\bundle.js',
    jsonRawSha256: '2e3819524ac431dd81d21497585e1b42157b56240b81b8f1929764c1c251cd56',
    browserDataRawSha256: '87e87e76a142f8a53d52b9f0da259742363f6d8b5da40895538e76c565ffcfcd',
    sourceKind: 'exact-source-pinned historical C033 saved DOM, not a new live client run',
    closedOriginalAttempts: 6, closedActions: 43, partialActions: 13,
    C015Context: 'actual public restore of known run/epoch/record; declared fixture association only',
    replacementRemainder: 'Attempt 7 is summary-only; absent actions/timing/versions cannot be reconstructed or repair unknown original 6.'
  },
  browser: {
    summary: path.relative(repository, path.join(browserDirectory, 'summary.json')),
    actualBrowserVersion: browser.browserVersion, actualOwnedBrowserPid: browser.actualSignedEdge.actualOwnedBrowserPid,
    signature: browser.actualSignedEdge.authenticodeStatus, testRuntime: browser.testRuntime,
    playwrightVersion: browser.playwrightVersion, checks: browser.checks.length,
    helperRawSha256: browser.helperRawSha256, cleanup: browser.cleanup,
    interpretation: browser.interpretation
  },
  seal: { path: path.relative(repository, sealFile), rawSha256: hash(sealBytes) },
  normalVerificationCommand: 'node capability\\C034\\tests\\verify.cjs',
  publisherBoundary: 'capability\\C034\\publisher-boundary.json',
  publisherExactRawSha256: pins.publisherRawSha256,
  iac: 'N/A', H006Complete: false, H007Complete: false, nativeOrSourceParentsComplete: false,
  fullJourneyQualified: false, actualRunCorrelation: false, identityVerified: false,
  migrationQualified: false, nativeTransportQualified: false, productionRuntimeValidated: false,
  liveAzureRuns: 0, authorizedCloudSpend: 0,
  publication: 'Implementation/tag/remote and postpublication byte checks are separate; parent review/acceptance pending.'
};
fs.writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ finalizedOnce: path.relative(repository, indexFile), seal: index.seal, capturedRunsRetained: runs.length, originalUnits: 1, extraCredits: 0 }));
