'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLesson } = require('..\\model.js');
const { CONDITIONS, BOUNDS, ROUTE } = require('..\\fixtures.js');

const configuration = (condition = 'independent', recovery = 'confirmed') => ({ condition, recovery });
function throughReport(lesson, condition = 'independent', recovery = 'confirmed') {
  lesson.start(configuration(condition, recovery));
  lesson.loseManagement();
  lesson.sampleJourneys();
  return lesson.reportFault();
}
function completed(lesson, condition = 'independent', recovery = 'confirmed', prediction = 'PASS') {
  throughReport(lesson, condition, recovery);
  lesson.recoverControl();
  return lesson.checkPrediction(prediction);
}

test('loadable lesson exposes every action and a zero-sample idle state', () => {
  const lesson = createLesson();
  for (const name of ['snapshot', 'start', 'loseManagement', 'sampleJourneys', 'reportFault',
    'recoverControl', 'checkPrediction', 'newAttempt', 'reset']) assert.equal(typeof lesson[name], 'function');
  assert.equal(lesson.snapshot().phase, 'idle');
  assert.deepEqual(lesson.snapshot().metrics, { attempted: 0, success: 0, failure: 0, unknown: 0 });
});

test('valid preparation records exact fixture, route and declared bounds', () => {
  const state = createLesson().start(configuration());
  assert.equal(state.phase, 'prepared');
  assert.equal(state.attemptId, 1);
  assert.deepEqual(state.config, configuration());
  assert.deepEqual(state.route, ROUTE);
  assert.equal(state.trace[0].kind, 'prepared');
});

test('management loss rejects its synthetic command without changing established routing', () => {
  const lesson = createLesson();
  lesson.start(configuration());
  const state = lesson.loseManagement();
  assert.equal(state.phase, 'outage');
  assert.equal(state.controlAvailability, 'unavailable');
  assert.equal(state.harnessAvailability, 'available');
  assert.equal(state.faultScope, 'per-run-management');
  assert.deepEqual(state.commandCounts, { attempted: 1, rejected: 1 });
  assert.deepEqual(state.route, ROUTE);
  assert.equal(state.trace.at(-1).commandOutcome, 'rejected-control-unavailable');
});

test('independent data samples succeed while management is unavailable', () => {
  const lesson = createLesson();
  lesson.start(configuration());
  lesson.loseManagement();
  const state = lesson.sampleJourneys();
  assert.equal(state.phase, 'sampled');
  assert.equal(state.controlAvailability, 'unavailable');
  assert.equal(state.dataOutcome, 'continuing-established-service');
  assert.deepEqual(state.metrics, { attempted: 3, success: 3, failure: 0, unknown: 0 });
  assert.deepEqual(state.journeys, CONDITIONS.independent.journeys);
  assert.ok(state.journeys.every((entry) => entry.latencyMs <= BOUNDS.journeyBudgetMs));
  assert.equal(state.userTransitionClaim, false);
});

test('a per-request controller dependency fails all established journeys despite later recovery', () => {
  const state = completed(createLesson(), 'controller-dependent', 'confirmed', 'FAIL');
  assert.equal(state.verification, 'FAIL');
  assert.equal(state.controlAvailability, 'available');
  assert.equal(state.dataOutcome, 'interrupted');
  assert.deepEqual(state.metrics, { attempted: 3, success: 0, failure: 3, unknown: 0 });
  assert.ok(state.journeys.every((entry) => entry.reason === 'controller-required-but-unavailable'));
  assert.equal(state.predictionCorrect, true);
});

test('an independent service error remains a measured failure, never a healthy-controller fallback', () => {
  const state = completed(createLesson(), 'service-error', 'confirmed', 'FAIL');
  assert.equal(state.verification, 'FAIL');
  assert.deepEqual(state.metrics, { attempted: 3, success: 2, failure: 1, unknown: 0 });
  assert.equal(state.journeys[1].reason, 'service-error');
  assert.equal(state.history[0].metrics.failure, 1);
});

test('missing completion evidence is unknown and cannot become a zero-latency success', () => {
  const state = completed(createLesson(), 'missing-sample', 'confirmed', 'UNKNOWN');
  assert.equal(state.verification, 'UNKNOWN');
  assert.equal(state.dataOutcome, 'unverified');
  assert.equal(state.controlAvailability, 'available');
  assert.deepEqual(state.metrics, { attempted: 3, success: 2, failure: 0, unknown: 1 });
  assert.equal(state.journeys[2].latencyMs, null);
  assert.equal(state.journeys[2].status, 'unknown');
});

test('independent shared harness reports the scoped fault and exact samples during the outage', () => {
  const state = throughReport(createLesson(), 'service-error');
  assert.equal(state.phase, 'reported');
  assert.equal(state.controlAvailability, 'unavailable');
  assert.equal(state.harnessAvailability, 'available');
  assert.deepEqual(state.harnessReport, {
    reporter: 'independent-training-harness', scope: 'per-run-management',
    commandOutcome: 'rejected-control-unavailable',
    metrics: { attempted: 3, success: 2, failure: 1, unknown: 0 },
  });
});

test('only confirmed recovery evidence restores control, retaining route and failure attribution', () => {
  const lesson = createLesson();
  const before = throughReport(lesson, 'service-error');
  const after = lesson.recoverControl();
  assert.equal(after.phase, 'recovered');
  assert.equal(after.recoveryOutcome, 'confirmed');
  assert.equal(after.controlAvailability, 'available');
  assert.deepEqual(after.route, before.route);
  assert.deepEqual(after.journeys, before.journeys);
  assert.deepEqual(after.metrics, before.metrics);
  assert.equal(after.verification, 'FAIL');
});

test('missing recovery acknowledgement keeps control unknown without changing observed data success', () => {
  const state = completed(createLesson(), 'independent', 'missing', 'UNKNOWN');
  assert.equal(state.recoveryOutcome, 'unverified');
  assert.equal(state.controlAvailability, 'unknown');
  assert.equal(state.dataOutcome, 'continuing-established-service');
  assert.deepEqual(state.metrics, { attempted: 3, success: 3, failure: 0, unknown: 0 });
  assert.equal(state.verification, 'UNKNOWN');
  assert.equal(state.history[0].recoveryOutcome, 'unverified');
});

test('prediction correctness is independent of the actual service verdict', () => {
  const state = completed(createLesson(), 'controller-dependent', 'confirmed', 'PASS');
  assert.equal(state.phase, 'checked');
  assert.equal(state.verification, 'FAIL');
  assert.equal(state.prediction, 'PASS');
  assert.equal(state.predictionCorrect, false);
  assert.equal(state.history[0].verification, 'FAIL');
  assert.equal(state.history[0].predictionCorrect, false);
});

test('all out-of-order and repeated actions reject before mutation', () => {
  const lesson = createLesson();
  const unchanged = (action) => {
    const before = lesson.snapshot();
    assert.throws(action, /Invalid state/);
    assert.deepEqual(lesson.snapshot(), before);
  };
  for (const name of ['loseManagement', 'sampleJourneys', 'reportFault', 'recoverControl', 'newAttempt']) {
    unchanged(() => lesson[name]());
  }
  unchanged(() => lesson.checkPrediction('PASS'));
  lesson.start(configuration());
  unchanged(() => lesson.start(configuration()));
  unchanged(() => lesson.sampleJourneys());
  lesson.loseManagement();
  unchanged(() => lesson.loseManagement());
  lesson.sampleJourneys();
  unchanged(() => lesson.recoverControl());
  lesson.reportFault();
  lesson.recoverControl();
  unchanged(() => lesson.recoverControl());
  lesson.checkPrediction('PASS');
  unchanged(() => lesson.checkPrediction('PASS'));
});

test('exact plain enum records reject invalid values, extras, inherited data and accessors', () => {
  let getterRead = false;
  const getter = { recovery: 'confirmed' };
  Object.defineProperty(getter, 'condition', { enumerable: true, get() { getterRead = true; return 'independent'; } });
  for (const input of [null, [], {}, 'independent', { condition: 'independent' },
    configuration('not-a-fixture'), configuration('independent', 'pretend'),
    { ...configuration(), arbitraryCommand: 'fake' }, Object.create(configuration()), getter,
    { ...configuration(), [Symbol('extra')]: true }]) {
    const lesson = createLesson();
    const before = lesson.snapshot();
    assert.throws(() => lesson.start(input), /Invalid input/);
    assert.deepEqual(lesson.snapshot(), before);
  }
  assert.equal(getterRead, false);
});

test('every public action enforces exact argument counts and predictions are enumerated', () => {
  assert.throws(() => createLesson('extra'), /Invalid input/);
  const lesson = createLesson();
  assert.throws(() => lesson.snapshot('extra'), /Invalid input/);
  assert.throws(() => lesson.start(), /Invalid input/);
  assert.throws(() => lesson.start(configuration(), 'extra'), /Invalid input/);
  lesson.start(configuration());
  for (const name of ['loseManagement', 'sampleJourneys', 'reportFault', 'recoverControl', 'newAttempt', 'reset']) {
    assert.throws(() => lesson[name]('extra'), /Invalid input/);
  }
  lesson.loseManagement();
  lesson.sampleJourneys();
  lesson.reportFault();
  lesson.recoverControl();
  for (const prediction of [undefined, null, 'success', { verdict: 'PASS' }]) {
    assert.throws(() => lesson.checkPrediction(prediction), /Invalid input/);
  }
  assert.throws(() => lesson.checkPrediction('PASS', 'extra'), /Invalid input/);
});

test('caller configuration and deep-frozen snapshots cannot alter internal state', () => {
  const lesson = createLesson();
  const input = configuration();
  const state = lesson.start(input);
  assert.deepEqual(state.config, configuration());
  input.condition = 'controller-dependent';
  assert.equal(lesson.snapshot().config.condition, 'independent');
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.route), true);
  assert.equal(Object.isFrozen(state.trace), true);
  assert.throws(() => { state.route.epoch = 99; }, /read only/);
  assert.throws(() => state.trace.push({ fake: true }), /extensible/);
  assert.deepEqual(lesson.snapshot().route, ROUTE);
});

test('new attempts retain complete positive, negative and unknown histories and denominators', () => {
  const lesson = createLesson();
  completed(lesson);
  const first = lesson.snapshot().history;
  assert.equal(first.length, 1);
  lesson.newAttempt();
  completed(lesson, 'service-error', 'confirmed', 'FAIL');
  lesson.newAttempt();
  const state = completed(lesson, 'missing-sample', 'confirmed', 'UNKNOWN');
  assert.equal(state.history.length, 3);
  assert.deepEqual(state.history[0], first[0]);
  assert.deepEqual(state.history.map((entry) => entry.verification), ['PASS', 'FAIL', 'UNKNOWN']);
  assert.deepEqual(state.retainedMetrics, { attempted: 9, success: 7, failure: 1, unknown: 1 });
  assert.equal(state.retainedMetrics.success + state.retainedMetrics.failure + state.retainedMetrics.unknown,
    state.retainedMetrics.attempted);
  assert.ok(state.history.every((entry) => entry.trace.length === 6 && entry.journeys.length === 3));
});

test('six retained attempts are bounded without eviction; explicit reset restores capacity', () => {
  const lesson = createLesson();
  for (let index = 0; index < BOUNDS.maxHistory; index++) {
    if (index) lesson.newAttempt();
    completed(lesson);
  }
  const before = lesson.snapshot();
  assert.equal(before.history.length, BOUNDS.maxHistory);
  assert.throws(() => lesson.newAttempt(), /History full/);
  assert.deepEqual(lesson.snapshot(), before);
  lesson.reset();
  assert.equal(lesson.snapshot().history.length, 0);
  assert.equal(lesson.start(configuration()).attemptId, 1);
});

test('reset from a partial outage or checked failure clears all local state and is idempotent', () => {
  const lesson = createLesson();
  lesson.start(configuration());
  lesson.loseManagement();
  assert.equal(lesson.snapshot().controlAvailability, 'unavailable');
  const fresh = lesson.reset();
  assert.equal(fresh.phase, 'idle');
  assert.equal(fresh.config, null);
  assert.equal(fresh.controlAvailability, 'available');
  assert.equal(fresh.harnessReport, null);
  assert.deepEqual(fresh.trace, []);
  assert.deepEqual(fresh.history, []);
  assert.deepEqual(lesson.reset(), fresh);
  completed(lesson, 'service-error', 'confirmed', 'FAIL');
  assert.equal(lesson.snapshot().retainedMetrics.failure, 1);
  assert.deepEqual(lesson.reset(), fresh);
});

test('all eight bounded fixtures are deterministic and partition every attempted journey', () => {
  for (const condition of Object.keys(CONDITIONS)) {
    for (const recovery of ['confirmed', 'missing']) {
      const verdict = ['controller-dependent', 'service-error'].includes(condition) ? 'FAIL'
        : condition === 'missing-sample' || recovery === 'missing' ? 'UNKNOWN' : 'PASS';
      const first = completed(createLesson(), condition, recovery, verdict);
      const second = completed(createLesson(), condition, recovery, verdict);
      assert.equal(first.verification, verdict);
      assert.equal(first.predictionCorrect, true);
      assert.deepEqual(first, second);
      assert.equal(first.metrics.attempted, BOUNDS.journeysPerAttempt);
      assert.equal(first.metrics.success + first.metrics.failure + first.metrics.unknown, first.metrics.attempted);
      assert.equal(first.trace.length, BOUNDS.maxTraceEvents);
      assert.deepEqual(first.trace.map((event) => event.atSyntheticMs), [0, 10, 20, 30, 40, 50]);
      assert.deepEqual(first.route, ROUTE);
      assert.equal(first.harnessAvailability, 'available');
    }
  }
});
