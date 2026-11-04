'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { root, repository } = require('./inventory.cjs');
const { hash, normalize, readRegular, checkImports, checkPublisher } = require('..\\pins.cjs');
const index = JSON.parse(fs.readFileSync(path.join(root, 'evidence-index.json'), 'utf8'));

test('all indexed own source and immutable proof bytes remain unchanged including original RED/failures', () => {
  for (const file of index.sourceAndProofFiles) {
    assert.ok(file.path.startsWith('capability\\C036\\'));
    const bytes = readRegular(file.path, 8388608);
    assert.equal(bytes.length, file.bytes);
    assert.equal(hash(bytes), file.rawSha256, file.path);
    if (file.crlfToLfSha256) assert.equal(hash(normalize(bytes)), file.crlfToLfSha256, file.path);
  }
  assert.equal(index.extraCredits, 0);
  assert.equal(index.kano, 'D');
});
test('genuine false-attribution assertion RED remains an original failure, not syntax or dependency evidence', () => {
  const directory = path.resolve(repository, index.sequence.genuineAssertionRed);
  const run = JSON.parse(fs.readFileSync(path.join(directory, 'run.json'), 'utf8'));
  const raw = gunzipSync(fs.readFileSync(path.join(directory, 'stdout.raw.gz')));
  assert.equal(hash(raw), run.stdoutSha256);
  assert.equal(run.exitCode, 1);
  assert.match(raw.toString('utf8'), /name: 'AssertionError'/);
  assert.match(raw.toString('utf8'), /actual: 'attached'/);
  assert.match(raw.toString('utf8'), /expected: 'rejected'/);
  assert.ok(index.preservedFailures.some((item) => item.stage === 'publisher'));
  assert.ok(index.preservedFailures.some((item) => item.stage === 'pins'));
});
test('all actual append-only raw captures retain their exact original stdout/stderr byte digests', () => {
  for (const entry of fs.readdirSync(path.join(root, 'evidence', 'raw'), { withFileTypes: true })) {
    assert.equal(entry.isSymbolicLink(), false);
    assert.equal(entry.isDirectory(), true);
    assert.match(entry.name, /^(?:bdd|stub|red|iac|pins|context|focused|syntax|publisher|browser|verify|integrity|publication)-[0-9a-f-]{36}$/);
    const directory = path.join(root, 'evidence', 'raw', entry.name);
    const file = path.join(directory, 'run.json');
    if (!fs.existsSync(file)) {
      assert.deepEqual(fs.readdirSync(directory), [], 'Only an active recorder newly created empty own directory can be unfinalized.');
      continue;
    }
    const run = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(run.cardId, 'C036');
    assert.equal(run.workerId, 'worker-C036');
    for (const name of ['stdout', 'stderr']) {
      const raw = gunzipSync(fs.readFileSync(path.join(directory, `${name}.raw.gz`)));
      assert.equal(hash(raw), run[`${name}Sha256`]);
    }
  }
});
test('actual browser proof separates fictional fixture verification from native/authenticated status and closes exact ownership', () => {
  const directory = path.resolve(repository, index.sequence.actualSignedBrowser);
  const report = JSON.parse(fs.readFileSync(path.join(directory, 'summary.json'), 'utf8'));
  assert.equal(report.outcome, 'passed');
  assert.equal(report.checks.length, 17);
  assert.equal(report.playwrightVersion, '1.56.1');
  assert.equal(report.actualSignedEdge.authenticodeStatus, 'Valid');
  assert.match(report.browserVersion, /^156\./);
  assert.equal(report.nativeCorrelationVerified, false);
  assert.equal(report.authenticatedIdentityVerified, false);
  assert.equal(report.leaseAuthority, false);
  assert.ok(Object.values(report.cleanup).every((value) => value === true));
  assert.equal(fs.existsSync(report.actualProfile.actualIsolatedProfile), false);
  assert.equal(fs.existsSync(report.actualHelperSession), false);
});
test('current publication authorization is read live and archived E6 remains only historical evidence', () => {
  const current = checkPublisher();
  assert.equal(current.actualSha256, current.currentParentAuthorization.publisherSha256);
  const old = JSON.parse(fs.readFileSync(path.join(root, 'publisher-boundary.json'), 'utf8'));
  assert.equal(old.actualSha256, 'e6d9e8bf9c9ff592bf463bd85656ecfec46c4eb33b0ab7f14bb7f317fcc65e22');
  assert.equal(current.historicalDigestIsNotCurrentAuthority, true);
  assert.equal(index.counts.publisherGuardGroups, 51);
  assert.deepEqual(checkImports(), index.unchangedDependencies);
});
