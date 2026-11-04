'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { inventory, root, hash } = require('./inventory.cjs');
const sources = require('../sources.cjs');
assert.equal(process.argv.length, 2);
assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1');
const directory = path.resolve(process.env.C038_CAPTURE_DIR || '');
assert.equal(path.dirname(directory), path.join(root, 'evidence', 'raw'));
assert.match(path.basename(directory), /^qualify-[0-9a-f-]{36}$/);
assert.equal(fs.realpathSync(directory), directory);
assert.deepEqual(fs.readdirSync(directory), []);
const raw = path.join(root, 'evidence', 'raw');
const runs = fs.readdirSync(raw).filter((name) => fs.existsSync(path.join(raw, name, 'run.json')))
  .map((name) => ({ name, record: JSON.parse(fs.readFileSync(path.join(raw, name, 'run.json'), 'utf8')) }));
const latest = (stage) => {
  const matches = runs.filter((entry) => entry.record.stage === stage)
    .sort((a, b) => a.record.completedAtUtc.localeCompare(b.record.completedAtUtc));
  assert.ok(matches.length, stage);
  return matches.at(-1);
};
const stdout = (entry) => gunzipSync(fs.readFileSync(path.join(raw, entry.name, 'stdout.raw.gz'))).toString('utf8');
const initial = ['bdd', 'stub', 'red', 'iac'].map(latest);
assert.deepEqual(initial.map((entry) => entry.record.exitCode), [0, 0, 1, 0]);
for (let index = 1; index < initial.length; index++) {
  assert.ok(initial[index - 1].record.completedAtUtc <= initial[index].record.startedAtUtc);
}
assert.match(stdout(initial[2]), /name: 'AssertionError'/);
assert.match(stdout(initial[2]), /true !== false/);
assert.match(stdout(initial[2]), /one successful probe must not create pool readiness/);
for (const file of ['evidence\\red\\one-probe.initial.cjs', 'evidence\\red\\readiness.initial.js', 'C038.feature']) {
  const recorded = initial[2].record.sourceHashes.find((entry) => entry.path === path.join('capability', 'C038', file));
  assert.ok(recorded);
  assert.equal(hash(fs.readFileSync(path.join(root, file))), recorded.rawSha256);
}
const verification = latest('verify');
assert.equal(verification.record.exitCode, 0);
const text = stdout(verification);
assert.match(text, /"outcome":"passed","ordinaryVerification":true/);
assert.match(text, /# tests 84/);
assert.match(text, /# tests 32/);
assert.match(text, /"count":61/);
const measured = /# all files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)/.exec(text);
assert.ok(measured);
const coverage = { lines: Number(measured[1]), branches: Number(measured[2]), functions: Number(measured[3]) };
assert.ok(coverage.lines >= 90 && coverage.branches >= 80 && coverage.functions >= 90);
const browser = latest('browser');
assert.equal(browser.record.exitCode, 0);
const summary = JSON.parse(fs.readFileSync(path.join(raw, browser.name, 'summary.json'), 'utf8'));
assert.equal(summary.outcome, 'passed');
assert.equal(summary.checks.length, 17);
assert.ok(Object.values(summary.cleanup).every((value) => value === true));
assert.equal(summary.browserVersion, '156.0.4314.50');
assert.equal(summary.playwrightVersion, '1.56.1');
assert.equal(summary.actualSignedOwnedEdge.authenticodeStatus, 'Valid');
for (const file of ['readiness.js', 'model.js', 'page.js', 'style.css', 'index.html', 'tests\\browser.cjs', 'tests\\browser-info.ps1']) {
  const captured = browser.record.sourceHashes.find((entry) => entry.path === path.join('capability', 'C038', file));
  assert.ok(captured, file);
  assert.equal(hash(fs.readFileSync(path.join(root, file))), captured.rawSha256);
}
sources.checkImports();
const sourceSnapshot = inventory({ sourcesOnly: true, gitClean: true });
for (const entry of sourceSnapshot) {
  const verified = verification.record.sourceHashes.find((item) => item.path === path.join('capability', 'C038', entry.path));
  assert.ok(verified, entry.path);
  assert.equal(verified.rawSha256, entry.rawSha256, entry.path);
  assert.equal(verified.gitCleanObjectId, entry.gitCleanObjectId, entry.path);
}
const retainedEvidence = inventory({ excludeDirectory: directory })
  .filter((entry) => entry.path.startsWith('evidence\\raw\\'));
const result = {
  schemaVersion: 1, cardId: 'C038', workerId: 'worker-C038', originalKanoUnit: 'C038',
  outcome: 'passed', extraCredits: 0, qualifiedAtUtc: new Date().toISOString(),
  stages: initial.map((entry) => ({ stage: entry.record.stage, directory: entry.name, exitCode: entry.record.exitCode })),
  fullOrdinaryVerification: verification.name, actualBrowserCapture: browser.name,
  browserChecks: 17, archivedPublisherGuardGroups: 61, authorityTests: 20, transportTests: 12,
  focusedTests: 84, coverage, sourceSnapshot, retainedEvidence,
  allFailuresPreserved: true, currentPrivatePublisherNotAHistoricalFixturePin: true,
  sourceAndGitCleanFingerprintsMeasuredIndependently: true,
  nativeFlags: require('../readiness.js').flags,
  originalParentsNativeActualPoolAuthenticationAndProduction24Complete: false
};
const bytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`);
fs.writeFileSync(path.join(directory, 'qualification.json'), bytes, { flag: 'wx' });
console.log(JSON.stringify({ cardId: 'C038', outcome: result.outcome,
  qualification: path.relative(root, path.join(directory, 'qualification.json')),
  qualificationRawSha256: hash(bytes), sourceFiles: sourceSnapshot.length,
  retainedEvidenceFiles: retainedEvidence.length, focusedTests: 84, browserChecks: 17, coverage }));
