'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { audit, auditAllManifests, browserVersionFrom, capture, transportProblems, verifyCapturedInputs, verifyFreeze, verifyRows } = require('./final-evidence.cjs');
const { sha } = require('./evidence-verify.cjs');

const OPTIONS = { timeout: 900000 };

test('FINAL source phase: every namespace source byte, read-only producer and retained historical evidence byte belongs to the single freeze', OPTIONS, () => {
  const freeze = verifyFreeze();
  assert.equal(freeze.workerId, 'worker-C059');
  assert.equal(freeze.liveApplicationPermission, false);
  assert.equal(freeze.productionCommit, 'ea81f6ec59c3a9356827724a6b35ca45b1353d46');
  assert.equal(freeze.productionFiles.length, 5);
  assert.ok(freeze.source.length > 60);
});

for (const [name, tests, pass, fail, testFiles] of [
  ['final-d1-red-01', 142, 88, 54, ['queued-cancel.test.cjs']],
  ['final-metadata-red-01', 7, 1, 6, ['equivalence-declaration.test.cjs', 'identifier-inventory.test.cjs']],
  ['final-policy-red-01', 4, 0, 4, ['mutation-policy.test.cjs']],
]) {
  test(`FINAL genuine RED ${name}: named behavioral assertions, exact inputs, and the same test bytes that run in GREEN`, OPTIONS, () => {
    const checked = capture(name);
    assert.deepEqual(checked.problems, []);
    const { manifest, stdout } = checked;
    assert.deepEqual([manifest.exitCode, manifest.expectedExitCode, manifest.timedOut], [1, 1, false]);
    assert.deepEqual([manifest.summary.tests, manifest.summary.pass, manifest.summary.fail], [tests, pass, fail]);
    assert.equal((stdout.match(/code: 'ERR_ASSERTION'/g) ?? []).length, fail);
    assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|SyntaxError|ReferenceError|TypeError|testTimeoutFailure/);
    assert.equal(manifest.transcripts.stderr.bytes, 0);
    for (const file of testFiles) {
      const input = manifest.inputs.find((row) => row.path.endsWith(`tests\\${file}`));
      assert.ok(input, `${file} is a real input`);
      assert.equal(input.rawSha256, sha(fs.readFileSync(path.join(__dirname, file))), `${file} is unchanged between RED and GREEN`);
    }
  });
}

test('FINAL pre-browser private GREEN gates really execute: five loaded per-file coverage rows, all causal mutants, load loop and the measured cap', OPTIONS, () => {
  const report = audit();
  assert.deepEqual(report.mutation.survivors, []);
  assert.equal(report.mutation.undecided, 0);
  assert.equal(report.enumeratedCoverage.length, 5);
  assert.equal(report.loop.passed, 20);
  assert.equal(report.f24.accepted, 32);
  assert.equal(report.complete, false, 'native browser and fresh-tree completion are separate mandatory final-audit gates, not silently counted here');
});

test('FINAL every manifest is inventoried, including failed history and immutable shared-recorder originals; all gzip and decoded-byte hashes are checked', OPTIONS, () => {
  const all = auditAllManifests();
  assert.ok(all.some((row) => row.path.startsWith('evidence/red/')));
  assert.ok(all.some((row) => row.path.startsWith('evidence/raw/')));
  assert.ok(all.some((row) => row.path.startsWith('evidence/transport-final/')));
  assert.ok(all.some((row) => !row.historicalRunMatchedExpectation), 'retained failed attempts are visible, never relabelled passes');
});

test('FINAL tamper controls: a source, producer or metadata byte fails by name; accepted LF is allowed only for a producer', () => {
  const original = Buffer.from('one\r\ntwo\r\n');
  const lf = Buffer.from('one\ntwo\n');
  const source = { path: 'capability\\C059\\test.cjs', rawSha256: sha(original), crlfToLfSha256: sha(lf) };
  const producer = { ...source, path: 'capability\\C042\\contract.js', acceptLf: true };
  assert.deepEqual(verifyRows([source], () => original), []);
  assert.deepEqual(verifyRows([source], () => lf), [`CHANGED ${source.path}`]);
  assert.deepEqual(verifyRows([producer], () => lf), []);
  for (const row of [source, producer, { ...source, path: 'metadata.json' }]) {
    assert.deepEqual(verifyRows([row], () => Buffer.concat([original, Buffer.from(' planted')])), [`CHANGED ${row.path}`]);
    assert.deepEqual(verifyRows([row], () => { throw new Error('missing'); }), [`MISSING ${row.path}`]);
  }
});

test('FINAL transport amendment cannot alter an observation, an input hash or the immutable original recorder manifest', () => {
  const checked = capture('final-d1-red-01');
  const logical = checked.manifest;
  const originalPath = path.resolve(__dirname, '..', 'evidence', 'raw', logical.privateCaptureTransport.original);
  const bytes = fs.readFileSync(originalPath);
  const original = JSON.parse(bytes);
  assert.deepEqual(transportProblems(logical, original, bytes), []);
  assert.deepEqual(transportProblems({ ...logical, exitCode: 0 }, original, bytes), ['TRANSPORT_OBSERVATION_CHANGED']);
  const changedInput = { ...logical, inputs: logical.inputs.map((row, index) => index ? row : { ...row, rawSha256: '0'.repeat(64) }) };
  assert.deepEqual(transportProblems(changedInput, original, bytes), ['TRANSPORT_OBSERVATION_CHANGED']);
  assert.ok(transportProblems(logical, original, Buffer.concat([bytes, Buffer.from(' ')] )).includes('TRANSPORT_ORIGINAL_CHANGED'));
});

test('FINAL fresh-tree input transport accepts only the pinned producer text forms, never an edited producer, missing file or normalized owned source', () => {
  const crlf = Buffer.from('one\r\ntwo\r\n');
  const lf = Buffer.from('one\ntwo\n');
  const producer = { path: 'capability\\C042\\contract.js', crlfToLfSha256: sha(lf) };
  const input = { path: producer.path, rawSha256: sha(lf), crlfToLfSha256: sha(lf) };
  const manifest = { inputs: [input], privateCaptureTransport: { producerTextForms: true } };
  assert.deepEqual(verifyCapturedInputs(manifest, () => crlf, [producer]), []);
  assert.deepEqual(verifyCapturedInputs(manifest, () => Buffer.concat([crlf, Buffer.from(' changed')]), [producer]), [`INPUT_CHANGED ${input.path}`]);
  assert.deepEqual(verifyCapturedInputs(manifest, () => crlf, []), [`INPUT_CHANGED ${input.path}`]);
  assert.deepEqual(verifyCapturedInputs({ ...manifest, privateCaptureTransport: { producerTextForms: false } }, () => crlf, [producer]), [`INPUT_CHANGED ${input.path}`]);
  assert.deepEqual(verifyCapturedInputs(manifest, () => { throw new Error('absent'); }, [producer]), [`INPUT_MISSING ${input.path}`]);
});

test('FINAL browser metadata reads the actual summary.browserVersion, not an unprinted observation field or a fixed historical build', () => {
  for (const version of ['157.1.2.3', '157.9.8.7']) {
    const text = `PASS signed and qualified\n${JSON.stringify({ summary: { browserVersion: version } })}\n${JSON.stringify({ result: 'ok', checks: 21 })}\n`;
    assert.equal(browserVersionFrom(text), version);
  }
});

test('FINAL browser metadata refuses a missing, duplicated, numeric or malformed recorded version', () => {
  const valid = JSON.stringify({ summary: { browserVersion: '157.1.2.3' } });
  for (const text of ['{"major":157}', `${valid}\n${valid}`, '{"summary":{"browserVersion":157}}', '{"summary":{"browserVersion":"157x"}}']) {
    assert.throws(() => browserVersionFrom(text), { code: 'ERR_ASSERTION' });
  }
});
