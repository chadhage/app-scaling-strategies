'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const trace = require('..\\trace.js');
const historical = require('..\\historical.cjs');
const pinsApi = require('..\\pins.cjs');
const { evaluateApprovals, requireCurrentConsent } = require('..\\..\\C015\\consent.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');

test('strict bounded JSON rejects duplicate decoded keys, malformed/deep/oversized and rounded numeric literals', () => {
  for (const [text, code] of [
    ['', 'REQUIRED_JSON'], ['{bad}', 'INVALID_JSON'], ['{"a":1,"a":2}', 'DUPLICATE_FIELD'],
    ['{"a":1,"\\u0061":2}', 'DUPLICATE_FIELD'], ['{"x":{"a":1,"a":1}}', 'DUPLICATE_FIELD'],
    ['-0', 'UNSAFE_NUMBER_LITERAL'], ['1e309', 'UNSAFE_NUMBER_LITERAL'],
    ['1e-400', 'UNSAFE_NUMBER_LITERAL'], ['9007199254740993', 'UNSAFE_NUMBER_LITERAL'],
    ['1.0000000000000001', 'UNSAFE_NUMBER_LITERAL'],
    ['['.repeat(17) + '1' + ']'.repeat(17), 'JSON_DEPTH'],
    [JSON.stringify('é'.repeat(trace.MAX_BYTES / 2)), 'JSON_OVERSIZE']
  ]) {
    assert.throws(() => trace.parseJson(text), (error) => error.code === code, `${code}: ${text.slice(0, 60)}`);
  }
  for (const text of ['547.2000000476837', '1.20', '1e3', '0', 'true', 'null', '{"x":[]}']) {
    assert.deepEqual(trace.parseJson(text), JSON.parse(text));
  }
});

test('non-JSON data, accessors, hidden fields, symbols, sparse arrays and cycles are rejected without invoking getters', () => {
  let read = false;
  const accessor = {};
  Object.defineProperty(accessor, 'value', { enumerable: true, get() { read = true; return 1; } });
  const hidden = {};
  Object.defineProperty(hidden, 'hidden', { value: 1 });
  const symbol = { [Symbol('value')]: 1 };
  const sparse = new Array(2);
  const cycle = {};
  cycle.self = cycle;
  for (const value of [accessor, hidden, symbol, sparse, cycle, new Date(), NaN, Infinity, undefined]) {
    assert.throws(() => trace.canonical(value), (error) => error.code === 'JSON_DATA');
  }
  assert.equal(read, false);
});

test('current gates and real C015 public restore read exact known fields without schema additions or writes', async () => {
  const context = await historical.readContext();
  assert.deepEqual(context.gatesObserved.cards.map((card) => card.id), ['C020', 'C015', 'C033']);
  assert.equal(context.receipt.mode, 'actual-local-filesystem');
  assert.equal(context.receipt.restored, true);
  assert.equal(context.receipt.writesPerformed, 0);
  assert.deepEqual(Object.keys(context.receipt.state).sort(),
    ['schemaVersion', 'cardId', 'dataKind', 'runId', 'epoch', 'envelope', 'limits', 'record'].sort());
  const stored = trace.getSavedTrace('closed-history').context.receipt;
  assert.deepEqual(context.receipt.state, stored.state);
  assert.equal(context.receipt.stateSha256, stored.stateSha256);
  assert.equal(context.receipt.pid, process.pid);
});

test('literal current C001/C015 approval failures are pure read-only denials, not fixture setup or invented consent', async () => {
  const actual = await requireCurrentConsent();
  const current = { C001: actual.C001, C015: actual.C015 };
  for (const literal of [false, 'true', null]) {
    const c001 = structuredClone(current);
    c001.C001.designAndLocalImplementationApproved = literal;
    await assert.rejects(evaluateApprovals(c001), (error) => error.code === 'LOCAL_CONSENT_REQUIRED');
    const c015 = structuredClone(current);
    c015.C015.approved = literal;
    await assert.rejects(evaluateApprovals(c015), (error) => error.code === 'SCOPED_C015_APPROVAL_REQUIRED');
  }
  const drift = structuredClone(current);
  drift.C015.scope = 'arbitrary imported trace authorization';
  await assert.rejects(evaluateApprovals(drift), (error) => error.code === 'SCOPED_C015_APPROVAL_DRIFT');
});

test('source, context and CLI entry points do not accept caller path, URL, header, run or provenance overrides', async () => {
  assert.throws(() => historical.readHistorical('C:\\caller.json'), (error) => error.code === 'NO_SOURCE_OVERRIDES');
  assert.throws(() => historical.readAcceptedGates({ approved: true }), (error) => error.code === 'NO_GATE_OVERRIDES');
  await assert.rejects(historical.readContext('synthetic-run-002'), (error) => error.code === 'NO_CONTEXT_OVERRIDES');
  await assert.rejects(historical.buildBundle({ provenance: 'live' }), (error) => error.code === 'NO_CAPTURE_INPUT_OVERRIDES');
  assert.throws(() => pinsApi.readPinned({ path: '..\\C015\\store.cjs' }), (error) => error.code === 'CLOSED_PIN_REQUIRED');
  for (const args of [
    ['inspect', '..\\C015'], ['inspect', 'https://example.invalid/'], ['inspect', 'C:\\caller.json'],
    ['inspect', 'closed-history', 'X-Approved:true'], ['write', 'closed-history']
  ]) {
    const run = spawnSync(process.execPath, [path.join(root, 'cli.cjs'), ...args],
      { cwd: repository, encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.equal(run.status, 1);
    assert.equal(JSON.parse(run.stderr.trim()).code, 'CLOSED_INSPECTION_ARGUMENTS');
  }
});

test('capture guards fail before writing for nonliteral consent or unowned capture paths', () => {
  const raw = path.join(root, 'evidence', 'raw');
  const before = fs.readdirSync(raw).sort();
  for (const value of [undefined, '0', 'true']) {
    const env = { ...process.env };
    if (value === undefined) delete env.CAPTURE_BROWSER_EVIDENCE;
    else env.CAPTURE_BROWSER_EVIDENCE = value;
    delete env.C034_CAPTURE_DIR;
    const run = spawnSync(process.execPath, [path.join(__dirname, 'record.cjs'), 'bdd'],
      { cwd: repository, env, encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /exact CAPTURE_BROWSER_EVIDENCE=1/);
  }
  const run = spawnSync(process.execPath, [path.join(__dirname, 'capture-trace.cjs')],
    { cwd: repository, env: { ...process.env, CAPTURE_BROWSER_EVIDENCE: '1', C034_CAPTURE_DIR: root },
      encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(run.status, 1);
  assert.deepEqual(fs.readdirSync(raw).sort(), before);
});

test('raw working CRLF and accepted Git-canonical dependencies are verified separately without rewriting them', () => {
  assert.equal(Object.isFrozen(pinsApi.pins.dependencies), true);
  assert.equal(Object.isFrozen(pinsApi.pins.dependencies[0]), true);
  assert.equal(Object.isFrozen(pinsApi.pins.accepted.C033), true);
  assert.throws(() => pinsApi.checkImports({ provenance: 'caller' }), (error) => error.code === 'NO_SOURCE_OVERRIDES');
  const checked = pinsApi.checkImports();
  assert.equal(checked.length, pinsApi.pins.dependencies.length);
  assert.ok(checked.some((entry) => !entry.rawEqualsGit));
  assert.ok(checked.some((entry) => entry.rawEqualsGit && entry.workingRawSha256 !== entry.crlfToLfSha256));
  console.log(JSON.stringify({ checkedPins: checked.length, C020RawDiffersFromGit: true, C033GitPreservesRawCRLF: true }));
});
