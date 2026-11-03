'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const lesson = require('..\\model.js');

test('S106 model is loadable before the behavioral assertion', () => {
  assert.equal(typeof lesson.evaluate, 'function');
});

test('public success cannot certify an unobserved actual private path', () => {
  const result = lesson.evaluate({ condition: 'dns-public-answer', action: 'public-only' });
  assert.equal(result.publicProbe.status, 'success');
  assert.equal(result.privateProbe.status, 'unknown');
  assert.equal(result.privateProbe.latencyMs, null);
  assert.equal(result.eligible, false);
});

test('public-only and internal-only scopes never infer private success from any condition', () => {
  for (const condition of lesson.conditions) {
    for (const action of ['public-only', 'public-internal']) {
      const result = lesson.evaluate({ condition: condition.id, action });
      assert.equal(result.publicProbe.status, 'success');
      assert.equal(result.publicProbe.httpStatus, 200);
      assert.equal(result.publicProbe.latencyMs, 24);
      assert.equal(result.internalProbe.status, action === 'public-only' ? 'unknown' : 'success');
      assert.equal(result.privateProbe.status, 'unknown');
      assert.equal(result.privateProbe.latencyMs, null);
      assert.equal(result.privateProbe.observations, null);
      assert.ok(result.privateProbe.checks.every(check => check.status === 'unknown'));
      assert.equal(result.eligible, false);
      assert.equal(result.nativePrivatePath, 'unverified');
    }
  }
});

const cases = [
  ['private-ready', 'success', null],
  ['dns-public-answer', 'failure', 'dns'],
  ['connection-denied', 'failure', 'connectivity'],
  ['authorization-denied', 'failure', 'authorization'],
  ['wrong-client', 'unknown', 'placement'],
  ['wrong-dependency', 'failure', 'dependency'],
  ['private-unobserved', 'unknown', null],
  ['dns-unobserved', 'unknown', null],
  ['management-exposed', 'failure', 'management'],
  ['dependency-slow', 'failure', 'dependency']
];

for (const [condition, outcome, failingCheck] of cases) {
  test(`${condition}: measured private ${outcome} stays distinct from public/internal success`, () => {
    const result = lesson.evaluate({ condition, action: 'compare-private' });
    assert.equal(result.publicProbe.status, 'success');
    assert.equal(result.internalProbe.status, 'success');
    assert.equal(result.internalProbe.latencyMs, 18);
    assert.equal(result.privateProbe.status, outcome);
    assert.equal(result.eligible, outcome === 'success');
    assert.equal(result.nativePrivatePath, 'unverified');
    assert.equal(result.privateProbe.checks.length, 6);
    if (failingCheck) assert.equal(result.privateProbe.checks.find(check => check.id === failingCheck).status, 'failure');
  });
}

test('positive private comparison requires client, DNS, connectivity, access, dependency and unexposed management', () => {
  const result = lesson.evaluate({ condition: 'private-ready', action: 'compare-private' });
  assert.ok(result.privateProbe.checks.every(check => check.status === 'success'));
  assert.equal(result.privateProbe.observations.client, lesson.REQUIRED_CLIENT);
  assert.equal(result.privateProbe.observations.dnsAnswer, lesson.REQUIRED_DNS);
  assert.equal(result.privateProbe.observations.dependency, lesson.REQUIRED_DEPENDENCY);
  assert.equal(result.privateProbe.observations.managementExposed, false);
  assert.equal(result.privateProbe.latencyMs, 84);
  assert.match(result.conclusion, /fixed teaching trace only.*unverified/);
});

test('a wrong-client success leaves the actual private path unknown, not diagnosed as failed', () => {
  const result = lesson.evaluate({ condition: 'wrong-client', action: 'compare-private' });
  assert.equal(result.privateProbe.observations.httpStatus, 200);
  assert.equal(result.privateProbe.observations.latencyMs, 84);
  assert.equal(result.privateProbe.observations.client, 'external-probe-segment');
  assert.equal(result.privateProbe.status, 'unknown');
  assert.equal(result.privateProbe.latencyMs, null);
  assert.equal(result.privateProbe.checks[0].status, 'failure');
  assert.ok(result.privateProbe.checks.slice(1).every(check => check.status === 'unknown'));
  assert.match(result.conclusion, /actual private path remains unknown/);
});

test('known connection failure dominates missing authorization/completion without inventing durations', () => {
  const result = lesson.evaluate({ condition: 'connection-denied', action: 'compare-private' });
  assert.equal(result.privateProbe.status, 'failure');
  assert.equal(result.privateProbe.latencyMs, null);
  assert.equal(result.privateProbe.checks.find(check => check.id === 'authorization').status, 'unknown');
  assert.equal(result.privateProbe.checks.find(check => check.id === 'dependency').status, 'unknown');
});

test('unobserved DNS remains unknown despite other successful private observations', () => {
  const result = lesson.evaluate({ condition: 'dns-unobserved', action: 'compare-private' });
  assert.equal(result.privateProbe.status, 'unknown');
  assert.equal(result.privateProbe.checks.find(check => check.id === 'dns').status, 'unknown');
  assert.equal(result.privateProbe.checks.find(check => check.id === 'dependency').status, 'success');
  assert.equal(result.eligible, false);
});

test('management exposure is a failed admission gate even when the dependency journey succeeds', () => {
  const result = lesson.evaluate({ condition: 'management-exposed', action: 'compare-private' });
  assert.equal(result.privateProbe.checks.find(check => check.id === 'dependency').status, 'success');
  assert.equal(result.privateProbe.checks.find(check => check.id === 'connectivity').status, 'success');
  assert.equal(result.privateProbe.checks.find(check => check.id === 'management').status, 'failure');
  assert.equal(result.eligible, false);
});

test('a slow HTTP 200 is not a successful private journey within the declared budget', () => {
  const result = lesson.evaluate({ condition: 'dependency-slow', action: 'compare-private' });
  assert.equal(result.privateProbe.observations.httpStatus, 200);
  assert.equal(result.privateProbe.latencyMs, 220);
  assert.equal(lesson.BUDGET_MS, 150);
  assert.equal(result.privateProbe.status, 'failure');
});

test('every invalid input is rejected without coercion, invoking accessors or mutation', () => {
  let accessorCalls = 0;
  const accessor = Object.defineProperty({ action: 'compare-private' }, 'condition', {
    enumerable: true, get() { accessorCalls += 1; return 'private-ready'; }
  });
  const hidden = Object.defineProperty({ action: 'compare-private' }, 'condition', { value: 'private-ready' });
  const symbol = { condition: 'private-ready', action: 'compare-private', [Symbol('extra')]: true };
  const inputs = [
    undefined, null, true, 1, 'private-ready', [], new String('private-ready'),
    {}, { condition: 'private-ready' }, { action: 'compare-private' },
    { condition: 'private-ready', action: 'compare-private', extra: false },
    { condition: 'private-ready ', action: 'compare-private' },
    { condition: 'PRIVATE-READY', action: 'compare-private' },
    { condition: 'private-ready', action: 'compare-private ' },
    { condition: 0, action: 'compare-private' }, { condition: 'private-ready', action: true },
    { condition: new String('private-ready'), action: 'compare-private' },
    Object.assign(Object.create(null), { condition: 'private-ready', action: 'compare-private' }),
    Object.assign(Object.create({ inherited: true }), { condition: 'private-ready', action: 'compare-private' }),
    accessor, hidden, symbol
  ];
  const state = lesson.initialState();
  const before = structuredClone(state);
  for (const input of inputs) {
    assert.throws(() => lesson.evaluate(input), TypeError);
    assert.throws(() => lesson.record(state, input), TypeError);
    assert.deepEqual(state, before);
  }
  assert.equal(accessorCalls, 0);
});

test('forged historical values, eligibility, sequence, schemas, accessors and array shapes are rejected', () => {
  const state = lesson.record(lesson.initialState(), { condition: 'dns-public-answer', action: 'compare-private' });
  const mutations = [
    value => { value.schemaVersion = '1'; },
    value => { value.extra = false; },
    value => { value.history[0].sequence = '1'; },
    value => { value.history[0].sequence = 0; },
    value => { value.history[0].result.eligible = true; },
    value => { value.history[0].result.privateProbe.status = 'success'; },
    value => { value.history[0].result.privateProbe.latencyMs = 0; },
    value => { value.history[0].result.publicProbe.latencyMs = 999; },
    value => { value.history[0].result.privateProbe.checks[1].status = 'success'; },
    value => { value.history[0].result.privateProbe.observations.dnsAnswer = lesson.REQUIRED_DNS; },
    value => { value.history[0].result.nativePrivatePath = 'verified'; },
    value => { value.history[0].input.action = 'public-only'; },
    value => { value.history[0].input.extra = 'forged'; },
    value => { value.history.extra = true; },
    value => { value.history[Symbol('extra')] = true; },
    value => { Object.defineProperty(value.history, 'hidden', { value: true }); },
    value => { delete value.history[0]; },
    value => { value.history.push(value.history[0]); },
    value => { value.history = new Array(1000000); },
    value => { Object.setPrototypeOf(value.history, null); },
    value => { Object.setPrototypeOf(value.history[0].result, null); },
    value => { value.current = {}; },
    value => { value.current = { ...value.current, sequence: 2 }; }
  ];
  for (const mutate of mutations) {
    const forged = structuredClone(state);
    mutate(forged);
    assert.throws(() => lesson.record(forged, { condition: 'private-ready', action: 'compare-private' }), TypeError);
    assert.throws(() => lesson.reset(forged), TypeError);
    assert.throws(() => lesson.summarize(forged), TypeError);
  }
  let getterCalls = 0;
  const forged = structuredClone(state);
  Object.defineProperty(forged.history[0].result, 'eligible', {
    enumerable: true, get() { getterCalls += 1; return false; }
  });
  assert.throws(() => lesson.reset(forged), TypeError);
  assert.equal(getterCalls, 0);
  assert.equal(state.history[0].result.privateProbe.status, 'failure');
  assert.equal(state.history[0].result.eligible, false);
});

test('empty samples are no evidence and reset retains failed/unknown/successful history and counts', () => {
  const empty = lesson.initialState();
  assert.deepEqual(lesson.summarize(empty), {
    attempts: 0, publicSuccesses: 0, internalSuccesses: 0,
    privateSuccesses: 0, privateFailures: 0, privateUnknowns: 0
  });
  let state = empty;
  for (const condition of ['dns-public-answer', 'wrong-client', 'private-ready']) {
    state = lesson.record(state, { condition, action: 'compare-private' });
  }
  const reset = lesson.reset(state);
  assert.equal(reset.current, null);
  assert.deepEqual(reset.history, state.history);
  assert.deepEqual(lesson.summarize(reset), {
    attempts: 3, publicSuccesses: 3, internalSuccesses: 3,
    privateSuccesses: 1, privateFailures: 1, privateUnknowns: 1
  });
  assert.equal(empty.history.length, 0);
  const next = lesson.record(reset, { condition: 'private-ready', action: 'public-only' });
  assert.equal(next.history[3].sequence, 4);
  assert.equal(next.history[0].result.privateProbe.status, 'failure');
  assert.equal(lesson.summarize(next).privateUnknowns, 2);
});

test('12-record bound survives reset and rejected submissions leave the state intact', () => {
  let state = lesson.initialState();
  for (let index = 0; index < lesson.MAX_RUNS; index += 1) {
    state = lesson.record(state, { condition: 'private-ready', action: 'public-only' });
  }
  const before = structuredClone(state);
  assert.throws(() => lesson.record(state, { condition: 'private-ready', action: 'compare-private' }), RangeError);
  assert.deepEqual(state, before);
  const reset = lesson.reset(state);
  assert.equal(reset.current, null);
  assert.equal(reset.history.length, 12);
  assert.throws(() => lesson.record(reset, { condition: 'private-ready', action: 'compare-private' }), RangeError);
});

test('fixed data, inputs, state and results are immutable and deterministic', () => {
  const input = { condition: 'private-ready', action: 'compare-private' };
  const before = structuredClone(input);
  const first = lesson.evaluate(input);
  assert.deepEqual(first, lesson.evaluate(input));
  assert.deepEqual(input, before);
  assert.ok(Object.isFrozen(lesson));
  assert.ok(Object.isFrozen(lesson.conditions));
  assert.ok(Object.isFrozen(lesson.conditions[0].trace));
  assert.ok(Object.isFrozen(first.privateProbe.checks[0]));
  assert.throws(() => { lesson.conditions[0].trace.connected = false; }, TypeError);
  assert.throws(() => { first.eligible = false; }, TypeError);
  const state = lesson.record(lesson.initialState(), input);
  assert.ok(Object.isFrozen(state.history[0].input));
  assert.throws(() => { state.history.push({}); }, TypeError);
});
