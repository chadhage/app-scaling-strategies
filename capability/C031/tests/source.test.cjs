'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const childProcess = require('node:child_process');
const evaluator = require('..\\evaluator.js');
const source = require('..\\source.cjs');

const hex = /^[0-9a-f]{64}$/;
const contractPath = 'capability\\C020\\contract.js';

test('imports.json pins every read-only dependency by raw bytes, LF bytes and accepted Git blob, and the one own bundle', () => {
  const { pins } = source;
  assert.equal(pins.schema, 'C031-source-pins/1');
  assert.deepEqual(Object.keys(pins.accepted).sort(), ['C020', 'C033', 'C034']);
  for (const [card, accepted] of Object.entries(pins.accepted)) {
    assert.match(accepted.commit, /^[0-9a-f]{40}$/);
    assert.equal(accepted.tag, `kanban/${card}/${accepted.commit.slice(0, 12)}`);
  }
  assert.equal(pins.dependencies.length, 9);
  for (const entry of pins.dependencies) {
    assert.ok(pins.accepted[entry.card], entry.path);
    assert.ok(entry.path.startsWith(`capability\\${entry.card}\\`), entry.path);
    for (const key of ['rawSha256', 'crlfToLfSha256', 'acceptedGitSha256']) assert.match(entry[key], hex, `${entry.path} ${key}`);
  }
  assert.ok(pins.dependencies.some((entry) => entry.path.endsWith(`${pins.acceptedDecoderBundle}\\bundle.json`)));
  assert.ok(pins.dependencies.some((entry) => entry.path.endsWith(`${pins.acceptedDecoderBundle}\\bundle.js`)));
  assert.deepEqual(pins.own.map((entry) => entry.path), ['capability\\C031\\saved.js']);
  assert.ok(Object.isFrozen(pins) && Object.isFrozen(pins.dependencies[0]));
  assert.ok(pins.dependencies.every((entry) => !entry.path.includes('C029') && !entry.path.includes('publish')));
});

test('every pinned dependency reads back byte-identical to its raw or LF pin', () => {
  for (const entry of source.pins.dependencies) {
    const bytes = source.readPinned(entry.path);
    assert.ok([entry.rawSha256, entry.crlfToLfSha256].includes(source.hash(bytes)), entry.path);
    assert.equal(source.hash(source.normalize(bytes)), entry.crlfToLfSha256, entry.path);
  }
});

test('the accepted Git blobs of the exact accepted commits equal the pinned bytes', () => {
  const result = source.checkImports();
  assert.equal(result.length, source.pins.dependencies.length);
  result.forEach((row, index) => {
    const pin = source.pins.dependencies[index];
    assert.equal(row.path, pin.path);
    assert.equal(row.acceptedGitSha256, pin.acceptedGitSha256);
    assert.equal(row.crlfToLfSha256, pin.crlfToLfSha256);
    assert.equal(typeof row.rawEqualsGit, 'boolean');
  });
  assert.ok(Object.isFrozen(result));
  assert.throws(() => source.checkImports(1), { code: 'NO_SOURCE_OVERRIDES' });
});

test('a pin read refuses an unknown path, a non-file, an oversize file and altered bytes', (t) => {
  assert.throws(() => source.readPinned('capability\\C034\\README.md'), { code: 'CLOSED_SOURCE_PIN' });
  assert.throws(() => source.readPinned('..\\..\\etc\\passwd'), { code: 'CLOSED_SOURCE_PIN' });
  t.mock.method(fs, 'lstatSync', () => ({ isFile: () => false, size: 1 }), { times: 1 });
  assert.throws(() => source.readPinned(contractPath), { code: 'SOURCE_FILE' });
  t.mock.method(fs, 'lstatSync', () => ({ isFile: () => true, size: 262145 }), { times: 1 });
  assert.throws(() => source.readPinned(contractPath), { code: 'SOURCE_FILE' });
  t.mock.method(fs, 'readFileSync', () => Buffer.from('tampered'), { times: 1 });
  assert.throws(() => source.readPinned(contractPath), { code: 'SOURCE_PIN_MISMATCH' });
});

test('a pin read accepts the LF form of a CRLF working file but not a half-converted one', (t) => {
  const real = source.readPinned(contractPath);
  const lf = source.normalize(real);
  t.mock.method(fs, 'readFileSync', () => lf, { times: 1 });
  assert.equal(source.hash(source.readPinned(contractPath)), source.pins.dependencies.find((entry) => entry.path === contractPath).crlfToLfSha256);
  const mixed = Buffer.from(lf.toString('utf8').replace('\n', '\r\n'));
  t.mock.method(fs, 'readFileSync', () => mixed, { times: 1 });
  assert.throws(() => source.readPinned(contractPath), { code: 'SOURCE_PIN_MISMATCH' });
});

test('the accepted-blob check fails closed on a malformed, truncated, altered or over-long git reply', (t) => {
  const reply = (output) => t.mock.method(childProcess, 'execFileSync', () => output, { times: 1 });
  reply(Buffer.from('not a header\n'));
  assert.throws(() => source.checkImports(), { code: 'ACCEPTED_GIT_BLOB' });
  reply(Buffer.from('no newline at all'));
  assert.throws(() => source.checkImports(), { code: 'ACCEPTED_GIT_BLOB' });
  reply(Buffer.from(`${'a'.repeat(40)} blob 3\nxyz\n`));
  assert.throws(() => source.checkImports(), { code: 'ACCEPTED_GIT_PIN' });
  reply(Buffer.from(`${'a'.repeat(40)} blob 10\nxyz\n`));
  assert.throws(() => source.checkImports(), { code: 'ACCEPTED_GIT_PIN' });
  const original = childProcess.execFileSync;
  t.mock.method(childProcess, 'execFileSync', (...args) => Buffer.concat([original(...args), Buffer.from('x')]), { times: 1 });
  assert.throws(() => source.checkImports(), { code: 'ACCEPTED_GIT_BLOB' });
});

test('the saved C034 bundle is read only from its pinned bytes and is deeply frozen', () => {
  const bundle = source.readC034Bundle();
  assert.deepEqual([bundle.bundleVersion, bundle.cardId, bundle.traces.map((trace) => trace.id)], [1, 'C034', ['closed-history', 'held-snapshot']]);
  assert.ok(Object.isFrozen(bundle) && Object.isFrozen(bundle.traces[0].snapshot.events[0]));
  assert.throws(() => source.readC034Bundle(1), { code: 'NO_SOURCE_OVERRIDES' });
});

test('the own saved bundle is pinned and the catalog is only built from verified bytes', (t) => {
  assert.equal(source.checkOwnBundle(), true);
  assert.throws(() => source.checkOwnBundle(1), { code: 'NO_SOURCE_OVERRIDES' });
  assert.equal(source.catalog().ids.length, 8);
  assert.throws(() => source.catalog(1), { code: 'NO_SOURCE_OVERRIDES' });
  t.mock.method(fs, 'readFileSync', () => Buffer.from('changed'), { times: 1 });
  assert.throws(() => source.catalog(), { code: 'SOURCE_PIN_MISMATCH' });
});

test('the evaluator version table equals the unchanged accepted C020 stamps', () => {
  source.readPinned(contractPath);
  const contract = require('..\\..\\C020\\contract.js');
  assert.equal(contract.apiContract, evaluator.versions.apiContract);
  for (const [label, key] of [['v1', 'old'], ['v2', 'new']]) {
    assert.equal(contract.stamps[label].implementation, label);
    assert.equal(contract.stamps[label].implementationVersion, evaluator.versions[key].implementationVersion);
    assert.equal(contract.stamps[label].deploymentStamp, evaluator.versions[key].deploymentStamp);
  }
});

test('the unchanged C034 decoder accepts both saved traces and agrees with each adapted class', () => {
  for (const entry of source.pins.dependencies.filter((pin) => pin.card !== 'C031')) source.readPinned(entry.path);
  const decoder = require('..\\..\\C034\\trace.js');
  const catalog = source.catalog();
  const bundle = source.readC034Bundle();
  const expected = { 'observed-local-segment': 'ACTUAL_TRANSITION', 'original-budget-exceeded': 'ACTUAL_TRANSITION',
    failed: 'FAILED_OR_UNKNOWN', unknown: 'FAILED_OR_UNKNOWN', 'partial-unknown': 'NOT_TRANSITIONED_YET' };
  for (const id of ['closed-history', 'held-snapshot']) {
    const inspected = decoder.inspectSaved(id);
    assert.equal(inspected.valid, true, id);
    assert.equal(decoder.canonical(decoder.getSavedTrace(id)), decoder.canonical(bundle.traces.find((trace) => trace.id === id)));
    const report = catalog.evaluateSaved(`c034-${id}`);
    for (const attempt of inspected.attempts) {
      const row = report.clients.find((client) => client.clientId === attempt.attemptId);
      assert.equal(row.classification, expected[attempt.classification], `${id} ${attempt.attemptId}`);
    }
    assert.equal(report.clients.length, inspected.attempts.length + (id === 'closed-history' ? 1 : 0));
  }
});
