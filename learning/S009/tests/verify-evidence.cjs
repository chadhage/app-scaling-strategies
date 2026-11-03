'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file).replace(/^\uFEFF/, ''));
const evidence = json('evidence.json');
const red = read(path.join('evidence', 'red.txt'));
const rawRed = zlib.gunzipSync(fs.readFileSync(path.join(root, 'evidence', 'red-original.txt.gz'))).toString('utf8');
const green = read(path.join('evidence', 'green.txt'));
const redRun = json(path.join('evidence', 'red-run.json'));
const greenRun = json(path.join('evidence', 'green-run.json'));
const browser = json(path.join('evidence', 'browser-observations.json'));
const browserRun = json(path.join('evidence', 'browser-run.json'));
const browserOutput = read(path.join('evidence', 'browser.txt'));
const stub = require(path.join(root, 'evidence', 'red-stub.js'));

assert.equal(evidence.cardId, 'A-S009');
assert.equal(evidence.kanoUnit, 'A-S009');
assert.equal(stub.createState().lastResult.verdict, 'NOT RUN');
assert.equal(redRun.exitCode, 1);
assert.equal(rawRed.replace(/[ \t]+(?=\r?$)/gm, ''), red);
assert.doesNotMatch(rawRed, /[A-Za-z]:[\\/]|file:\/\/\/|\\Users\\/i);
assert.match(red, /# tests 32\b/);
assert.match(red, /# pass 1\b/);
assert.match(red, /# fail 31\b/);
assert.equal((red.match(/code: 'ERR_ASSERTION'/g) || []).length, 31);
assert.doesNotMatch(red, /MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|command not found|not recognized as/);
assert.ok(Date.parse(redRun.featureWrittenAtUtc) < Date.parse(redRun.startedAtUtc));
assert.ok(Date.parse(redRun.endedAtUtc) < Date.parse(greenRun.startedAtUtc));
assert.equal(greenRun.exitCode, 0);
assert.match(green, /# tests 36\b/);
assert.match(green, /# pass 36\b/);
assert.match(green, /# fail 0\b/);
assert.equal(evidence.stages.iac.status, 'N/A');
assert.equal(json(path.join('evidence', 'iac.json')).managementCalls, 0);
assert.equal(browserRun.exitCode, 0);
assert.match(browserOutput, /# pass 1\b/);
assert.match(browserOutput, /# fail 0\b/);
assert.equal(browser.mode, 'isolated-headless');
assert.equal(browser.engine, 'Microsoft Edge (Chromium)');
assert.match(browser.browserVersion, /^\d+\.\d+\.\d+\.\d+$/);
assert.equal(browser.playwrightVersion, '1.56.1');
assert.equal(browser.passed, true);
assert.equal(browser.nodeMockUsed, false);
assert.equal(browser.sessionClosed, true);
assert.equal(browser.checks.length, 9);
assert.ok(browser.checks.every((check) => check.passed === true));
assert.equal(evidence.stages.browser.browserVersion, browser.browserVersion);
assert.equal(evidence.stages.browser.status, 'passed');
assert.equal(evidence.stages.browser.nodeIsBrowserProof, false);
assert.equal(evidence.evidenceBoundaries.nativeProof, false);
assert.equal(evidence.evidenceBoundaries.parentDS009Complete, false);
assert.equal(evidence.evidenceBoundaries.workerAwardsCredit, false);
for (const file of fs.readdirSync(path.join(root, 'evidence'))) {
  if (!/\.(?:json|txt)$/.test(file)) continue;
  assert.doesNotMatch(read(path.join('evidence', file)), /[A-Za-z]:[\\/]|file:\/\/\/|\\Users\\/i, file);
}
console.log(JSON.stringify({
  passed: true,
  cardId: 'A-S009',
  kanoUnit: 'A-S009',
  red: { passed: 1, failed: 31, failureKind: 'ERR_ASSERTION' },
  green: { passed: 36, failed: 0 },
  browser: { mode: browser.mode, engine: browser.engine, version: browser.browserVersion, groups: browser.checks.length, closed: browser.sessionClosed },
  relativeOrRedactedEvidencePaths: true,
  iac: 'N/A',
  nativeProof: false,
  parentAcceptancePending: true
}, null, 2));
