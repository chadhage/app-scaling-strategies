'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const read = (file) => fs.readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fileHash = (file) => hash(fs.readFileSync(file));
const stage = (name) => json(path.join(evidence, `${name}.json`));
const manifest = json(path.join(root, 'manifest.json'));
function rawBytes(relativePath) {
  const original = path.join(repo, relativePath);
  if (fs.existsSync(original)) return fs.readFileSync(original);
  const map = json(path.join(evidence, 'raw-archive-map.json'));
  const entry = map.files.find((file) => file.original === relativePath);
  assert.ok(entry, `No lossless archive registered for ${relativePath}`);
  const archived = fs.readFileSync(path.join(repo, entry.archive));
  assert.equal(hash(archived), entry.archiveSha256);
  const bytes = gunzipSync(archived);
  assert.equal(hash(bytes), entry.originalSha256);
  assert.equal(bytes.length, entry.originalBytes);
  return bytes;
}
const rawText = (relativePath) => rawBytes(relativePath).toString('utf8');

test('one frozen C023 S unit preserves its exact acceptance, parents and accepted source authority', () => {
  assert.equal(manifest.cardId, 'C023');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'C023');
  assert.deepEqual(manifest.parents, ['H005', 'P005']);
  assert.equal(manifest.acceptance, 'Deliver a checkpointed job/effect ledger fixture; verify resume and effect counts are inspectable.');
  assert.equal(manifest.entryGate.implementationCommit, '2dc471daab3ffa202d83aba2df443e280cad3656');
  for (const [file, expected] of Object.entries(manifest.entryGate.unchangedSources)) assert.equal(fileHash(path.join(repo, file)), expected, file);
});

test('source imports are real C020 dependencies, not copied business fixtures', () => {
  const model = read(path.join(root, 'ledger.js'));
  const page = read(path.join(root, 'page.js'));
  assert.match(model, /require\('\.\.\/C020\/contract\.js'\)/);
  assert.match(read(path.join(root, 'index.html')), /src="\.\.\/C020\/contract\.js"/);
  const source = require('../../C020/contract.js');
  for (const profile of source.profiles) {
    for (const businessValue of [profile.displayName, profile.email]) {
      assert.equal(model.includes(businessValue), false);
      assert.equal(page.includes(businessValue), false);
    }
  }
});

test('loadable stub and genuine original RED survive byte-for-byte outside test discovery', () => {
  const red = stage('tdd-red');
  const stub = path.join(root, 'evidence', 'red', 'ledger.stub.cjs');
  const snapshot = path.join(root, 'evidence', 'red', 'ledger.behavior.snapshot.cjs');
  assert.equal(fileHash(stub), red.sourceHashes[path.join('capability', 'C023', 'ledger.js')]);
  assert.equal(fileHash(snapshot), red.sourceHashes[path.join('capability', 'C023', 'evidence', 'red', 'ledger.behavior.snapshot.cjs')]);
  assert.notEqual(fileHash(path.join(root, 'ledger.js')), fileHash(stub));
  assert.equal(stage('stub-load').exitCode, 0);
  assert.equal(red.exitCode, 1);
  const stdout = rawText(red.rawStdout);
  assert.equal((stdout.match(/name: 'AssertionError'/g) || []).length, 4);
  assert.match(stdout, /# tests 4\r?\n/);
  assert.match(stdout, /# pass 0\r?\n/);
  assert.match(stdout, /# fail 4\r?\n/);
  assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|SyntaxError/);
  assert.equal(/(?:^|[.-])test(?:[.-]|$)/.test(path.basename(snapshot)), false);
});

test('IaC N/A was recorded after genuine RED while the implementation was still the stub', () => {
  const red = stage('tdd-red');
  const na = stage('iac-na');
  assert.ok(Date.parse(na.startedAtUtc) >= Date.parse(red.finishedAtUtc));
  assert.equal(na.exitCode, 0);
  assert.equal(na.sourceHashes[path.join('capability', 'C023', 'ledger.js')], red.sourceHashes[path.join('capability', 'C023', 'ledger.js')]);
  assert.match(rawText(na.rawStdout), /No Storage, Queue, DB, external effect/);
});

test('all captured execution outputs retain exact raw hashes and real expected exit codes', () => {
  const records = fs.readdirSync(evidence)
    .filter((name) => name.endsWith('.json'))
    .map((name) => json(path.join(evidence, name)))
    .filter((record) => record.stage && record.rawStdout);
  assert.ok(records.length >= 8);
  for (const record of records) {
    assert.equal(record.cardId, 'C023');
    assert.equal(record.exitCode, record.expectedExitCode, record.stage);
    assert.equal(record.matchedExpectedExit, true, record.stage);
    assert.equal(record.processError, null, record.stage);
    assert.equal(hash(rawBytes(record.rawStdout)), record.stdoutSha256, record.stage);
    assert.equal(hash(rawBytes(record.rawStderr)), record.stderrSha256, record.stage);
    assert.ok(Date.parse(record.finishedAtUtc) >= Date.parse(record.startedAtUtc));
    for (const [file, expected] of Object.entries(record.dependencySourceHashes || {})) {
      assert.equal(expected, manifest.entryGate.unchangedSources[file], record.stage);
    }
  }
  const archive = json(path.join(evidence, 'raw-archive-map.json'));
  assert.equal(archive.files.length, 2);
  assert.equal(archive.originalRecordsModified, false);
  for (const entry of archive.files) assert.equal(hash(rawBytes(entry.original)), entry.originalSha256);
  assert.match(read(path.join(root, '.gitattributes')), /^\* -text$/m);
});

test('retained actual browser regression RED has its original sources and an AssertionError, not load failure', () => {
  const red = stage('refinement-red');
  assert.equal(red.exitCode, 1);
  for (const [file, source] of Object.entries(red.sourceSnapshots)) assert.equal(hash(source), red.sourceHashes[file]);
  const stdout = rawText(red.rawStdout);
  const stderr = rawText(red.rawStderr);
  assert.match(stdout, /PASS valid older zero-commit snapshot/);
  assert.match(stderr, /AssertionError/);
  assert.match(stderr, /NOT INSPECTED — candidate changed/);
  assert.match(stderr, /VALID LOCAL SNAPSHOT — ready/);
  assert.doesNotMatch(stderr, /MODULE_NOT_FOUND|SyntaxError/);
  assert.doesNotMatch(red.sourceSnapshots[path.join('capability', 'C023', 'page.js')], /addEventListener\('input'/);
});

test('focused GREEN corresponds to current model, page, BDD and tests', () => {
  const green = stage('green-qualified-helper');
  assert.equal(green.exitCode, 0);
  assert.equal(green.testSummary.tests, 103);
  assert.equal(green.testSummary.pass, 103);
  assert.equal(green.testSummary.fail, 0);
  for (const [file, expected] of Object.entries(green.sourceHashes)) assert.equal(fileHash(path.join(repo, file)), expected, file);
  assert.equal(stage('syntax-qualified-helper').exitCode, 0);
  assert.match(rawText(stage('syntax-qualified-helper').rawStdout), /Syntax valid: 12 owned scripts/);
});

test('actual deliberate browser proof has complete cleanup, real DOM checks and explicit nonqualification', () => {
  const browser = json(path.join(evidence, 'browser-acceptance-published-helper.json'));
  assert.equal(browser.outcome, 'passed');
  assert.equal(browser.captureRequested, true);
  assert.equal(browser.mode, 'actual-file-DOM-isolated-headless');
  assert.equal(browser.checksPassed, 23);
  assert.equal(browser.checks.length, 23);
  assert.ok(browser.checks.every((check) => check.passed === true));
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.match(browser.browserVersion, /^156\./);
  assert.equal(browser.cleanup.browserClosed, true);
  assert.equal(browser.cleanup.listenersCreated, 0);
  assert.equal(browser.integratedForegroundLeaseUsed, false);
  assert.equal(browser.unsafeFlagsUsed, false);
  assert.equal(browser.chromiumSandbox, true);
  assert.equal(browser.qualifications.nativeProof, false);
  assert.equal(browser.qualifications.productionNode24Validated, false);
  assert.equal(browser.qualifications.durableStorageImplemented, false);
  assert.equal(browser.helper.sha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(browser.helper.publishedPairingQualified, true);
  assert.equal(browser.helper.abandonedLifecyclePrototypeUsed, false);
  assert.equal(stage('browser-published-helper').browserEvidenceCaptureRequested, true);
  assert.equal(stage('browser-published-helper').exitCode, 0);
  for (const [file, expected] of Object.entries(browser.sourceHashes)) assert.equal(fileHash(path.join(repo, file)), expected, file);
  assert.deepEqual(browser.dependencySourceHashes, manifest.entryGate.unchangedSources);
  assert.equal(browser.screenshots.length, 2);
  for (const screenshot of browser.screenshots) {
    assert.equal(fileHash(path.join(repo, screenshot.path)), screenshot.sha256);
    assert.deepEqual(fs.readFileSync(path.join(repo, screenshot.path)).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
});

test('original RED reproduces unchanged and an ordinary browser rerun preserves all previous proof', () => {
  const reproduced = stage('red-reproduction');
  assert.equal(reproduced.exitCode, 1);
  assert.equal(reproduced.testSummary.tests, 4);
  assert.equal(reproduced.testSummary.fail, 4);
  assert.equal(reproduced.testSummary.pass, 0);
  const preservation = stage('proof-preservation-qualified-helper');
  assert.equal(preservation.exitCode, 0);
  assert.equal(preservation.browserEvidenceCaptureRequested, false);
  const stdout = rawText(preservation.rawStdout);
  assert.match(stdout, /historicalProofWritten=false/);
  assert.match(stdout, /"byteIdentical": true/);
  assert.match(stdout, /"captureBrowserEvidence": false/);
});

test('published evidence index separates local verification, user impact and remaining native To Do scope', () => {
  const index = json(path.join(root, 'evidence.json'));
  assert.equal(index.cardId, 'C023');
  assert.equal(index.kanoUnit, 'C023');
  assert.deepEqual(index.parents, ['H005', 'P005']);
  assert.equal(index.verifierResult, 'local fixture checks passed');
  assert.equal(index.nativeQualified, false);
  assert.equal(index.productionRuntimeValidated, false);
  assert.equal(index.cleanupResult, 'isolated browser closed; no listener or resources provisioned');
  assert.equal(index.parentAcceptance, 'pending independent controller review; no self-Accept');
  assert.ok(index.refinedToDo.every((item) => item.originalLineagePreserved && item.additionalCredit === 0));
});
