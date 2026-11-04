'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const lesson = require('.\\model.js');

test('positive trace counts all four started affected originals, not request throughput', () => {
  assert.equal(lesson.measureTrace('positive').originals.denominator, 4);
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const raises = (code, fn) => code === undefined ? assert.throws(fn, TypeError) : assert.throws(fn, { code });
function run(state, scenario) {
  for (const action of [{ type: 'conduct', scenario }, { type: 'inspect' }, { type: 'measure' }]) {
    state = lesson.applyAction(state, action);
  }
  return state;
}

for (const [scenario, verdict, successful, failed, unknown, unaffected, originalRequests] of [
  ['positive', 'PASS', 4, 0, 0, 988, 12],
  ['interrupted', 'FAIL', 3, 1, 0, 986, 12],
  ['unknown', 'UNKNOWN', 3, 0, 1, 987, 11],
]) {
  test(`${scenario}: exact original/transition denominators and steady request counts`, () => {
    const measured = lesson.measureTrace(scenario);
    assert.equal(measured.verdict, verdict);
    assert.equal(measured.originals.denominator, 4);
    assert.equal(measured.originals.successful, successful);
    assert.equal(measured.originals.failed, failed);
    assert.equal(measured.originals.unknown, unknown);
    assert.equal(successful + failed + unknown, measured.originals.denominator);
    assert.equal(measured.originals.continuityFraction, successful / 4);
    assert.equal(measured.transitions.denominator, 2);
    assert.equal(measured.transitions.successful, scenario === 'positive' ? 2 : 1);
    assert.equal(measured.transitions.failed, failed);
    assert.equal(measured.transitions.unknown, unknown);
    assert.equal(measured.transitions.successful + failed + unknown, 2);
    assert.deepEqual(measured.requests, {
      total: 1000, http200: 1000, unaffected, originalRequests,
      newAttemptRequests: scenario === 'positive' ? 0 : 2,
      durationMs: 4000, perSimulatedSecond: 250,
      windows: ['W1', 'W2', 'W3', 'W4'].map((windowId) => ({ windowId, offered: 250, recorded: 250 })),
    });
    assert.equal(measured.attempts.original, 4);
    assert.equal(measured.attempts.new, scenario === 'positive' ? 0 : 1);
    assert.equal(measured.attempts.newCompleted, scenario === 'positive' ? 0 : 1);
    assert.equal(measured.attempts.total, scenario === 'positive' ? 4 : 5);
    assert.equal(measured.correlationGroups, 2);
    assert.match(measured.reliability, /No reliability estimate or five-nines certification/);
  });
}

test('positive originals use original start, completion, intended version movement and inclusive budget', () => {
  const measured = lesson.measureTrace('positive');
  assert.deepEqual(measured.budgets, {
    originalJourneyMs: 1200, maxFailedOriginals: 0, maxUnknownOriginals: 0,
    requiredOriginalContinuityFraction: 1, maxFailedTransitions: 0, maxUnknownTransitions: 0,
    requiredTransitionContinuityFraction: 1,
  });
  for (const original of measured.perOriginal) {
    assert.equal(original.durationMs, 1000);
    assert.equal(original.deadlineMs, original.startedMs + 1200);
    assert.equal(original.terminalAtMs, original.startedMs + 1000);
    assert.equal(original.withinBudget, true);
    assert.equal(original.versionMoved, true);
    assert.equal(original.interrupted, false);
    assert.equal(original.outcome, 'successful');
    assert.deepEqual(original.reasons, []);
  }
});

test('interruption remains after original recovery/completion and a successful different attempt', () => {
  const trace = lesson.traceFor('interrupted');
  const measured = lesson.measureTrace('interrupted');
  const original = measured.perOriginal.find((item) => item.originalId === 'J2');
  assert.equal(original.attemptId, 'A-J2-original');
  assert.equal(original.terminal, 'completed');
  assert.equal(original.startedMs, 500);
  assert.equal(original.durationMs, 1400);
  assert.equal(original.deadlineMs, 1700);
  assert.equal(original.withinBudget, false);
  assert.equal(original.versionMoved, false);
  assert.equal(original.interrupted, true);
  assert.equal(original.outcome, 'failed');
  assert.match(original.reasons.join(' '), /Retained original interruption/);
  assert.deepEqual(trace.clientEvents.filter((event) => event.attemptId === original.attemptId)
    .map(({ type, atMs }) => ({ type, atMs })), [
    { type: 'interrupted', atMs: 1120 }, { type: 'recovered', atMs: 1800 }, { type: 'completed', atMs: 1900 },
  ]);
  const newAttempt = trace.attempts.find((attempt) => attempt.kind === 'new');
  assert.equal(newAttempt.originalId, original.originalId);
  assert.notEqual(newAttempt.id, original.attemptId);
  assert.equal(newAttempt.startedMs, 2100);
  assert.equal(measured.originals.interrupted, 1);
  assert.equal(measured.originals.completedTerminal, 4);
  assert.equal(measured.originals.successful, 3);
});

test('unknown started original and affected transition remain counted after new-attempt success', () => {
  const measured = lesson.measureTrace('unknown');
  const original = measured.perOriginal.find((item) => item.originalId === 'J4');
  assert.equal(original.terminal, null);
  assert.equal(original.terminalAtMs, null);
  assert.equal(original.durationMs, null);
  assert.equal(original.startedMs, 2500);
  assert.equal(original.deadlineMs, 3700);
  assert.equal(original.openAgeMs, 1500);
  assert.equal(original.withinBudget, false);
  assert.equal(original.versionMoved, false);
  assert.equal(original.outcome, 'unknown');
  assert.equal(measured.originals.denominator, 4);
  assert.equal(measured.transitions.denominator, 2);
  assert.equal(measured.perTransition.find((item) => item.transitionId === 'T2').outcome, 'unknown');
  assert.equal(measured.attempts.newCompleted, 1);
  assert.match(original.reasons.join(' '), /started original remains counted/);
});

test('routing 100%, all HTTP 200 and 250 requests/s cannot substitute for original version/client evidence', () => {
  for (const scenario of lesson.SCENARIOS) {
    const trace = lesson.traceFor(scenario);
    assert.deepEqual(trace.routing.map((record) => record.percentToTarget), [100, 100]);
    assert.ok(trace.requests.every((record) => record.httpStatus === 200));
    assert.ok(trace.unaffectedRequestGroups.every((record) => record.httpStatus === 200));
    const result = lesson.measureTrace(scenario);
    assert.equal(result.requests.perSimulatedSecond, 250);
    assert.equal(result.originals.versionMoved, scenario === 'positive' ? 4 : 3);
    assert.equal(result.verdict, scenario === 'positive' ? 'PASS' : scenario === 'interrupted' ? 'FAIL' : 'UNKNOWN');
  }
});

test('fixed data has complete identity, timing, request-count and correlation attribution', () => {
  for (const scenario of lesson.SCENARIOS) {
    const trace = lesson.traceFor(scenario);
    assert.equal(trace.synthetic, true);
    assert.equal(trace.boundary, lesson.BANNER);
    assert.equal(trace.workload.kind, 'fixed-fictional-records');
    assert.equal(trace.correlations.length, 2);
    for (const request of trace.requests) {
      const attempt = trace.attempts.find((item) => item.id === request.attemptId);
      assert.ok(attempt);
      assert.equal(request.originalId, attempt.originalId);
      assert.equal(request.transitionId, attempt.transitionId);
      assert.equal(request.correlationId, attempt.correlationId);
      assert.equal(request.kind, attempt.kind);
      assert.ok(request.atMs >= attempt.startedMs && request.atMs < trace.recordedThroughMs);
    }
    for (const correlation of trace.correlations) {
      assert.equal(correlation.originalIds.length, 2);
      assert.match(correlation.independentEvidence, /unestablished/);
    }
    assert.ok(trace.errors.every((error) => trace.originals.some((original) =>
      original.id === error.originalId && original.attemptId === error.attemptId
      && original.correlationId === error.correlationId)));
  }
});

test('fixtures, results and states are deterministic deeply frozen data', () => {
  const fixture = lesson.traceFor('interrupted');
  const result = lesson.measureTrace('unknown');
  assert.deepEqual(lesson.measureTrace('unknown'), result);
  raises(undefined, () => { fixture.originals[0].startedMs = 9; });
  raises(undefined, () => { result.originals.denominator = 3; });
  const state = run(lesson.createState(), 'interrupted');
  raises(undefined, () => { state.runs[0].result.originals.interrupted = 0; });
  const action = { type: 'conduct', scenario: 'positive' };
  const conducted = lesson.applyAction(lesson.createState(), action);
  action.scenario = 'unknown';
  assert.equal(conducted.events[0].scenario, 'positive');
});

test('only exact typed fixed preset names are accepted', () => {
  for (const value of [undefined, null, true, false, 1, {}, [], new String('positive'), 'Positive', 'true', ' positive', 'positive ', '<script>']) {
    raises('ERR_ACTION', () => lesson.traceFor(value));
    raises('ERR_ACTION', () => lesson.measureTrace(value));
  }
});

test('conduct -> inspect -> measure order is mandatory and cannot be skipped or repeated', () => {
  const ready = lesson.createState();
  raises('ERR_ORDER', () => lesson.applyAction(ready, { type: 'inspect' }));
  raises('ERR_ORDER', () => lesson.applyAction(ready, { type: 'measure' }));
  const conducted = lesson.applyAction(ready, { type: 'conduct', scenario: 'positive' });
  raises('ERR_ORDER', () => lesson.applyAction(conducted, { type: 'measure' }));
  raises('ERR_ORDER', () => lesson.applyAction(conducted, { type: 'conduct', scenario: 'unknown' }));
  const inspected = lesson.applyAction(conducted, { type: 'inspect' });
  raises('ERR_ORDER', () => lesson.applyAction(inspected, { type: 'inspect' }));
  const measured = lesson.applyAction(inspected, { type: 'measure' });
  raises('ERR_ORDER', () => lesson.applyAction(measured, { type: 'measure' }));
});

test('negative and unknown history persists through a later positive run', () => {
  let state = run(lesson.createState(), 'interrupted');
  state = run(state, 'unknown');
  state = run(state, 'positive');
  assert.deepEqual(state.runs.map((item) => item.result.verdict), ['FAIL', 'UNKNOWN', 'PASS']);
  assert.equal(state.runs[0].result.originals.interrupted, 1);
  assert.equal(state.runs[1].result.originals.unknown, 1);
  assert.equal(state.events.length, 9);
  assert.deepEqual(lesson.validateState(clone(state)), state);
});

test('six-run limit is exact; explicit reset clears only the new rehearsal state', () => {
  let state = lesson.createState();
  for (let index = 0; index < lesson.MAX_RUNS; index++) state = run(state, lesson.SCENARIOS[index % 3]);
  assert.equal(state.runs.length, 6);
  assert.equal(state.events.length, 18);
  raises('ERR_LIMIT', () => lesson.applyAction(state, { type: 'conduct', scenario: 'positive' }));
  const reset = lesson.applyAction(state, { type: 'reset' });
  assert.deepEqual(reset, lesson.createState());
  assert.equal(state.runs.length, 6);
  assert.equal(state.runs[1].result.verdict, 'FAIL');
});

test('strict actions reject unknown fields, prototypes, accessors, symbols and untyped flags', () => {
  for (const action of [undefined, null, 'inspect', [], { type: true }, { type: 'INSPECT' },
    { type: 'conduct' }, { type: 'conduct', scenario: 'positive', approved: 'true' },
    { type: 'measure', success: true }, { type: 'reset', keep: false },
    Object.assign(Object.create({ inherited: true }), { type: 'inspect' }),
    { type: 'inspect', [Symbol('extra')]: 1 }]) {
    raises('ERR_ACTION', () => lesson.applyAction(lesson.createState(), action));
  }
  let called = false;
  const getter = { get type() { called = true; return 'inspect'; } };
  raises('ERR_ACTION', () => lesson.applyAction(lesson.createState(), getter));
  assert.equal(called, false);
});

test('replay rejects forged denominators, outcomes, interruptions, phase and history', () => {
  const valid = run(lesson.createState(), 'interrupted');
  const mutations = [
    (state) => { state.schema = '1'; },
    (state) => { state.phase = 'inspected'; },
    (state) => { state.runs[0].result.originals.denominator = 1000; },
    (state) => { state.runs[0].result.originals.interrupted = 0; },
    (state) => { state.runs[0].result.verdict = 'PASS'; },
    (state) => { state.runs[0].result.perOriginal[1].outcome = 'successful'; },
    (state) => { state.events[0].scenario = 'positive'; },
    (state) => { state.events.splice(1, 1); },
    (state) => { state.events[1] = { type: 'reset' }; },
    (state) => { state.events[1].extra = true; },
    (state) => { state.extra = true; },
    (state) => { state[Symbol('extra')] = 1; },
    (state) => { Object.defineProperty(state, 'hiddenExtra', { value: 1 }); },
  ];
  for (const mutate of mutations) {
    const altered = clone(valid);
    mutate(altered);
    raises('ERR_STATE', () => lesson.applyAction(altered, { type: 'conduct', scenario: 'positive' }));
  }
});

test('state history guards do not invoke getters or custom array iterators', () => {
  let called = false;
  const state = clone(run(lesson.createState(), 'positive'));
  Object.defineProperty(state.events, '0', { get() { called = true; return { type: 'conduct', scenario: 'positive' }; } });
  raises('ERR_STATE', () => lesson.validateState(state));
  assert.equal(called, false);
  const custom = clone(run(lesson.createState(), 'positive'));
  custom.events[Symbol.iterator] = function* iterator() { called = true; yield { type: 'inspect' }; };
  raises('ERR_STATE', () => lesson.validateState(custom));
  assert.equal(called, false);
  for (const invalid of [null, {}, { events: [] }, { events: new Array(19) }]) {
    raises('ERR_STATE', () => lesson.validateState(invalid));
  }
});
