'use strict';

// Hermetic checks of the archived coverage and signed-Edge evidence added after the original acceptance.
// Nothing here reads the installed browser, the publisher, the Git index or any other namespace.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { root, sha } = require('./provenance.cjs');
const index = require('..\\evidence-index.json');
const current = index.currentVerification;

function owned(relative) {
  assert.equal(typeof relative, 'string');
  assert.ok(relative.startsWith('evidence\\'));
  assert.equal(relative.split('\\').some((piece) => piece === '..' || piece === ''), false);
  const target = path.resolve(root, relative);
  assert.ok(target.startsWith(root + path.sep));
  assert.equal(fs.lstatSync(target).isFile(), true);
  return target;
}
const json = (relative) => JSON.parse(fs.readFileSync(owned(relative)));
function raw(directory, entry) {
  const bytes = gunzipSync(fs.readFileSync(path.join(directory, entry.file)));
  assert.equal(bytes.length, entry.originalBytes);
  assert.equal(sha(bytes), entry.originalSha256);
  return bytes;
}
const directoryOf = (relative) => path.dirname(owned(relative));
const production = fs.readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.c?js$/.test(entry.name)).map((entry) => entry.name).sort();
const row = (report, file) => {
  const number = '(\\d+(?:\\.\\d+)?)';
  const match = new RegExp(`^#\\s+${file.replace('.', '\\.')}\\s*\\|\\s*${number}\\s*\\|\\s*${number}\\s*\\|\\s*${number}\\s*\\|`, 'm').exec(report);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

test('coverage RED is genuine: Node exits 0 and prints no row for the unloaded app.js, which counts as 0 percent', () => {
  const capture = json(current.coverage.red);
  assert.equal(capture.mode, 'coverage');
  assert.equal(capture.deliberateCapture, true);
  assert.equal(capture.passed, false);
  assert.equal(capture.exitCode, 1);
  const files = Object.fromEntries(capture.coverageRecord.files.map((item) => [item.file, item]));
  assert.deepEqual(files['app.js'], { file: 'app.js', loaded: false, exitCode: 0, lines: 0, branches: 0, functions: 0, passed: false });
  for (const file of ['errors.js', 'inspect.cjs', 'recovery.js']) assert.equal(files[file].loaded, true);
  const stdout = raw(directoryOf(current.coverage.red), capture.stdout).toString('utf8');
  assert.equal(row(stdout.split('=== C019 coverage of errors.js')[0], 'app.js'), null, 'Node printed no app.js row.');
  assert.match(stdout, /=== C019 coverage of app\.js \(exit 0\) ===/);
});

test('coverage GREEN reaches 85/85/85 per file for every enumerated production file, confirmed from the raw output', () => {
  const capture = json(current.coverage.green);
  assert.equal(capture.mode, 'coverage');
  assert.equal(capture.passed, true);
  assert.equal(capture.exitCode, 0);
  assert.deepEqual(capture.coverageRecord.thresholds, current.coverage.thresholds);
  assert.deepEqual(capture.coverageRecord.enumerated, production, 'Every production file in the namespace is enumerated.');
  assert.deepEqual(current.coverage.enumeratedProductionFiles, production);
  const directory = directoryOf(current.coverage.green);
  const stdout = raw(directory, capture.stdout).toString('utf8');
  const sections = stdout.split('=== C019 coverage of ').slice(1);
  assert.equal(sections.length, production.length);
  for (const file of production) {
    const summary = capture.coverageRecord.files.find((item) => item.file === file);
    assert.equal(summary.loaded, true);
    assert.equal(summary.exitCode, 0);
    assert.equal(summary.passed, true);
    const measured = row(sections.find((section) => section.startsWith(`${file} `)), file);
    assert.ok(measured, `${file} must have its own row in the raw Node report.`);
    assert.deepEqual([summary.lines, summary.branches, summary.functions], measured);
    for (const [name, value] of Object.entries({ lines: measured[0], branches: measured[1], functions: measured[2] })) {
      assert.ok(value >= current.coverage.thresholds[name], `${file} ${name} ${value}`);
    }
    const archived = capture.snapshots.find((item) => item.path === file);
    assert.deepEqual(raw(directory, archived.working), fs.readFileSync(path.join(root, file)),
      `${file} proof is of the shipped production bytes.`);
  }
});

test('the Node page tests archived with the coverage proof are the tests that load app.js', () => {
  const capture = json(current.coverage.green);
  const directory = directoryOf(current.coverage.green);
  const archived = capture.snapshots.find((item) => item.path === 'tests\\app.test.cjs');
  assert.deepEqual(raw(directory, archived.working), fs.readFileSync(path.join(root, 'tests', 'app.test.cjs')));
  assert.match(fs.readFileSync(path.join(root, 'tests', 'app.test.cjs'), 'utf8'), /require\(appPath\)/);
  const stdout = raw(directory, capture.stdout).toString('utf8');
  assert.match(stdout, /# Subtest: all 13 genuine captured failures render their exact typed code/);
  assert.equal(capture.coverageRecord.files.find((item) => item.file === 'app.js').branches, 100);
});

test('browser RED shows the sealed exact-version pin failing on an unchanged-signature, same-major Edge update', () => {
  const capture = json(current.browser.red);
  assert.equal(capture.mode, 'browser');
  assert.equal(capture.passed, false);
  assert.equal(capture.exitCode, 1);
  assert.equal(capture.verifierRecord.exitCode, 1);
  assert.equal(capture.browserRecord.passed, false);
  assert.deepEqual(capture.browserRecord.checks, [], 'It failed at the qualification, before any page was observed.');
  const stdout = raw(directoryOf(current.browser.red), capture.stdout).toString('utf8');
  assert.match(stdout, /ERR_ASSERTION/);
  assert.match(stdout, /expected: '156\.0\.4314\.50'/);
  assert.match(stdout, /actual: '156\.0\.4314\.\d+'/);
  assert.notEqual(stdout.match(/actual: '(156\.0\.4314\.\d+)'/)[1], '156.0.4314.50');
});

test('browser GREEN observed real signed Edge in the qualified major and recorded actual values, not an equality pin', () => {
  const capture = json(current.browser.green);
  assert.equal(capture.mode, 'browser');
  assert.equal(capture.passed, true);
  assert.equal(capture.exitCode, 0);
  const record = JSON.parse(fs.readFileSync(path.join(directoryOf(current.browser.green), 'browser.raw.json')));
  assert.deepEqual(record, capture.browserRecord);
  assert.equal(record.kind, 'signed-Edge-DOM-qualified-major');
  assert.equal(record.passed, true);
  assert.equal(record.closed, true);
  assert.equal(record.pageClosed, true);
  assert.equal(record.browserDisconnected, true);
  assert.equal(record.helperCleanupAwaited, true);
  assert.equal(record.checks.length, 14);
  assert.ok(record.checks.every((check) => check.passed === true));
  assert.equal(record.pageErrorCount, 0);
  assert.equal(record.nonFileRequestCount, 0);
  assert.equal(record.signature.status, 'Valid');
  assert.match(record.signature.signer, /^CN=Microsoft Corporation,/);
  assert.equal(record.qualification.qualifiedMajor, current.browser.qualifiedMajor);
  assert.equal(record.qualification.observedMajor, current.browser.qualifiedMajor);
  assert.equal(Number(record.signature.fileVersion.split('.')[0]), current.browser.qualifiedMajor);
  assert.equal(record.browserVersion, record.signature.fileVersion);
  assert.match(record.qualification.binarySha256, /^[a-f0-9]{64}$/);
  assert.equal(record.qualification.comparedWithRecordedVersionConstant, false);
  assert.equal(record.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(record.playwrightVersion, '1.56.1');
  assert.equal(record.browserFilesystemInspection, false);
  assert.equal(record.browserRecovery, false);
  assert.equal(record.writeAuthorization, false);
  assert.deepEqual(record.checks.map((check) => check.name),
    json(current.browser.sealedHistorical).checks.map((check) => check.name),
    'The same 14 sealed observation groups ran.');
});

test('the sealed Edge 156.0.4314.50 observation stays immutable historical proof and is no longer run by the verifier', () => {
  const sealed = json(current.browser.sealedHistorical);
  assert.equal(sealed.signature.fileVersion, '156.0.4314.50');
  assert.equal(sealed.passed, true);
  const verifier = fs.readFileSync(path.join(root, 'tests', 'verify.cjs'), 'utf8');
  assert.match(verifier, /mode === 'browser' \? \['browser-current\.test\.cjs'\]/);
  assert.match(fs.readFileSync(path.join(root, 'tests', 'browser.test.cjs'), 'utf8'), /assert\.equal\(signature\.fileVersion, '156\.0\.4314\.50'\)/);
});

test('RED captures are listed as failed attempts and every new capture is hash-checked by the append-only integrity test', () => {
  for (const relative of [current.coverage.red, current.browser.red]) assert.ok(index.failedAttempts.includes(relative));
  for (const relative of [current.coverage.red, current.coverage.green, current.browser.red, current.browser.green]) {
    const capture = json(relative);
    const directory = directoryOf(relative);
    assert.equal(capture.cardId, 'C019');
    raw(directory, capture.stdout);
    raw(directory, capture.stderr);
    for (const item of capture.files) assert.equal(sha(fs.readFileSync(path.join(directory, item.name))), item.sha256);
    for (const snapshot of capture.snapshots) raw(directory, snapshot.working);
  }
  assert.equal(current.originalUnitCredits, 0);
});
