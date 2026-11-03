'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
function owned(relative) {
  assert.equal(typeof relative, 'string');
  assert.equal(path.win32.isAbsolute(relative) || path.posix.isAbsolute(relative), false, relative);
  const resolved = path.resolve(root, relative);
  assert.ok(resolved.startsWith(`${root}${path.sep}`), relative);
  assert.ok(fs.statSync(resolved).isFile(), relative);
  return resolved;
}
const read = (relative) => fs.readFileSync(owned(relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));
const lesson = json('lesson.json');
const evidence = json('evidence.json');
const browser = json(evidence.verification.browser.record);
const red = json(evidence.verification.red.record);
const iac = json(evidence.verification.iac.record);

for (const value of [lesson, evidence, browser]) {
  assert.equal(value.cardId, 'A-S007');
  assert.equal(value.workerId, 'worker-A-S007');
}
assert.equal(evidence.mode, 'synthetic');
assert.equal(evidence.nativeProof, false);
assert.equal(evidence.sourceParentComplete, false);
assert.equal(evidence.kanoUnit, 'A-S007');
assert.equal(evidence.acceptance.status, 'pending-parent-review');
assert.equal(evidence.acceptance.creditsAwarded, 0);
for (const relative of [
  lesson.entry, lesson.bdd, lesson.evidence, lesson.iac.evidence,
  red.output, red.stubSnapshot, evidence.verification.green.output,
  evidence.verification.syntax.output, 'evidence/implementation-runs.json'
]) owned(relative);

for (const [relative, expected] of Object.entries(evidence.sourceSha256)) {
  const observed = crypto.createHash('sha256').update(fs.readFileSync(owned(relative))).digest('hex').toUpperCase();
  assert.equal(observed, expected, relative);
}
assert.equal(red.exitCode, 1);
assert.equal(red.failed, 41);
assert.match(read(red.output), /tests 45/);
assert.match(read(red.output), /fail 41/);
const rawRed = zlib.gunzipSync(fs.readFileSync(owned(red.outputNormalization.rawOutput)));
assert.equal(crypto.createHash('sha256').update(rawRed).digest('hex').toUpperCase(), red.outputNormalization.rawSha256);
assert.equal(rawRed.toString('utf8').replace(/[ \t]+(?=\r?$)/gm, ''), read(red.output));
assert.equal(crypto.createHash('sha256').update(read(red.output)).digest('hex').toUpperCase(), red.outputNormalization.normalizedSha256);
assert.equal(evidence.verification.green.exitCode, 0);
assert.equal(evidence.verification.green.passed, 68);
assert.match(read(evidence.verification.green.output), /tests 68/);
assert.match(read(evidence.verification.green.output), /fail 0/);
assert.doesNotMatch(read(evidence.verification.syntax.output), /exit=[1-9]/);
assert.equal(iac.status, 'N/A');
assert.equal(iac.resourcesCreated, 0);

assert.equal(browser.evidenceKind, 'real-integrated-browser');
assert.equal(browser.nativeProof, false);
assert.equal(browser.mode, 'synthetic');
assert.match(browser.fileUrl, /^file:\/\/\/C:\/.*\/learning\/S007\/index\.html$/);
assert.match(browser.pageId, /^[0-9a-f-]{36}$/);
assert.equal(browser.forceNew, true);
assert.equal(browser.passed, true);
for (const name of ['keyboard-and-baseline', 'safe-drain-and-retention', 'unsafe-counterexample', 'invalid-data-and-reset', 'session-boundary-rollback']) {
  const run = browser.runs.find((item) => item.id === name);
  assert.ok(run, name);
  assert.equal(run.passed, true, name);
  assert.ok(run.observedAtUtc, name);
  assert.ok(run.assertions.length > 0, name);
}
assert.equal(browser.cleanup.resetObserved, true);
assert.equal(browser.cleanup.finalRequestCount, 0);
assert.equal(browser.cleanup.finalEventCount, 0);
console.log('PASS: S007 evidence identities, relative owned paths, source digests, real-run outputs, browser records and explicit limits are internally consistent.');
console.log('This artifact validator does not itself execute a browser or establish native Azure proof.');
