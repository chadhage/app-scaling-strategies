'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const lesson = require('..\\model.js');

const compare = scenarioId => lesson.run(lesson.createState(), { scenarioId, actionId: 'compare' }).history[0];

test('internal warm-up success leaves external proof unknown and ineligible', () => {
  const record = lesson.run(lesson.createState(), { scenarioId: 'approved', actionId: 'warm-up' }).history[0];
  assert.equal(record.internal.status, 'success');
  assert.equal(record.assessment.status, 'unknown');
  assert.equal(record.assessment.eligible, false);
});

test('an external redirect loop fails despite successful internal warm-up', () => {
  const record = compare('redirect-loop');
  assert.equal(record.internal.status, 'success');
  assert.equal(record.assessment.status, 'failure');
  assert.equal(record.assessment.eligible, false);
});

test('an external callback losing state fails despite successful internal warm-up', () => {
  const record = compare('callback-state-lost');
  assert.equal(record.internal.status, 'success');
  assert.equal(record.assessment.status, 'failure');
  assert.equal(record.assessment.eligible, false);
});

test('an unobserved external path remains unknown, not internal-success proof', () => {
  assert.equal(compare('external-unobserved').assessment.status, 'unknown');
  assert.equal(compare('external-unobserved').assessment.eligible, false);
});

test('the approved synthetic path has a positive result', () => {
  assert.equal(compare('approved').assessment.status, 'success');
  assert.equal(compare('approved').assessment.eligible, true);
});

test('approved host, one non-looping redirect, callback state, authentication and routing are inspected', () => {
  const record = compare('approved');
  assert.equal(record.checks.length, 6);
  assert.ok(record.checks.every(item => item.status === 'success'));
  assert.match(record.checks.find(item => item.name === 'host').observed, /production-host-label/);
  assert.equal(record.checks.find(item => item.name === 'redirect').observed, '1 approved hop; no loop');
  assert.equal(record.checks.find(item => item.name === 'callback').observed, 'Expected lesson-state-A; observed lesson-state-A');
  assert.match(record.checks.find(item => item.name === 'routing').observed, /observed candidate-label/);
  assert.equal(record.externalMs, 180);
  assert.equal(lesson.JOURNEY_BUDGET_MS, 250);
  assert.match(record.assessment.reason, /Only this synthetic external path/);
});

for (const [scenarioId, name] of [
  ['host-mismatch', 'host'], ['redirect-loop', 'redirect'], ['callback-state-lost', 'callback'],
  ['authentication-fails', 'authentication'], ['routing-mismatch', 'routing']
]) {
  test(`${scenarioId}: internal HTTP 200 does not conceal the failed ${name} check`, () => {
    const record = compare(scenarioId);
    assert.equal(record.internal.statusCode, 200);
    assert.equal(record.internal.durationMs, 32);
    assert.equal(record.assessment.status, 'failure');
    assert.equal(record.assessment.eligible, false);
    assert.equal(record.checks.find(item => item.name === name).status, 'failure');
    assert.match(record.assessment.reason, /external failures were detected/);
    if (scenarioId === 'callback-state-lost' || scenarioId === 'routing-mismatch') {
      assert.equal(record.checks.find(item => item.name === 'journey').status, 'success');
    }
  });
}

test('missing external/callback observations stay null and unknown even when other checks succeed', () => {
  const absent = compare('external-unobserved');
  assert.equal(absent.externalMs, null);
  assert.ok(absent.checks.every(item => item.status === 'unknown' && item.durationMs === null));
  const partial = compare('callback-unobserved');
  const callback = partial.checks.find(item => item.name === 'callback');
  assert.equal(callback.durationMs, null);
  assert.equal(callback.status, 'unknown');
  assert.equal(partial.externalMs, 180);
  assert.equal(partial.checks.filter(item => item.status === 'success').length, 5);
  assert.equal(partial.assessment.status, 'unknown');
  assert.equal(partial.assessment.eligible, false);
});

test('results are deterministic, immutable and retained across later success and reset', () => {
  const initial = lesson.createState();
  const failed = lesson.run(initial, { scenarioId: 'redirect-loop', actionId: 'compare' });
  const good = lesson.run(failed, { scenarioId: 'approved', actionId: 'compare' });
  const unknown = lesson.run(good, { scenarioId: 'callback-unobserved', actionId: 'compare' });
  const reset = lesson.reset(unknown);
  assert.deepEqual(lesson.summary(reset), { total: 3, success: 1, failure: 1, unknown: 1, remaining: 9 });
  assert.deepEqual(reset.history, unknown.history);
  assert.equal(lesson.current(reset), null);
  assert.equal(lesson.current(unknown).assessment.status, 'unknown');
  assert.equal(initial.history.length, 0);
  assert.equal(failed.history.length, 1);
  assert.throws(() => { unknown.history[0].assessment.eligible = true; }, TypeError);
  assert.deepEqual(failed, lesson.run(initial, { scenarioId: 'redirect-loop', actionId: 'compare' }));
  assert.equal(lesson.validateState(JSON.parse(JSON.stringify(unknown))), true);
  assert.equal(lesson.validateState(reset), true);
});

test('exact typed input rejects coercion, unknown labels, extra fields and accessors without mutation', () => {
  const state = lesson.createState();
  for (const input of [
    null, [], true, 1, 'approved', {},
    { scenarioId: 'approved' }, { actionId: 'compare' },
    { scenarioId: 'approved', actionId: 'compare', host: 'injected-host' },
    { scenarioId: 0, actionId: 'compare' }, { scenarioId: ['approved'], actionId: 'compare' },
    { scenarioId: new String('approved'), actionId: 'compare' },
    { scenarioId: ' approved ', actionId: 'compare' }, { scenarioId: 'forged-host', actionId: 'compare' },
    { scenarioId: 'approved', actionId: 1 }, { scenarioId: 'approved', actionId: 'sign-in' },
    Object.assign(Object.create(null), { scenarioId: 'approved', actionId: 'compare' }),
    { scenarioId: 'approved', actionId: 'compare', [Symbol('extra')]: true }
  ]) {
    assert.throws(() => lesson.run(state, input), { name: 'TypeError', message: /Invalid input/ });
    assert.deepEqual(state, lesson.createState());
  }
  let getterCalls = 0;
  const getterInput = { get scenarioId() { getterCalls += 1; return 'approved'; }, actionId: 'compare' };
  assert.throws(() => lesson.run(state, getterInput), TypeError);
  assert.equal(getterCalls, 0);
});

test('replayed state rejects forged eligibility, measurements, counters, chronology and incomplete trace', () => {
  const state = lesson.run(lesson.createState(), { scenarioId: 'redirect-loop', actionId: 'compare' });
  const mutations = [
    value => { value.schemaVersion = '1'; },
    value => { value.current = '1'; },
    value => { value.current = 0; },
    value => { value.current = NaN; },
    value => { value.current = 2; },
    value => { value.counter = 1; },
    value => { value.history[0].sequence = 2; },
    value => { value.history[0].actionId = 'external-call'; },
    value => { value.history[0].scenarioId = 'forged-host'; },
    value => { value.history[0].assessment.status = 'success'; },
    value => { value.history[0].assessment.eligible = true; },
    value => { value.history[0].assessment.reason = 'Approved'; },
    value => { value.history[0].externalMs = 0; },
    value => { value.history[0].internal.statusCode = 201; },
    value => { value.history[0].checks[1].status = 'success'; },
    value => { value.history[0].checks[1].durationMs = Infinity; },
    value => { value.history[0].checks[1].observed = 'No loop'; },
    value => { value.history[0].checks.pop(); },
    value => { value.history[0].checks[0].extra = true; },
    value => { value.history.push(value.history[0]); }
  ];
  for (const mutate of mutations) {
    const forged = JSON.parse(JSON.stringify(state));
    mutate(forged);
    for (const operation of [
      () => lesson.validateState(forged), () => lesson.current(forged), () => lesson.summary(forged),
      () => lesson.reset(forged), () => lesson.run(forged, { scenarioId: 'approved', actionId: 'compare' })
    ]) assert.throws(operation, { name: 'TypeError', message: /Invalid state/ });
  }
  assert.equal(state.history[0].assessment.status, 'failure');
});

test('dense exact arrays reject holes, extra symbols, hidden properties and getters before reading', () => {
  const valid = lesson.run(lesson.createState(), { scenarioId: 'approved', actionId: 'compare' });
  const clone = () => JSON.parse(JSON.stringify(valid));
  const hole = clone();
  delete hole.history[0];
  assert.throws(() => lesson.validateState(hole), TypeError);
  const extra = clone();
  extra.history.extra = true;
  assert.throws(() => lesson.validateState(extra), TypeError);
  const symbol = clone();
  symbol.history[Symbol('extra')] = true;
  assert.throws(() => lesson.validateState(symbol), TypeError);
  const hidden = clone();
  Object.defineProperty(hidden.history[0].assessment, 'eligible', { value: true, enumerable: false });
  assert.throws(() => lesson.validateState(hidden), TypeError);
  let getterCalls = 0;
  const getter = clone();
  Object.defineProperty(getter.history, '0', { get() { getterCalls += 1; return valid.history[0]; }, enumerable: true });
  assert.throws(() => lesson.validateState(getter), TypeError);
  assert.equal(getterCalls, 0);
  const rootGetter = { schemaVersion: 1, current: null, get history() { getterCalls += 1; return []; } };
  assert.throws(() => lesson.validateState(rootGetter), TypeError);
  assert.equal(getterCalls, 0);
});

test('the fixed 12-record bound cannot be reset into new allowance or erase failures', () => {
  let state = lesson.createState();
  for (let index = 0; index < lesson.MAX_RUNS; index += 1) {
    state = lesson.run(state, { scenarioId: index === 0 ? 'redirect-loop' : 'approved', actionId: 'compare' });
  }
  const before = JSON.stringify(state);
  assert.throws(() => lesson.run(state, { scenarioId: 'approved', actionId: 'compare' }), { name: 'RangeError', message: /Session limit/ });
  assert.equal(JSON.stringify(state), before);
  const reset = lesson.reset(state);
  assert.equal(reset.history.length, 12);
  assert.equal(lesson.summary(reset).failure, 1);
  assert.equal(lesson.summary(reset).remaining, 0);
  assert.throws(() => lesson.run(reset, { scenarioId: 'approved', actionId: 'warm-up' }), RangeError);
  const forged = JSON.parse(before);
  forged.history.push(forged.history[0]);
  assert.throws(() => lesson.validateState(forged), TypeError);
});
