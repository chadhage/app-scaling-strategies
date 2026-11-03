'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const lesson = require('./model.js');
const fs = require('node:fs');
const path = require('node:path');
const good = { inventoryId: 'supported', certificateId: 'both-hosts', hostnameId: 'app' };
const act = (state, type, selected = good) => lesson.step(state, { type, selection: selected });

test('a compatible certificate and hostname pass every eligible destination/client check', () => {
  const measured = lesson.evaluate({
    inventoryId: 'supported',
    certificateId: 'both-hosts',
    hostnameId: 'app',
  });
  assert.equal(measured.verdict, 'pass');
  assert.deepEqual(measured.totals, { pass: 4, fail: 0, unknown: 0, total: 4 });
});

test('both required hostnames and both eligible destinations are measured, not parked', () => {
  for (const hostnameId of ['app', 'api']) {
    const result = lesson.evaluate({ ...good, hostnameId });
    assert.equal(result.verdict, 'pass');
    assert.deepEqual(result.measurements.map((row) => `${row.destinationId}/${row.clientId}`), ['old/browser', 'old/service', 'candidate/browser', 'candidate/service']);
    assert.deepEqual(result.excluded, ['parked']);
    assert.ok(result.measurements.every((row) => row.eligible === true));
  }
});

for (const [name, selected, expected] of [
  ['wrong hostname', { certificateId: 'wrong-host' }, { pass: 2, fail: 2, unknown: 0, total: 4 }],
  ['app-only certificate on API hostname', { certificateId: 'app-only', hostnameId: 'api' }, { pass: 2, fail: 2, unknown: 0, total: 4 }],
  ['untrusted certificate', { certificateId: 'untrusted' }, { pass: 2, fail: 2, unknown: 0, total: 4 }],
  ['expired certificate', { certificateId: 'expired' }, { pass: 2, fail: 2, unknown: 0, total: 4 }],
  ['incompatible TLS', { inventoryId: 'incompatible' }, { pass: 3, fail: 1, unknown: 0, total: 4 }],
  ['unknown service trust', { certificateId: 'trust-unknown' }, { pass: 3, fail: 0, unknown: 1, total: 4 }],
  ['unobserved service TLS', { inventoryId: 'unobserved' }, { pass: 3, fail: 0, unknown: 1, total: 4 }],
]) {
  test(`${name} gates an eligible candidate without hiding client outcomes`, () => {
    const config = { ...good, ...selected };
    const measured = lesson.evaluate(config);
    assert.deepEqual(measured.totals, expected);
    assert.equal(measured.verdict, expected.fail ? 'fail' : 'unknown');
    const state = act(act(lesson.createState(), 'probe', config), 'admit', config);
    assert.deepEqual(state.admitted, ['old']);
    assert.equal(state.history[0].decision.allowed, false);
    assert.equal(state.history[0].decision.verifier, 'pass');
    assert.equal(state.history[0].decision.userOutcome, measured.verdict);
    assert.ok(measured.measurements.filter((row) => row.destinationId === 'old').every((row) => row.outcome === 'pass'));
  });
}

test('fail takes precedence over unknown without inflating success', () => {
  const result = lesson.evaluate({ ...good, inventoryId: 'incompatible', certificateId: 'trust-unknown' });
  assert.equal(result.verdict, 'fail');
  assert.equal(result.measurements[3].trust, 'unknown');
  assert.equal(result.measurements[3].tls, 'fail');
  assert.deepEqual(result.totals, { pass: 3, fail: 1, unknown: 0, total: 4 });
});

test('admission requires current complete evidence and cannot repeat', () => {
  const initial = lesson.createState();
  assert.throws(() => act(initial, 'admit'), /Rehearse checks/);
  const measured = act(initial, 'probe');
  assert.deepEqual(measured.admitted, ['old']);
  assert.throws(() => act(measured, 'admit', { ...good, certificateId: 'untrusted' }), /Selection changed/);
  const admitted = act(measured, 'admit');
  assert.deepEqual(admitted.admitted, ['old', 'candidate']);
  assert.throws(() => act(admitted, 'admit'), /already has a decision/);
  assert.equal(initial.history.length, 0);
  assert.equal(measured.history[0].decision, null);
});

test('new rehearsal revokes previous approval while retaining immutable evidence', () => {
  const admitted = act(act(lesson.createState(), 'probe'), 'admit');
  const bad = { ...good, certificateId: 'wrong-host' };
  const next = act(admitted, 'probe', bad);
  assert.deepEqual(next.admitted, ['old']);
  assert.equal(next.history.length, 2);
  assert.equal(next.history[0].decision.result, 'admitted');
  assert.deepEqual(lesson.totals(next), { pass: 6, fail: 2, unknown: 0, total: 8 });
  assert.equal(admitted.history.length, 1);
});

test('reset preserves negative/unknown history and does not restore the bounded allowance', () => {
  let state = lesson.createState();
  for (const certificateId of ['wrong-host', 'trust-unknown', 'both-hosts', 'both-hosts', 'both-hosts', 'both-hosts']) {
    state = act(state, 'probe', { ...good, certificateId });
  }
  const previous = lesson.totals(state);
  const reset = lesson.reset(state);
  assert.deepEqual(reset.admitted, ['old']);
  assert.equal(reset.activeAttempt, null);
  assert.equal(reset.history, state.history);
  assert.deepEqual(lesson.totals(reset), previous);
  assert.equal(previous.total, 24);
  assert.equal(previous.fail, 2);
  assert.equal(previous.unknown, 1);
  assert.throws(() => act(reset, 'probe'), { code: 'ERR_LESSON_LIMIT' });
  assert.throws(() => act(reset, 'admit'), /Rehearse checks/);
});

for (const [name, invalid] of [
  ['null', null], ['array', []], ['string', 'supported'],
  ['missing field', { inventoryId: 'supported', certificateId: 'both-hosts' }],
  ['extra field', { ...good, eligible: true }],
  ['number selector', { ...good, hostnameId: 1 }],
  ['boolean selector', { ...good, inventoryId: true }],
  ['unknown certificate', { ...good, certificateId: 'installed-certificate' }],
  ['whitespace selector', { ...good, hostnameId: ' app' }],
  ['inherited record', Object.assign(Object.create(good), good)],
  ['null-prototype record', Object.assign(Object.create(null), good)],
  ['accessor selector', { ...good, get certificateId() { throw new Error('getter must not execute'); } }],
  ['symbol field', { ...good, [Symbol('extra')]: true }],
]) {
  test(`strict selection rejects ${name} without mutation`, () => {
    const state = lesson.createState();
    assert.throws(() => lesson.evaluate(invalid), { code: 'ERR_LESSON_INPUT' });
    assert.throws(() => act(state, 'probe', invalid), { code: 'ERR_LESSON_INPUT' });
    assert.equal(state.history.length, 0);
  });
}

test('strict action records reject wrong types, missing/extra fields and getters', () => {
  const state = lesson.createState();
  for (const action of [null, [], { type: 'probe' }, { type: true, selection: good }, { type: 'reset', selection: good }, { type: 'probe', selection: good, trust: 'pass' }, { get type() { throw new Error('do not execute'); }, selection: good }]) {
    assert.throws(() => lesson.step(state, action), { code: 'ERR_LESSON_INPUT' });
  }
  assert.equal(state.history.length, 0);
});

test('state guards reject fabricated, copied, serialized, and foreign states', () => {
  const state = act(lesson.createState(), 'probe');
  for (const invalid of [null, false, [], {}, { ...state }, JSON.parse(JSON.stringify(state)), { ...state, admitted: ['candidate'] }]) {
    assert.throws(() => act(invalid, 'admit'), { code: 'ERR_LESSON_STATE' });
    assert.throws(() => lesson.reset(invalid), { code: 'ERR_LESSON_STATE' });
    assert.throws(() => lesson.totals(invalid), { code: 'ERR_LESSON_STATE' });
  }
});

test('teaching data and issued results are deeply frozen and deterministic', () => {
  const measured = lesson.evaluate(good);
  assert.deepEqual(lesson.evaluate(good), measured);
  assert.ok(Object.isFrozen(lesson.INVENTORIES.supported[1].tls));
  assert.ok(Object.isFrozen(lesson.CERTIFICATES['both-hosts'].hostnames));
  assert.ok(Object.isFrozen(measured.measurements[0].reasons));
  assert.throws(() => { lesson.INVENTORIES.supported[1].eligible = false; }, TypeError);
  const state = act(lesson.createState(), 'probe');
  assert.throws(() => { state.history[0].observation.verdict = 'pass'; }, TypeError);
});

test('manifest and exact source rows preserve A/native acceptance boundaries', () => {
  const manifest = require('./manifest.json');
  const source = require('./evidence/source-contract.json');
  const repo = path.resolve(__dirname, '..', '..');
  const lines = (file) => fs.readFileSync(path.join(repo, ...file), 'utf8').split(/\r?\n/);
  assert.ok(lines(['README.md']).includes(`| S103 | ${source.readmeRequiredBehavior} |`));
  assert.ok(lines(['.docs', 'wiki', 'backlog.md']).includes(`| D-S103 | P1 | ${source.backlogWork} | ${source.backlogAcceptance} | P006 |`));
  assert.ok(lines(['.docs', 'wiki', 'kanban.md']).includes(`| A-S103 | D-S103 | S | ${source.cardObjective} | SOURCE |`));
  assert.ok(lines(['.docs', 'wiki', 'kanban.md']).includes(`| B-S103 | D-S103 | S | ${source.nativeObjective} | CORE, DATA, HOST, C092 |`));
  assert.equal(manifest.objective, source.cardObjective);
  assert.equal(manifest.packet, 'SC-S103');
  assert.equal(manifest.kanoUnit, 'A-S103');
  assert.equal(manifest.acceptance.acceptedAtUtc, null);
  assert.equal(require('./evidence/iac-decision.json').decision, 'N/A');
});

test('static lesson is local, restrictive, keyboard-native, and does not shadow form.reset', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'", "object-src 'none'"]) assert.ok(html.includes(directive));
  assert.equal((html.match(/<script src=/g) || []).length, 2);
  assert.doesNotMatch(html, /\bon[a-z]+\s*=|javascript:|unsafe-inline|unsafe-eval|\b(?:id|name)=["']reset["']/i);
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes('role="status"'));
  assert.ok(html.includes('<noscript>'));
});
