'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const seal = JSON.parse(fs.readFileSync(path.join(root, 'evidence-index.json'), 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
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
  seal.artifactFiles.forEach(checked);
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
  const output = spawnSync(process.execPath, ['--test', path.join(root, 'evidence', 'red', 'delivery-is-not-effect.test.cjs')], {
    timeout: 15000, windowsHide: true, encoding: 'utf8'
  });
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
