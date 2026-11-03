'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { createHash, webcrypto } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const provenance = require('../plan-provenance.js');
const fixtures = require('../plan-fixtures.js');
const snapshot = require('../../C001/approved-contract.js');
const guard = require('../../C001/contract-guard.js');
const validator = require('../../C002/validator.js');
const envelopeContract = require('../../C002/run-envelope-contract.js');
const envelopeFixture = require('../../C002/synthetic-fixture.js');
const jsonInput = require('../../C002/json-input.js');
const matrixContract = require('../../C003/matrix-contract.js');
const matrix = require('../../C003/matrix-data.js');
const root = path.resolve(__dirname, '..', '..', '..');
const source = fs.readFileSync(path.join(__dirname, '..', 'plan-model.js'), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');

for (const pin of provenance.sourceFiles) {
  test(`accepted dependency source unchanged: ${pin.path}`, () => {
    const fullPath = path.join(root, ...pin.path.split('\\'));
    const checkout = fs.readFileSync(fullPath);
    assert.ok([pin.sha256, pin.gitBlobSha256].includes(hash(checkout)), 'only exact accepted LF/CRLF representations are allowed');
    const card = pin.path.split('\\')[1];
    const published = execFileSync('git', ['--no-pager', 'show', `${provenance[card].commit}:${pin.path.replaceAll('\\', '/')}`],
      { cwd: root, windowsHide: true });
    assert.equal(hash(published), pin.gitBlobSha256);
    assert.equal(checkout.toString('utf8').replaceAll('\r\n', '\n'), published.toString('utf8').replaceAll('\r\n', '\n'));
  });
}

test('runtime data hashes match the accepted C002 contract/fixture and C003 matrix', () => {
  assert.equal(hash(JSON.stringify(envelopeContract)), provenance.C002.contractDataSha256);
  assert.equal(hash(JSON.stringify(envelopeFixture)), provenance.C002.fixtureDataSha256);
  assert.equal(hash(JSON.stringify(matrix)), provenance.C003.matrixDataSha256);
  assert.equal(guard.snapshotSha256, provenance.C001.snapshotSha256);
});

function isolatedModel(overrides = {}) {
  const context = {
    Object, TextEncoder, crypto: webcrypto,
    C001ApprovedContract: snapshot, C001ContractGuard: guard,
    C002Validator: validator, C002RunEnvelopeContract: envelopeContract, C002SyntheticFixture: envelopeFixture,
    C003Contract: matrixContract, C003Matrix: matrix, C004Provenance: provenance,
    ...overrides
  };
  vm.runInNewContext(source, context);
  return context.C004PlanModel;
}

for (const [label, overrides, code] of [
  ['missing C001 authority', { C001ContractGuard: undefined }, 'DEPENDENCY_UNAVAILABLE'],
  ['missing C002 validator', { C002Validator: undefined }, 'DEPENDENCY_UNAVAILABLE'],
  ['missing C003 matrix', { C003Matrix: undefined }, 'DEPENDENCY_UNAVAILABLE'],
  ['unavailable SHA-256', { crypto: {} }, 'INTEGRITY_UNAVAILABLE'],
  ['changed C002 schema', { C002RunEnvelopeContract: { ...envelopeContract, numericPolicy: 'silently coerce strings' } }, 'DEPENDENCY_DRIFT'],
  ['changed C002 fixture', { C002SyntheticFixture: {} }, 'DEPENDENCY_DRIFT'],
  ['changed C003 matrix', { C003Matrix: { ...matrix, scope: 'native-qualified' } }, 'DEPENDENCY_DRIFT'],
  ['throwing dependency', { C002Validator: { validateRunEnvelope() { throw new Error('test failure'); } } }, 'PLAN_REVIEW_UNAVAILABLE']
]) {
  test(`dependency failures deny local review explicitly: ${label}`, async () => {
    const result = await isolatedModel(overrides).buildPlan(fixtures.local, snapshot.approval);
    assert.equal(result.valid, false);
    assert.equal(result.plan, null);
    assert.equal(result.executed, false);
    assert.ok(result.errors.some(error => error.code === code), JSON.stringify(result.errors));
  });
}

test('model actually delegates to accepted C002 and C003 functions unchanged', async () => {
  let validationCalls = 0;
  let matrixCalls = 0;
  let filterCalls = 0;
  const model = isolatedModel({
    C002Validator: { validateRunEnvelope(...args) { validationCalls++; return validator.validateRunEnvelope(...args); } },
    C003Contract: {
      ...matrixContract,
      validateMatrix(...args) { matrixCalls++; return matrixContract.validateMatrix(...args); },
      filterRows(...args) { filterCalls++; return matrixContract.filterRows(...args); }
    }
  });
  const result = await model.buildPlan(fixtures.native, snapshot.approval);
  assert.equal(result.valid, true);
  assert.equal(validationCalls, 1);
  assert.equal(matrixCalls, 1);
  assert.equal(filterCalls, 1);
});

test('the unchanged C002 text parser rejects duplicates and rounded numbers before plan review', () => {
  for (const [text, code] of [
    ['{"pricing":{"status":"missing","status":"not-applicable"}}', 'DUPLICATE_FIELD'],
    ['{"resources":{"cloudResourceCount":1.00000000000000001}}', 'UNSAFE_NUMBER_LITERAL'],
    ['{"resources":{"cloudResourceCount":-0}}', 'UNSAFE_NUMBER_LITERAL'],
    ['{bad', 'INVALID_JSON'],
    ['', 'REQUIRED_JSON']
  ]) {
    const result = jsonInput.parseJsonInput(text, 'plan');
    assert.equal(result.value, null);
    assert.ok(result.errors.some(error => error.code === code));
  }
});

test('static page uses only local scripts and safe DOM, closed connection policy, and no executor or storage', () => {
  const directory = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  const page = fs.readFileSync(path.join(directory, 'plan-page.js'), 'utf8');
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /worker-src 'none'/);
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="polite"/);
  assert.equal((html.match(/<script\b/g) || []).length, 12);
  for (const match of html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>/g)) {
    assert.ok(!/^[a-z]+:|^\/\//i.test(match[1]));
    assert.ok(fs.existsSync(path.resolve(directory, ...match[1].split('/'))));
  }
  assert.doesNotMatch(html, /\bonclick=|<form\b|<iframe\b|<script(?![^>]*\bsrc=)/);
  assert.doesNotMatch(page + source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|innerHTML|insertAdjacentHTML|navigator\.sendBeacon/);
  const evidence = fs.readdirSync(path.join(directory, 'evidence'));
  assert.ok(evidence.includes('red-plan-model.js.txt'));
  assert.ok(evidence.includes('red-behavior.cjs.txt'));
  assert.ok(!evidence.some(name => name.endsWith('.test.cjs')));
});

test('exact raw RED artifacts and source snapshots are retained and roundtrip with recorded hashes', () => {
  const directory = path.resolve(__dirname, '..', 'evidence');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'raw-artifacts.json'), 'utf8'));
  assert.equal(manifest.noRawBytesDiscarded, true);
  assert.equal(manifest.records.length, 4);
  for (const record of manifest.records) {
    const compressed = fs.readFileSync(path.join(directory, record.archive));
    assert.equal(hash(compressed), record.compressedSha256);
    const raw = gunzipSync(compressed);
    assert.equal(hash(raw), record.uncompressedSha256);
    assert.equal(raw.length, record.uncompressedBytes);
    const readable = fs.readFileSync(path.join(directory, record.readable));
    assert.ok([record.readableSha256, record.readableLfSha256].includes(hash(readable)));
    assert.equal(readable.toString('utf8').replaceAll('\r\n', '\n'),
      raw.toString('utf8').replace(/[ \t]+(?=\r?$)/gm, '').replaceAll('\r\n', '\n'));
  }
  const red = gunzipSync(fs.readFileSync(path.join(directory, 'tdd-red.txt.gz'))).toString('utf8');
  assert.match(red, /tests 3/);
  assert.match(red, /pass 0/);
  assert.match(red, /fail 3/);
  assert.match(red, /AssertionError/);
  assert.doesNotMatch(red, /MODULE_NOT_FOUND|SyntaxError/);
});
