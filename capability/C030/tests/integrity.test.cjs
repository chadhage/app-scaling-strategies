'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const test = require('node:test');
const { runNodeTest } = require('.\\nested-runner.cjs');
const root = path.resolve(__dirname, '..');
const seal = JSON.parse(fs.readFileSync(path.join(root, 'evidence-index.json'), 'utf8'));
const amendmentFile = path.join(root, 'evidence-index-v2.json');
const amendment = fs.existsSync(amendmentFile) ? JSON.parse(fs.readFileSync(amendmentFile, 'utf8')) : null;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
// The v1 seal is never rewritten: v2 names each replaced artifact with the v1 hash it supersedes and appends the new files.
function artifacts() {
  const replaced = new Map((amendment?.replacedArtifacts || []).map((entry) => [entry.path, entry]));
  return [...seal.artifactFiles.map((entry) => replaced.get(entry.path) || entry), ...(amendment?.addedArtifacts || [])];
}
const captureOf = (directory) => ({ record: JSON.parse(fs.readFileSync(path.join(root, directory, 'record.json'), 'utf8')),
  stdout: gunzipSync(fs.readFileSync(path.join(root, directory, 'stdout.raw.gz'))).toString('utf8') });
function checked(entry) {
  const file = path.resolve(root, entry.path);
  assert.ok(file.startsWith(`${root}${path.sep}`));
  assert.equal(fs.realpathSync(file), file);
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.length, entry.bytes);
  assert.equal(hash(bytes), entry.sha256, entry.path);
}
function captures() {
  const raw = path.join(root, 'evidence', 'raw');
  return fs.readdirSync(raw, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory() && fs.existsSync(path.join(raw, entry.name, 'record.json'))).map((entry) => {
    const directory = path.join(raw, entry.name);
    return { directory, record: JSON.parse(fs.readFileSync(path.join(directory, 'record.json'), 'utf8')) };
  });
}
test('all sealed original raw evidence files remain exact and immutable', () => {
  assert.equal(seal.rawFailuresPreserved, true);
  assert.ok(seal.files.length > 60);
  seal.files.forEach(checked);
});
test('all sealed code, documentation and fixed import artifacts remain byte exact', () => {
  assert.ok(seal.artifactFiles.length > 20);
  assert.ok(amendment, 'The amendment seal evidence-index-v2.json is required.');
  artifacts().forEach(checked);
});
test('every command keeps complete raw stdout/stderr and the actual exit code', () => {
  for (const { directory, record } of captures()) {
    const stdout = gunzipSync(fs.readFileSync(path.join(directory, 'stdout.raw.gz')));
    const stderr = gunzipSync(fs.readFileSync(path.join(directory, 'stderr.raw.gz')));
    assert.equal(hash(stdout), record.stdoutRawSha256);
    assert.equal(hash(stderr), record.stderrRawSha256);
    assert.equal(record.passed, record.exitCode === 0);
    assert.equal(record.rawWhitespacePreserved, true);
    for (const input of record.inputSnapshots || []) {
      assert.equal(hash(gunzipSync(fs.readFileSync(path.join(directory, input.snapshot)))), input.rawWorkingSha256);
    }
  }
});
test('BDD, loadable stub, genuine assertion RED and IaC N/A chronology is preserved', () => {
  const records = captures().map((entry) => entry.record);
  const get = (stage) => records.find((record) => record.stage === stage);
  for (const stage of ['bdd', 'stub', 'red', 'iac']) assert.ok(get(stage));
  assert.ok(get('bdd').endedAtUtc <= get('stub').startedAtUtc);
  assert.ok(get('stub').endedAtUtc <= get('red').startedAtUtc);
  assert.ok(get('red').endedAtUtc <= get('iac').startedAtUtc);
  assert.equal(get('red').exitCode, 1);
});
test('retained initial stub still reproduces behavior assertion failure, never an import failure', () => {
  const output = runNodeTest(path.join(root, 'evidence', 'red', 'delivery-is-not-effect.test.cjs'));
  assert.equal(output.status, 1);
  assert.match(output.stdout, /ERR_ASSERTION/);
  assert.match(output.stdout, /'PASS' !== 'HOLD'/);
  assert.doesNotMatch(output.stdout + output.stderr, /MODULE_NOT_FOUND/);
});
test('failed actual browser observation remains failed with actual successful exact cleanup', () => {
  const failed = captures().filter((entry) => entry.record.stage === 'browser' && entry.record.exitCode !== 0);
  assert.ok(failed.length >= 1);
  const first = JSON.parse(fs.readFileSync(path.join(failed[0].directory, 'browser', 'summary.json'), 'utf8'));
  assert.equal(first.outcome, 'failed');
  assert.equal(first.checks.length, 19);
  assert.match(first.error.message, /navigation to finish/);
  assert.ok(Object.values(first.cleanup).every((value) => value === true));
});
test('final actual browser observes exact approved tooling and complete DOM/CSP/cleanup checks', () => {
  const browser = JSON.parse(fs.readFileSync(path.join(root, seal.finalBrowserCapture, 'browser', 'summary.json'), 'utf8'));
  assert.equal(browser.outcome, 'passed');
  assert.equal(browser.checks.length, seal.proofCounts.actualBrowserChecks);
  assert.equal(browser.checks.length, 21);
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.match(browser.browserVersion, /^156\./);
  assert.match(browser.testRuntime, /^v22\./);
  assert.equal(browser.actualSignedEdge.authenticodeStatus, 'Valid');
  assert.equal(browser.helperRawSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.ok(Object.values(browser.cleanup).every((value) => value === true));
  assert.equal(browser.unsafeFlagsUsed, false);
  assert.equal(browser.foregroundLeaseUsed, false);
});
test('actual DOM result copies distinguish modeled/hypothetical, fictional negative and historical unassociated observations', () => {
  const directory = path.join(root, seal.finalBrowserCapture, 'browser');
  const read = (file) => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
  const model = read('model-reconciled.dom-result.json').after;
  assert.equal(model.currentCounts.confirmedApplications, 2);
  assert.equal(model.currentCounts.hypotheticalApplications, 1);
  assert.equal(model.counts.unknown, 2);
  const negative = read('negative.dom-result.json');
  assert.match(negative.sourceBinding, /fictional/);
  assert.equal(negative.currentCounts.extraApplications, 1);
  const historical = read('history.dom-result.json');
  assert.equal(historical.counts.originals, 7);
  assert.equal(historical.counts.unknown, 7);
  assert.equal(historical.expectedPlan, null);
});
test('proof counts represent one original only, never native/parent/test credits', () => {
  assert.ok(seal.proofCounts.focusedTests >= 155);
  assert.equal(seal.proofCounts.sourceFiles, 27);
  assert.equal(seal.proofCounts.closedSources, 21);
  assert.equal(seal.proofCounts.originalKanoUnits, 1);
  assert.equal(seal.proofCounts.extraRepairOrTestCredits, 0);
  assert.equal(seal.proofCounts.nativeAzureProofs, 0);
  assert.equal(seal.proofCounts.completedSourceParents, 0);
  assert.ok(seal.proofCounts.retainedFailedVerificationRuns >= 1);
});
test('source pin manifest keeps historical sources separate from current private publication authorization', () => {
  const pins = require('..\\imports.json');
  assert.equal(pins.privatePublisherIsNotPinnedByThisManifest, true);
  assert.equal(pins.mathematicalControlsAreNotSourceReceipts, true);
  assert.equal(pins.sourcePinsDoNotAuthorizeNativeClaims, true);
  assert.equal(require('..\\publisher-history.json').historicalOnly, true);
});
test('the original seal stays byte exact and the amendment replaces only named documentation and test tooling', () => {
  assert.ok(amendment, 'The amendment seal evidence-index-v2.json is required.');
  assert.equal(amendment.schema, 'C030-evidence-index/2');
  const original = fs.readFileSync(path.join(root, 'evidence-index.json'));
  assert.equal(amendment.supersedes.bytes, original.length);
  assert.equal(amendment.supersedes.sha256, hash(original));
  const sealed = new Map(seal.artifactFiles.map((entry) => [entry.path, entry]));
  assert.deepEqual(amendment.replacedArtifacts.map((entry) => entry.path),
    ['README.md', 'tests\\integrity.test.cjs', 'tests\\record.cjs', 'tests\\verify.cjs']);
  for (const entry of amendment.replacedArtifacts) assert.equal(entry.supersedesSha256, sealed.get(entry.path).sha256, entry.path);
  for (const entry of amendment.addedArtifacts) assert.equal(sealed.has(entry.path), false, entry.path);
  assert.equal(amendment.proofCounts.originalKanoUnits, 1);
  assert.equal(amendment.proofCounts.extraRepairOrTestCredits, 0);
});
test('every raw file and red copy the amendment adds stays byte exact', () => {
  assert.ok(amendment, 'The amendment seal evidence-index-v2.json is required.');
  assert.ok(amendment.addedEvidence.length > 100);
  for (const name of ['nested-runner.test.cjs', 'nested-runner.stub.cjs']) {
    assert.ok(amendment.addedEvidence.some((entry) => entry.path === `evidence\\red\\${name}`), name);
  }
  amendment.addedEvidence.forEach(checked);
});
test('retained nested-runner stub still fails the corrected contract for the behavioral reason, never an import failure', () => {
  const output = runNodeTest(path.join(root, 'evidence', 'red', 'nested-runner.test.cjs'), { timeout: 60000 });
  assert.equal(output.status, 1);
  assert.match(output.stdout, /# fail 3/);
  assert.match(output.stdout, /ERR_ASSERTION/);
  assert.match(output.stdout, /0 !== 1/);
  assert.doesNotMatch(output.stdout + output.stderr, /MODULE_NOT_FOUND/);
});
test('nested-runner and per-file coverage RED and GREEN are archived with their actual exit codes', () => {
  assert.ok(amendment, 'The amendment seal evidence-index-v2.json is required.');
  const red = captureOf(amendment.captures.nestedRed);
  assert.equal(red.record.stage, 'nested-red');
  assert.equal(red.record.exitCode, 1);
  assert.match(red.stdout, /# pass 0/);
  assert.match(red.stdout, /# fail 3/);
  assert.match(red.stdout, /true !== false/);
  assert.match(red.stdout, /0 !== 1/);
  assert.doesNotMatch(red.stdout, /MODULE_NOT_FOUND/);
  assert.equal(amendment.proofCounts.nestedRunnerRedFailures, 3);
  const green = captureOf(amendment.captures.nestedGreen);
  assert.equal(green.record.stage, 'nested-green');
  assert.equal(green.record.exitCode, 0);
  assert.match(green.stdout, /# pass 4/);
  assert.match(green.stdout, /# fail 0/);
  assert.ok(red.record.endedAtUtc <= green.record.startedAtUtc);
  const gap = captureOf(amendment.captures.coverageRed);
  assert.equal(gap.record.exitCode, 1);
  const baseline = JSON.parse(gap.stdout.trim().split(/\r?\n/).at(-1));
  assert.deepEqual(baseline.coverage.filter((entry) => !entry.passed).map((entry) => entry.file), ['cli.cjs', 'page.js', 'source.cjs']);
  assert.equal(baseline.coverage.find((entry) => entry.file === 'page.js').loaded, false);
  assert.ok(gap.record.endedAtUtc <= captureOf(amendment.captures.coverage).record.startedAtUtc);
});
test('every production script reaches 85 percent lines, branches and functions in its own measured run', () => {
  assert.ok(amendment, 'The amendment seal evidence-index-v2.json is required.');
  const { record, stdout } = captureOf(amendment.captures.coverage);
  assert.equal(record.stage, 'coverage');
  assert.equal(record.exitCode, 0);
  const summary = JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
  const production = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile() && /\.(?:js|cjs)$/.test(entry.name))
    .map((entry) => entry.name).sort();
  assert.deepEqual(summary.productionFiles, production);
  assert.deepEqual(amendment.proofCounts.coverage.map((entry) => entry.file), production);
  assert.equal(summary.threshold, 85);
  assert.equal(summary.passed, true);
  for (const entry of summary.coverage) {
    assert.equal(entry.loaded, true, entry.file);
    assert.equal(entry.nodeExit, 0, entry.file);
    assert.equal(entry.failedTests, 0, entry.file);
    for (const metric of ['lines', 'branches', 'functions']) assert.ok(entry[metric] >= 85, `${entry.file} ${metric}`);
  }
});
test('every nested node --test in the namespace tooling is started with the sanitized child environment (L-0002)', () => {
  const tooling = fs.readdirSync(__dirname).filter((name) => name.endsWith('.cjs'));
  const spawning = tooling.filter((name) => /['"]--test['"]/.test(fs.readFileSync(path.join(__dirname, name), 'utf8')));
  assert.ok(spawning.includes('nested-runner.cjs'));
  for (const name of spawning) assert.match(fs.readFileSync(path.join(__dirname, name), 'utf8'), /childEnvironment|runNodeTest/, name);
});
test('the amendment browser capture is a passed real signed Edge observation with exact cleanup', () => {
  assert.ok(amendment, 'The amendment seal evidence-index-v2.json is required.');
  const browser = JSON.parse(fs.readFileSync(path.join(root, amendment.captures.browser, 'browser', 'summary.json'), 'utf8'));
  assert.equal(browser.outcome, 'passed');
  assert.equal(browser.checks.length, amendment.proofCounts.actualBrowserChecks);
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.match(browser.browserVersion, /^156\./);
  assert.match(browser.testRuntime, /^v22\./);
  assert.equal(browser.actualSignedEdge.authenticodeStatus, 'Valid');
  assert.equal(browser.helperRawSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.ok(Object.values(browser.cleanup).every((value) => value === true));
  assert.equal(browser.unsafeFlagsUsed, false);
  assert.equal(browser.foregroundLeaseUsed, false);
});
