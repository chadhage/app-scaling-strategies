'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'evidence');
const read = (file) => fs.readFileSync(path.join(evidence, file));
const json = (file) => JSON.parse(read(file));
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

test('preserved RED snapshots and raw outputs retain their original bytes and real assertion failure', () => {
  const red = json(path.join('red', 'run.json'));
  const focused = json(path.join('red', 'focused-run.json'));
  assert.equal(red.exitCode, 1);
  assert.equal(red.assertionFailures, 16);
  assert.equal(red.failed, 18);
  assert.equal(red.passed, 2);
  assert.equal(focused.exitCode, 1);
  assert.equal(focused.assertionFailures, 1);
  assert.equal(focused.incidentalRuntimeFailures, 0);
  for (const [metadata, stdout, stderr] of [
    [red, 'stdout.tap.txt', 'stderr.txt'],
    [focused, 'focused.stdout.tap.txt', 'focused.stderr.txt'],
  ]) {
    assert.equal(hash(read(path.join('red', stdout))), metadata.stdoutSha256);
    assert.equal(hash(read(path.join('red', stderr))), metadata.stderrSha256);
    assert.doesNotMatch(read(path.join('red', stdout)).toString(), /MODULE_NOT_FOUND|SyntaxError/);
  }
  assert.match(read(path.join('red', 'focused.stdout.tap.txt')).toString(), /ERR_ASSERTION/);
  assert.doesNotMatch(read(path.join('red', 'focused.stdout.tap.txt')).toString(), /TypeError/);
  for (const snapshot of red.snapshots) {
    assert.match(snapshot.snapshot, /\.snapshot$/);
    assert.equal(hash(read(path.join('red', snapshot.snapshot))), snapshot.sha256);
  }
});

test('the RED stub is loadable but genuinely lacks the now-passing committed-effect behavior', () => {
  const module = { exports: {} };
  vm.runInNewContext(read(path.join('red', 'model.source.snapshot')).toString(), { module });
  const stub = module.exports;
  assert.equal(typeof stub.createLesson, 'function');
  assert.equal(stub.createLesson().commitAndLoseResponse({ ...stub.DEFAULT_CONFIG }).phase, 'configure');
  const implemented = require(path.join(root, 'model.js'));
  assert.equal(implemented.createLesson().commitAndLoseResponse({ ...implemented.DEFAULT_CONFIG }).phase, 'ambiguous');
});

test('IaC N/A was explicitly recorded after the focused assertion RED and before implementation', () => {
  const iac = json('iac-decision.json');
  const red = json(path.join('red', 'focused-run.json'));
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.beforeImplementation, true);
  assert.ok(Date.parse(iac.decidedAtUtc) >= Date.parse(red.completedAtUtc));
  assert.match(iac.reason, /Resource-free/);
  assert.equal(iac.afterRed, 'evidence/red/focused-run.json');
});

test('actual browser evidence binds current lesson and tests, exact helper and captured assets', () => {
  const browser = json('browser-001.json');
  assert.equal(browser.captureOptIn, 'CAPTURE_BROWSER_EVIDENCE=1');
  assert.equal(browser.closed, true);
  assert.equal(browser.playwright, '1.56.1');
  assert.match(browser.browserVersion, /^156\./);
  assert.equal(browser.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(browser.helperPublication, '53c0c0d');
  assert.equal(browser.abandonedPrototypeUsed, false);
  assert.equal(browser.unattendedLifecycleCertified, false);
  assert.equal(browser.checks.length, 10);
  assert.ok(browser.checks.every((check) => check.passed));
  assert.deepEqual(browser.pageErrors, []);
  assert.deepEqual(browser.externalRoutes, []);
  assert.equal(browser.observations.safe.outcome, 'SUCCESS');
  assert.equal(browser.observations.duplicate.outcome, 'FAILURE');
  assert.equal(browser.observations.unknown.outcome, 'UNKNOWN');
  assert.deepEqual(browser.observations.finalReset, browser.observations.initial);
  assert.equal(browser.observations.csp.inlineExecuted, false);
  assert.equal(browser.observations.csp.connection, 'blocked');
  for (const binding of browser.sourceBindings) {
    assert.equal(hash(fs.readFileSync(path.join(root, binding.path))), binding.sha256, binding.path);
  }
  for (const asset of browser.assets) assert.equal(hash(read(asset.path)), asset.sha256, asset.path);
});

test('owned integrity inventory binds runtime, tests, documentation and raw proof without write access', () => {
  const inventory = json('integrity.json');
  assert.equal(inventory.cardId, 'A-S049');
  assert.equal(inventory.algorithm, 'SHA-256');
  const names = inventory.files.map((file) => file.path);
  assert.equal(new Set(names).size, names.length);
  for (const required of ['model.js', 'lesson.js', 'index.html', 'styles.css', 'manifest.json', 'README.md',
    'ambiguous-post.feature', path.join('tests', 'model.test.cjs'), path.join('tests', 'surface.test.cjs'),
    path.join('tests', 'browser.test.cjs'), path.join('tests', 'integrity.test.cjs'),
    path.join('evidence', 'source-contract.json'), path.join('evidence', 'red', 'focused-run.json'),
    path.join('evidence', 'iac-decision.json'), path.join('evidence', 'browser-001.json')]) {
    assert.ok(names.includes(required), required);
  }
  for (const file of inventory.files) {
    const resolved = path.resolve(root, file.path);
    assert.ok(resolved.startsWith(`${root}${path.sep}`), file.path);
    assert.equal(hash(fs.readFileSync(resolved)), file.sha256, file.path);
  }
});
