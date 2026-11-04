'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { gunzipSync } = require('node:zlib');
const { snapshot, root, repository } = require('./inventory.cjs');
const { checkImports, checkPublisher } = require('..\\pins.cjs');
if (process.argv.length !== 2 || process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Deliberate one-time integrity finalization requires exact CAPTURE_BROWSER_EVIDENCE=1.');
const records = fs.readdirSync(path.join(root, 'evidence', 'raw')).map((name) => {
  const directory = path.join(root, 'evidence', 'raw', name);
  const runFile = path.join(directory, 'run.json');
  if (!fs.existsSync(runFile)) return null;
  const run = JSON.parse(fs.readFileSync(runFile, 'utf8'));
  const stdout = gunzipSync(fs.readFileSync(path.join(directory, 'stdout.raw.gz'))).toString('utf8');
  const stderr = gunzipSync(fs.readFileSync(path.join(directory, 'stderr.raw.gz'))).toString('utf8');
  return { ...run, stdoutText: stdout, stderrText: stderr };
}).filter(Boolean).sort((a, b) => a.startedAtUtc.localeCompare(b.startedAtUtc));
const successful = (stage) => records.filter((record) => record.stage === stage && record.exitCode === 0).at(-1);
for (const stage of ['bdd', 'stub', 'iac', 'pins', 'context', 'focused', 'syntax', 'publisher', 'browser', 'verify']) {
  assert.ok(successful(stage), `Actual successful ${stage} raw capture required.`);
}
const red = records.find((record) => record.stage === 'red');
assert.equal(red.exitCode, 1);
assert.match(red.stdoutText, /name: 'AssertionError'/);
assert.match(red.stdoutText, /actual: 'attached'/);
assert.match(red.stdoutText, /expected: 'rejected'/);
assert.ok(successful('bdd').completedAtUtc <= successful('stub').startedAtUtc);
assert.ok(successful('stub').completedAtUtc <= red.startedAtUtc);
assert.ok(red.completedAtUtc <= successful('iac').startedAtUtc);
assert.ok(successful('iac').completedAtUtc <= successful('context').startedAtUtc);
const focused = successful('focused');
const earlierLeaves = Number(/# tests (\d+)/.exec(focused.stdoutText)?.[1]);
assert.ok(earlierLeaves >= 102);
assert.match(focused.stdoutText, /# fail 0/);
const browserDirectory = path.resolve(repository, successful('browser').directory);
const browser = JSON.parse(fs.readFileSync(path.join(browserDirectory, 'summary.json'), 'utf8'));
assert.equal(browser.outcome, 'passed');
assert.equal(browser.checks.length, 17);
assert.ok(Object.values(browser.cleanup).every((value) => value === true));
const publisher = JSON.parse(successful('publisher').stdoutText);
assert.equal(publisher.count, 51);
assert.equal(publisher.actualGitWrites, 0);
const verificationLine = successful('verify').stdoutText.trim().split(/\r?\n/).at(-1);
const verification = JSON.parse(verificationLine);
assert.equal(verification.outcome, 'read-only-green');
assert.equal(verification.normalSourceOrEvidenceWrites, 0);
const leaves = verification.outcomes[0].focusedLeaves;
assert.ok(leaves >= 103, 'The current final focused run, not an earlier source snapshot, supplies the released count.');
const index = {
  cardId: 'C036', workerId: 'worker-C036', originalKanoUnit: 'C036', kano: 'D', packet: 'H001',
  finalizedAtUtc: new Date().toISOString(), originalUnitCreditsRequested: 1, extraCredits: 0,
  sequence: { bdd: successful('bdd').directory, stub: successful('stub').directory,
    genuineAssertionRed: red.directory, iac: successful('iac').directory,
    actualHistoricalContext: successful('context').directory, earlierFocused: focused.directory,
    focused: successful('verify').directory,
    syntax: successful('syntax').directory, publisher: successful('publisher').directory,
    actualSignedBrowser: successful('browser').directory, readOnlyVerify: successful('verify').directory },
  counts: { focusedLeaves: leaves, publisherGuardGroups: 51, actualBrowserGroups: 17,
    explicitFreshC015TestUUIDsPerFocusedRun: 3, publicClosedEpochWritesPerFocusedRun: 5 },
  preservedFailures: records.filter((record) => record.exitCode !== 0).map((record) => ({
    stage: record.stage, directory: record.directory, exitCode: record.exitCode, stdoutSha256: record.stdoutSha256, stderrSha256: record.stderrSha256
  })),
  currentPublisherBoundary: checkPublisher(), unchangedDependencies: checkImports(),
  sourceAndProofFiles: snapshot(root).filter((entry) => entry.kind === 'file'),
  browserCleanup: browser.cleanup, normalReadOnlyVerification: verification,
  interpretation: 'Closed fictional local attribution only. C034 historical correlation absent; native/authenticated/lease authority unverified. H001/H007 and production Node24 incomplete.',
  appendPolicy: 'Sealed indexed bytes never change; later exact deliberate own raw captures append uniquely and are separately byte-verified.'
};
fs.writeFileSync(path.join(root, 'evidence-index.json'), `${JSON.stringify(index, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({
  cardId: 'C036', outcome: 'finalized-once', files: index.sourceAndProofFiles.length,
  preservedFailures: index.preservedFailures.length, counts: index.counts
}));
