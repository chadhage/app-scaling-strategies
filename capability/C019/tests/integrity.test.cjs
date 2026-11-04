'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { gunzipSync } = require('node:zlib');
const { root, repo, sha } = require('./provenance.cjs');
const types = require('..\\errors.js');
const manifest = require('..\\manifest.json');
const index = require('..\\evidence-index.json');
const { cases } = require('./fixtures.cjs');
const { parseStored, validatePersisted } = require('..\\..\\C015\\contract.cjs');
const approval = require('..\\..\\C001\\approved-contract.js').approval;

function owned(relative) {
  assert.equal(typeof relative, 'string');
  assert.ok(relative.startsWith('evidence\\'));
  assert.equal(relative.split('\\').some((piece) => piece === '..' || piece === ''), false);
  assert.doesNotMatch(relative, /[:\0]/);
  const target = path.resolve(root, relative);
  assert.ok(target.startsWith(root + path.sep));
  assert.equal(fs.lstatSync(target).isFile(), true);
  return target;
}
function json(relative) { return JSON.parse(fs.readFileSync(owned(relative))); }
function raw(directory, entry) {
  const bytes = gunzipSync(fs.readFileSync(path.join(directory, entry.file)));
  assert.equal(bytes.length, entry.originalBytes);
  assert.equal(sha(bytes), entry.originalSha256);
  return bytes;
}
const fixturePath = owned(index.actualFixtureErrors);
const fixtureDirectory = path.dirname(fixturePath);
const fixtures = JSON.parse(fs.readFileSync(fixturePath));
const bank = require(owned(index.historicalBrowserBundle));

test('genuine loadable-stub RED and original raw assertion failure remain verifiable', () => {
  const red = json(index.genuineRed);
  assert.equal(red.mode, 'red');
  assert.equal(red.exitCode, 1);
  assert.equal(red.genuineAssertionRed, true);
  const directory = path.dirname(owned(index.genuineRed));
  const stdout = raw(directory, red.stdout).toString('utf8');
  assert.match(stdout, /ERR_ASSERTION/);
  assert.match(stdout, /uninspected/);
  assert.match(stdout, /failed/);
  assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|SyntaxError/);
  const stub = raw(directory, red.snapshots.find((entry) => entry.path === 'recovery.js').working);
  const module = { exports: {} };
  vm.runInNewContext(stub.toString('utf8'), { module });
  assert.equal(new module.exports.RecoveryConsole().state.status, 'uninspected');
  assert.notEqual(sha(stub), sha(fs.readFileSync(path.join(root, 'recovery.js'))));
});
test('prerequisites preserve distinct raw working CRLF and Git-canonical hashes', () => {
  const prior = json(index.prerequisitesWorkingAndGitCanonical);
  assert.equal(prior.mode, 'prerequisites');
  assert.match(prior.baseline, /^[a-f0-9]{40}$/);
  const directory = path.dirname(owned(index.prerequisitesWorkingAndGitCanonical));
  for (const snapshot of prior.snapshots) {
    const working = raw(directory, snapshot.working);
    if (snapshot.canonical) raw(directory, snapshot.canonical);
    if (/^capability\\(?:C001|C002|C015)\\/.test(snapshot.path)) {
      assert.deepEqual(fs.readFileSync(path.join(repo, snapshot.path)), working, 'Accepted public dependency bytes must not drift.');
    }
  }
  const readme = prior.snapshots.find((entry) => entry.path === 'README.md');
  assert.ok(readme.working.crlf > 0);
  assert.equal(readme.canonical.crlf, 0);
  assert.notEqual(readme.working.originalSha256, readme.canonical.originalSha256);
  assert.equal(prior.snapshots.at(-1).working.originalSha256, manifest.historicalPublisherSha256);
});
test('historical browser bank is exactly the genuine captured error records, not a duplicate engine', () => {
  assert.equal(bank.mode, 'bundled-historical-C015-errors');
  assert.equal(bank.filesystemInspectionNow, false);
  assert.equal(bank.recoveryConfirmed, false);
  assert.equal(bank.cases.length, cases.length);
  assert.equal(sha(Buffer.from(types.canonical(bank))), fixtures.bankSha256);
  assert.equal(fixtures.bankSha256, manifest.historicalObservationsCanonicalSha256);
  assert.ok(fs.readFileSync(path.join(root, 'app.js'), 'utf8').includes(fixtures.bankSha256));
  for (const [position, entry] of bank.cases.entries()) {
    assert.equal(entry.id, cases[position].id);
    assert.equal(entry.failure.error.code, cases[position].code);
    assert.deepEqual(entry.failure, fixtures.records[position].apiFailure);
    assert.ok(types.failure(entry.failure));
  }
});
test('real process errors and exit faults contain no acknowledgment or success fallback', () => {
  const pids = new Set();
  let count = 0;
  for (const record of fixtures.records) {
    assert.equal(record.apiFailure.error.name, 'C015FixtureError');
    assert.equal(record.apiFailure.error.code, record.expectedCode);
    assert.equal(record.cleaned, true);
    assert.equal(record.recoveryConfirmed, false);
    assert.equal(record.writesAuthorizedByRecovery, false);
    assert.match(record.namespace, /^test-[0-9a-f-]{36}$/);
    for (const process of record.processes) {
      assert.ok(Number.isSafeInteger(process.pid) && process.pid > 0);
      assert.equal(pids.has(process.pid), false);
      pids.add(process.pid);
      const stdout = raw(fixtureDirectory, process.stdout);
      const stderr = raw(fixtureDirectory, process.stderr);
      const observed = JSON.parse((process.exitCode === 0 ? stdout : stderr).toString('utf8').trim());
      assert.deepEqual(observed, process.value);
      if (process.exitCode !== 0) {
        assert.equal(stdout.length, 0);
        assert.equal(observed.acknowledged, false);
        if (process.exitCode === 86) {
          assert.equal(observed.code, 'FAIL_BEFORE_ACK');
          assert.equal(observed.stage, record.testFault);
        } else {
          assert.equal(process.exitCode, 1);
          assert.equal(observed.code, record.expectedCode);
          assert.equal(observed.restored, false);
          assert.equal(observed.errorType, 'C015FixtureError');
          assert.equal(observed.rawExceptionTextRetained, false);
          assert.equal(Object.hasOwn(observed, 'message'), false);
        }
      }
      count++;
    }
  }
  assert.equal(count, fixtures.freshProcesses);
  assert.equal(count, 28);
  assert.equal(fixtures.namespacesCleaned, 13);
});
test('earlier acknowledged bytes survive every owned fault/corruption/input test and validate with actual C015 schema', async () => {
  let retained = 0;
  for (const record of fixtures.records) {
    for (const file of record.ownedFiles) raw(fixtureDirectory, file.archived);
    if (record.previousAcknowledgmentExists) {
      const before = raw(fixtureDirectory, record.before);
      const after = raw(fixtureDirectory, record.after);
      assert.deepEqual(after, before);
      assert.equal(record.acknowledgmentBytesPreserved, true);
      const persisted = await validatePersisted(parseStored(before), approval, null);
      assert.deepEqual(persisted.acknowledgment, record.apiFailure.priorAcknowledgment);
      retained++;
    } else {
      assert.equal(record.before, null);
      assert.equal(record.after, null);
      assert.equal(record.acknowledgmentBytesPreserved, null, 'Absent prior state is not claimed as acknowledged.');
    }
    if (record.testFault !== null) {
      assert.equal(record.ownedFiles.some((file) => file.relative === 'writer.lock'), true);
      assert.equal(record.apiFailure.error.code, 'HOLD_UNOBSERVED');
    }
  }
  assert.equal(retained, 12);
  assert.equal(retained, fixtures.priorAcknowledgmentsRetained);
});
test('every capture is append-only hash-checked raw evidence, including any failed attempts', () => {
  const evidence = path.join(root, 'evidence');
  for (const directory of fs.readdirSync(evidence, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const base = path.join(evidence, directory.name);
    const recordFile = path.join(base, 'capture.raw.json');
    assert.equal(fs.existsSync(recordFile), true);
    const capture = JSON.parse(fs.readFileSync(recordFile));
    assert.equal(capture.cardId, 'C019');
    assert.equal(capture.deliberateCapture, true);
    raw(base, capture.stdout);
    raw(base, capture.stderr);
    for (const item of capture.files) {
      const bytes = fs.readFileSync(path.join(base, item.name));
      assert.equal(bytes.length, item.bytes);
      assert.equal(sha(bytes), item.sha256);
    }
    for (const snapshot of capture.snapshots) {
      raw(base, snapshot.working);
      if (snapshot.canonical) raw(base, snapshot.canonical);
    }
    assert.ok(fs.readFileSync(recordFile).includes(Buffer.from('\r\n')));
  }
  for (const relative of [...index.focused, ...index.browser, ...index.syntax, ...index.failedAttempts]) owned(relative);
});
test('archived exact approved publisher contract retains guards; current readiness is checked separately', () => {
  const prior = json(index.prerequisitesWorkingAndGitCanonical);
  const bytes = raw(path.dirname(owned(index.prerequisitesWorkingAndGitCanonical)), prior.snapshots.at(-1).working);
  assert.equal(sha(bytes), manifest.historicalPublisherSha256);
  const source = bytes.toString('utf8');
  for (const text of ["C019='S'", 'if ($Admin)', 'Not an owned card path',
    'Main must already equal remote before staging', 'blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol',
    "('commit','--only'", "('tag','-a'", "('push','--atomic'", 'Co-authored-by: Copilot',
    "('merge-base','--is-ancestor'"]) assert.ok(source.includes(text));
  assert.equal(manifest.historicalPublisherSha256, '48846487727dd2ef35f03d88d65e64121059b6867188bbf34daeaee3fda1c09d');
});

test('same-C019 publisher metadata repair preserves every runtime and historical proof byte', () => {
  const snapshot = json(manifest.publisherAuthorizationSnapshot);
  const historical = json(manifest.historicalF6AuthorizationSnapshot);
  for (const [file, digest] of Object.entries({ ...historical.preservation.runtime, ...historical.preservation.historicalEvidence })) {
    assert.equal(sha(fs.readFileSync(path.join(root, file))), digest);
  }
  assert.equal(snapshot.runtimeErrorsActionsC015AndHistoricalProofChanged, false);
  assert.equal(snapshot.authorizationNotInferredFromDigest, true);
  assert.equal(snapshot.authorization.sourceSelector, 'localPublisherAuthorization.budgetAndGoalRevision');
  assert.equal(snapshot.actualPublisherSha256, manifest.historical60AEPublisherSha256);
  assert.equal(snapshot.originalHistoricalPublisherSha256, manifest.historicalPublisherSha256);
});
