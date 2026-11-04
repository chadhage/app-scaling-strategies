'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const source = require('..\\source.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const seal = JSON.parse(fs.readFileSync(path.join(root, 'evidence-index.json'), 'utf8'));
const bytes = (relative) => source.readFile(relative, 4 * 1024 * 1024);
const record = (entry) => JSON.parse(bytes(entry.path));
const stage = (id) => record(seal.green.find((entry) => entry.stage === id));
const raw = (run, name) => gunzipSync(bytes(path.join(run.directory, `${name}.raw.gz`)), { maxOutputLength: 4 * 1024 * 1024 });

test('every sealed own source/evidence byte is unchanged; no LF normalization overwrites raw baseline', () => {
  assert.ok(seal.files.length > 40);
  for (const entry of seal.files) {
    assert.ok(entry.path.startsWith('capability\\C029\\'));
    const current = bytes(entry.path);
    assert.equal(current.length, entry.size);
    assert.equal(source.hash(current), entry.rawSha256, entry.path);
    if (entry.crlfToLfTextSha256 !== null) assert.equal(source.hash(source.normalize(current)), entry.crlfToLfTextSha256);
  }
});

test('actual BDD/loadable stub/AssertionError RED/IaC N/A/minimal implementation precede GREEN', () => {
  assert.deepEqual(seal.workflow.map((entry) => entry.stage), ['bdd', 'stub', 'red', 'iac', 'implementation']);
  const workflow = seal.workflow.map(record);
  assert.deepEqual(workflow.map((entry) => entry.exitCode), [0, 0, 1, 0, 0]);
  for (let index = 1; index < workflow.length; index++) assert.ok(workflow[index].startedAtUtc >= workflow[index - 1].completedAtUtc);
  assert.match(raw(workflow[2], 'stdout').toString('utf8'), /AssertionError[\s\S]*expected: 'FAIL'[\s\S]*actual: 'PASS'/);
  assert.doesNotMatch(raw(workflow[2], 'stderr').toString('utf8'), /MODULE_NOT_FOUND|SyntaxError/);
  assert.match(raw(workflow[3], 'stdout').toString('utf8'), /IaC N\/A/);
});

test('original RED source and loadable incorrect stub remain exactly those used in the real failing run', () => {
  const original = record(seal.workflow.find((entry) => entry.stage === 'red'));
  for (const name of ['evaluator.stub.cjs', 'evaluator.initial.snapshot.cjs']) {
    const relative = path.join('capability', 'C029', 'evidence', 'red', name);
    const pin = original.sourceHashes.find((entry) => entry.path === relative);
    assert.equal(source.hash(bytes(relative)), pin.rawSha256);
  }
  assert.equal(typeof require('..\\evidence\\red\\evaluator.stub.cjs').evaluateSnapshot, 'function');
});

test('minimal implementation snapshot has its actual original source hash, not a reconstructed RED', () => {
  const initial = record(seal.workflow.find((entry) => entry.stage === 'implementation'));
  const pin = initial.sourceHashes.find((entry) => entry.path === path.join('capability', 'C029', 'evaluator.js'));
  const snapshot = gunzipSync(bytes(path.join(initial.directory, 'evaluator.initial.raw.gz')));
  assert.equal(source.hash(snapshot), pin.rawSha256);
  assert.notEqual(source.hash(snapshot), source.hash(fs.readFileSync(path.join(root, 'evaluator.js'))));
});

test('all original raw stdout/stderr hashes and real failure exit codes stay preserved', () => {
  for (const entry of seal.allHistoricalCaptures) {
    const run = record(entry);
    assert.equal(run.exitCode, entry.exitCode);
    assert.equal(source.hash(raw(run, 'stdout')), run.stdoutSha256);
    assert.equal(source.hash(raw(run, 'stderr')), run.stderrSha256);
  }
  assert.ok(seal.retainedFailures.some((entry) => entry.stage === 'red' && entry.exitCode === 1));
  assert.ok(seal.retainedFailures.some((entry) => entry.stage === 'browser' && entry.exitCode === 1));
});

test('focused GREEN counts are actual TAP assertions, not claimed journey success', () => {
  const stdout = raw(stage('focused'), 'stdout').toString('utf8');
  assert.match(stdout, /^# fail 0$/m);
  assert.equal(Number(/^# tests (\d+)$/m.exec(stdout)[1]), seal.proofCounts.focusedNodeTests);
  assert.equal(Number(/^# pass (\d+)$/m.exec(stdout)[1]), seal.proofCounts.focusedNodeTests);
  assert.ok(seal.proofCounts.focusedNodeTests >= 86);
});

test('final actual owned signed Edge UI proof uses approved tooling and exact observed cleanup', () => {
  const browser = JSON.parse(bytes(seal.browserSummary));
  assert.equal(browser.outcome, 'passed');
  assert.equal(browser.checks.length, 14);
  assert.ok(browser.checks.every((check) => check.passed === true));
  assert.equal(browser.actualSignedEdge.authenticodeStatus, 'Valid');
  assert.equal(browser.actualSignedEdge.fileVersion, browser.browserVersion);
  assert.equal(browser.browserVersion, '156.0.4314.50');
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.match(browser.testRuntime, /^v22\./);
  assert.equal(browser.helperRawSha256, source.pins.browserHelperRawSha256);
  assert.ok(Object.values(browser.cleanup).every((value) => value === true));
  for (const flag of ['userJourneySuccess', 'actualClientMutation', 'actualExternalEffects', 'reliabilityCertified',
    'actualRunCorrelation', 'productionRuntimeValidated', 'nativeTransportQualified', 'fullJourneyQualified',
    'integratedForegroundLeaseUsed', 'helperPatched', 'nativeLauncherBypass', 'unsafeFlagsUsed']) assert.equal(browser[flag], false);
  assert.match(browser.interpretation, /NOT user journey success/);
});

test('qualified source hashes identify final implementation, not an earlier browser failure or prototype', () => {
  for (const id of ['focused', 'syntax', 'browser', 'verify']) {
    const run = stage(id);
    assert.equal(run.exitCode, 0);
    for (const name of ['evaluator.js', 'page.js', 'index.html', 'style.css', 'cli.cjs', 'source.cjs',
      'publisher-policy.cjs', 'publisher-policy.json', 'publish.ps1']) {
      const relative = path.join('capability', 'C029', name);
      const pin = run.sourceHashes.find((entry) => entry.path === relative);
      assert.ok(pin);
      assert.equal(source.hash(bytes(relative)), pin.rawSha256);
    }
  }
});

test('immutable accepted raw/Git historical sources are separate and do not pin a future live publisher', () => {
  assert.deepEqual(source.checkHistorical().imports, seal.historicalSources);
  assert.equal(seal.historicalSources.length, 22);
  assert.match(seal.privatePublisherPolicy, /Normal tests never compare future private publisher bytes/);
  assert.ok(seal.historicalSources.every((entry) => !entry.path.includes('.git')));
});

test('one frozen original D only; parent/native/production and reliability promises remain unfulfilled', () => {
  assert.equal(seal.frozenClass, 'D');
  assert.equal(seal.packet, 'H001');
  assert.deepEqual(seal.parents, ['H001', 'H006', 'H012']);
  assert.equal(seal.proofCounts.originalKanoCreditRequested, 1);
  assert.equal(seal.proofCounts.extraTestRepairRefinementCredits, 0);
  const remainder = JSON.parse(bytes(path.join('capability', 'C029', 'remainder.json')));
  assert.equal(remainder.parentsCompleted, false);
  assert.equal(remainder.parentAcceptsOneOriginalOnly, true);
  assert.equal(remainder.iac, 'N/A');
  assert.equal(remainder.liveAzureRuns, 0);
});
