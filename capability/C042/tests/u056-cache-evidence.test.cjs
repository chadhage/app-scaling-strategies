'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const directory = path.join(root, 'evidence', 'u056-cache-invalidation');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const manifest = (name) => JSON.parse(fs.readFileSync(path.join(directory, `${name}.json`), 'utf8'));
const stdout = (record) => zlib.gunzipSync(fs.readFileSync(path.join(directory, record.transcripts.stdout.path))).toString('utf8');
const observation = (name, kind) => JSON.parse(stdout(manifest(name)).split(/\r?\n/).find((line) => line.startsWith(`{"kind":"${kind}"`)));
const same = (bytes, raw, canonical) => sha(bytes) === raw || sha(lf(bytes)) === canonical;

test('cache correction preserves six genuine RED assertions and unchanged seven-test GREEN', () => {
  const red = manifest('red-01-mutable-caches');
  const green = manifest('green-01-mutable-caches');
  assert.deepEqual([red.exitCode, red.summary.tests, red.summary.pass, red.summary.fail, red.timedOut], [1, 7, 1, 6, false]);
  assert.equal((stdout(red).match(/code: 'ERR_ASSERTION'/g) ?? []).length, 6);
  assert.doesNotMatch(stdout(red), /TypeError|ReferenceError|SyntaxError|Cannot find module|testTimeoutFailure/);
  assert.deepEqual([green.exitCode, green.summary.tests, green.summary.pass, green.summary.fail], [0, 7, 7, 0]);
  const name = 'capability\\C042\\tests\\u056-cache.test.cjs';
  const before = red.inputs.find((item) => item.path === name);
  assert.equal(before.rawSha256, green.inputs.find((item) => item.path === name).rawSha256);
  assert.equal(same(fs.readFileSync(path.join(repository, name)), before.rawSha256, before.crlfToLfSha256), true);
});

test('cache correction measures content validation without dropping snapshot or expensive-result reuse', () => {
  const before = observation('before-01-content-validation', 'u056-cache-operations');
  const after = observation('after-01-content-validation', 'u056-cache-operations');
  assert.deepEqual(before.counts, after.counts);
  assert.deepEqual(after.counts, { walks: 25, fileReads: 362, sha256Calls: 1327, gunzipCalls: 154 });
  assert.deepEqual([before.fixtureFiles, after.fixtureFiles, after.selectedTests, after.maximumReadsOfOneFile], [362, 362, 30, 1]);
  assert.deepEqual([before.contentEqualityCalls, after.contentEqualityCalls], [0, 83173]);
  assert.equal(after.replay.selectedTests, 6);
  const parent = JSON.parse(fs.readFileSync(path.join(directory, 'parent-mutable-buffer-probe.snapshot.json'), 'utf8'));
  assert.deepEqual(parent.baselineProblems, []);
  assert.deepEqual(parent.cachedVerifierProblems, []);
  assert.equal(parent.freshVerifierProblems.length, 18);
});

test('cache correction is append-only addendum 5 with exact retained addendum-4 supersessions', () => {
  const fifth = JSON.parse(fs.readFileSync(path.join(root, 'evidence-addendum-5.json'), 'utf8'));
  assert.deepEqual([fifth.item, fifth.sequence, fifth.supersedes.length], ['U056', 5, 4]);
  assert.equal(fifth.previous.rawSha256, '1375060ff63fe1c40750d7767139c3c9407f3399c60ec735a365324d5952c574');
  assert.equal(same(fs.readFileSync(path.join(root, 'evidence-addendum-4.json')), fifth.previous.rawSha256, fifth.previous.canonicalLfSha256), true);
  for (const item of fifth.supersedes) assert.equal(same(fs.readFileSync(path.join(repository, item.retained)), item.previousRawSha256, item.previousCanonicalLfSha256), true, item.path);
  assert.equal(fifth.coverage.status, 'not-applicable');
  assert.equal(fifth.priorCandidateIdentitySha256, '117ceb4817c1687897a5a33fbbb16c115aa9a16945cbe2f6fe5c921009581351');
});

test('cache correction reruns reviewer J as the same named non-timeout assertion kill', () => {
  const record = manifest('mutant-02-reviewer-J');
  assert.equal(record.exitCode, 0);
  const line = stdout(record).split(/\r?\n/).find((line) => line.startsWith('{"kind":"mutant-J-outcome"'));
  const got = JSON.parse(line);
  assert.equal(got.verdict, 'KILLED_BY_NAMED_ASSERTION');
  assert.equal(got.timeoutAsKill, false);
  assert.deepEqual(got.control, { exitCode: 0, pass: 1 });
  assert.equal(got.mutant.assertionFailures, 1);
});
