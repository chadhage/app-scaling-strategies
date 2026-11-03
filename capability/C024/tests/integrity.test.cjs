'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const { verify } = require('./integrity.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const load = (name) => JSON.parse(fs.readFileSync(path.join(root, 'evidence', `${name}.json`), 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function raw(record, name) {
  const output = record.output[name];
  const bytes = gunzipSync(fs.readFileSync(path.join(repository, output.path)));
  assert.equal(bytes.length, output.bytes);
  assert.equal(sha256(bytes), output.sha256);
  return bytes.toString('utf8');
}

test('all owned source and historical proof files match the exact read-only SHA-256 inventory', () => {
  assert.ok(verify() > 25);
});

test('actual loadable stub and five original assertion failures precede IaC N/A and green', () => {
  const stub = load('stub-load');
  const red = load('tdd-red');
  const iac = load('iac-na');
  const green = load('tdd-green');
  assert.equal(stub.exitCode, 0);
  assert.equal(red.exitCode, 1);
  assert.equal(iac.exitCode, 0);
  assert.equal(green.exitCode, 0);
  assert.ok(stub.completedAtUtc <= red.startedAtUtc);
  assert.ok(red.completedAtUtc <= iac.startedAtUtc);
  assert.ok(iac.completedAtUtc <= green.startedAtUtc);
  const text = raw(red, 'stdout');
  assert.match(text, /# tests 5/);
  assert.match(text, /# pass 0/);
  assert.match(text, /# fail 5/);
  assert.equal((text.match(/name: 'AssertionError'/g) || []).length, 5);
  assert.doesNotMatch(text + raw(red, 'stderr'), /SyntaxError|MODULE_NOT_FOUND|Cannot find module/);
  assert.match(raw(iac, 'stdout'), /"status":"N\/A"/);
  assert.match(raw(green, 'stdout'), /# fail 0/);
  for (const [original, retained] of [
    ['capability\\C024\\upload.js', 'upload.stub.cjs'],
    ['capability\\C024\\tests\\upload.test.cjs', 'upload.behavior.snapshot.cjs']
  ]) {
    const source = red.sourceHashes.find((entry) => entry.path === original);
    assert.ok(source);
    assert.equal(sha256(fs.readFileSync(path.join(root, 'evidence', 'red', retained))), source.sha256);
    assert.doesNotMatch(retained, /(?:^test[.-]|[._-]test\.)/);
  }
  const replay = load('red-reproduction-qualified');
  assert.equal(replay.exitCode, 1);
  const replayText = raw(replay, 'stdout');
  assert.match(replayText, /# tests 5/);
  assert.match(replayText, /# fail 5/);
  assert.equal((replayText.match(/name: 'AssertionError'/g) || []).length, 5);
  assert.doesNotMatch(replayText + raw(replay, 'stderr'), /SyntaxError|MODULE_NOT_FOUND/);
});

test('captured actual browser proof is qualified, local-only, passing and cleanup-complete', () => {
  const proof = load('browser-acceptance');
  assert.equal(proof.outcome, 'passed');
  assert.equal(proof.explicitCapture, true);
  assert.equal(proof.playwrightVersion, '1.56.1');
  assert.match(proof.browserVersion, /^156\./);
  assert.equal(proof.signedEdge.status, 'Valid');
  assert.equal(proof.testRuntime, 'v22.23.4');
  assert.equal(proof.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(proof.cleanup.browserClosed, true);
  assert.equal(proof.cleanup.serverCreated, false);
  for (const field of ['productionRuntimeValidated', 'nativeQualified', 'durableStorageImplemented',
    'arbitraryUserUpload', 'integratedForegroundLeaseUsed']) assert.equal(proof[field], false);
  assert.ok(proof.checks.length >= 16);
  assert.equal(proof.checks.every((check) => check.passed === true), true);
  for (const word of ['Tab/Enter', 'duplicate', 'missing', 'pause/resume', 'digest rejection',
    'reset during', 'reload', 'CSP', 'SHA-256']) {
    assert.ok(proof.checks.some((check) => check.name.includes(word)), word);
  }
  const actualHash = proof.checks.find((check) => check.name.startsWith('real browser Web Crypto')).observed;
  assert.equal(actualHash.byteCount, 256);
  assert.equal(actualHash.actualSha256, '3ef33734daae0e353f132ff5f3241d8f86ba81f851c0b9685149f079c16eb45b');
  assert.deepEqual(actualHash.orderedPartIds, ['part-001', 'part-002', 'part-003', 'part-004']);
  const png = fs.readFileSync(path.join(root, proof.screenshot));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('every explicit execution record retains raw byte-exact stdout/stderr and actual runtime/exit code', () => {
  const records = fs.readdirSync(path.join(root, 'evidence')).filter((name) => name.endsWith('.json'));
  let count = 0;
  for (const name of records) {
    const record = JSON.parse(fs.readFileSync(path.join(root, 'evidence', name), 'utf8'));
    if (!record.command || !record.output) continue;
    assert.equal(record.runtime, 'v22.23.4');
    assert.ok([0, 1].includes(record.exitCode), name);
    assert.ok(record.startedAtUtc <= record.completedAtUtc);
    raw(record, 'stdout');
    raw(record, 'stderr');
    count++;
  }
  assert.ok(count >= 8);
});

test('evidence summary preserves one frozen S unit, original parent lineage and unqualified remaining scope', () => {
  const summary = JSON.parse(fs.readFileSync(path.join(root, 'evidence.json'), 'utf8'));
  assert.equal(summary.cardId, 'C024');
  assert.equal(summary.kano, 'S');
  assert.equal(summary.kanoUnit, 'C024');
  assert.deepEqual(summary.parents, ['H005']);
  assert.equal(summary.nativeQualified, false);
  assert.equal(summary.productionRuntimeValidated, false);
  assert.equal(summary.parentAcceptance, 'pending independent parent review; no self-Accept');
  assert.ok(summary.remainingOriginalGates.some((gate) => gate.includes('B-S043')));
});
