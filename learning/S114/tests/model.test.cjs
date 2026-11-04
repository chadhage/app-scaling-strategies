'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('..\\model.js');

test('isolation labels alone leave the conclusion and full-region guarantee unknown', () => {
  const initial = model.createState();
  const isolated = model.applyAction(initial, {
    type: 'isolate', fixture: 'alternate-ready', fault: 'both', budgetSeconds: 60,
  });
  assert.equal(isolated.conclusion, 'unknown', 'Authored fault labels cannot certify continuity.');
  assert.equal(isolated.regionalContinuity, 'unknown', 'A fixture is not a full-region guarantee.');
  assert.equal(initial.history.length, 0);
});

const start = (fixture = 'alternate-ready', budgetSeconds = 60, fault = 'both') =>
  ({ type: 'isolate', fixture, fault, budgetSeconds });
function run(fixture = 'alternate-ready', budget = 60, fault = 'both', previous = model.createState()) {
  let state = model.applyAction(previous, start(fixture, budget, fault));
  for (const type of ['detect', 'recover', 'journeys']) state = model.applyAction(state, { type });
  return state;
}
function rejected(state, action, code) {
  const before = JSON.stringify(state);
  assert.throws(() => model.applyAction(state, action), (error) => error.code === code);
  assert.equal(JSON.stringify(state), before);
}

test('ready detection, capacity, required state, transactions and clients meet the declared budget', () => {
  const state = run();
  assert.equal(state.phase, 'assessed');
  assert.equal(state.conclusion, 'positive');
  assert.deepEqual(Object.values(state.checks), Array(6).fill('positive'));
  assert.equal(state.destination, 'Teaching South / south-a');
  assert.equal(state.metrics.detectionSeconds, 12);
  assert.equal(state.metrics.switchSeconds, 10);
  assert.equal(state.metrics.clientSeconds, 8);
  assert.equal(state.metrics.interruptionSeconds, 30);
  assert.equal(state.metrics.survivingCapacity, 96);
  assert.equal(state.metrics.observedRevision, 7);
  assert.equal(state.metrics.committedEffects, 1);
  assert.equal(state.journeys[0].session, 'lesson-session-001');
  assert.equal(state.journeys[1].receipt, 'committed-once');
  assert.equal(state.metrics.successfulJourneys, 2);
  assert.equal(state.regionalContinuity, 'unknown');
});

test('all six fixed fixtures across all three fault kinds retain honest scope', async (t) => {
  const outcomes = {
    'alternate-ready': 'positive', 'capacity-shortfall': 'negative', 'data-unavailable': 'negative',
    'budget-exceeded': 'negative', 'duplicate-effect': 'negative', 'shallow-proxy-only': 'unknown',
  };
  for (const fixture of model.fixtures) {
    for (const fault of model.faultKinds) {
      await t.test(`${fixture.id} / ${fault}`, () => {
        const state = run(fixture.id, 60, fault);
        assert.equal(state.conclusion, outcomes[fixture.id]);
        assert.equal(state.modelFault.region, 'Teaching North');
        assert.ok(state.modelFault.origins.every((origin) => origin.healthy === (fault === 'dependencies')));
        assert.ok(state.modelFault.dependencies.every((dependency) => dependency.healthy === (fault === 'origins')));
        assert.equal(state.regionalContinuity, 'unknown');
        assert.ok(state.history.every((event) => event.regionalContinuity === 'unknown'));
      });
    }
  }
});

test('capacity and data failures block selection without inventing transaction loss or recovery time', () => {
  for (const [fixture, check] of [['capacity-shortfall', 'capacity'], ['data-unavailable', 'data']]) {
    const state = run(fixture);
    assert.equal(state.checks[check], 'negative');
    assert.equal(state.recovery, 'blocked');
    assert.equal(state.destination, null);
    assert.equal(state.checks.transactions, 'unknown');
    assert.equal(state.journeys[1].receipt, 'unconfirmed');
    assert.equal(state.journeys[1].effects, null);
    assert.equal(state.checks.clientRecovery, 'negative');
    assert.equal(state.checks.budget, 'unknown');
    assert.equal(state.metrics.interruptionSeconds, null);
    assert.deepEqual([state.metrics.successfulJourneys, state.metrics.interruptedJourneys, state.metrics.unknownJourneys], [0, 1, 1]);
  }
});

test('healthy HTTP-only samples cannot certify detection, data, transactions or regional continuity', () => {
  const state = run('shallow-proxy-only', 60, 'dependencies');
  assert.equal(state.samples.primaryShallowHealthy, true);
  assert.equal(state.samples.alternateShallowHealthy, true);
  assert.equal(state.samples.dependencyAwareHealthy, null);
  assert.ok(Object.values(state.checks).every((result) => result === 'unknown'));
  assert.equal(state.recovery, 'unverified');
  assert.equal(state.destination, null);
  assert.equal(state.metrics.detectionSeconds, null);
  assert.equal(state.metrics.survivingCapacity, null);
  assert.equal(state.metrics.observedRevision, null);
  assert.equal(state.metrics.committedEffects, null);
  assert.deepEqual([state.metrics.successfulJourneys, state.metrics.interruptedJourneys, state.metrics.unknownJourneys], [0, 0, 2]);
});

test('duplicate transaction effects fail semantic client recovery despite healthy alternate HTTP', () => {
  const state = run('duplicate-effect');
  assert.equal(state.samples.alternateShallowHealthy, true);
  assert.equal(state.checks.capacity, 'positive');
  assert.equal(state.checks.data, 'positive');
  assert.equal(state.checks.budget, 'positive');
  assert.equal(state.metrics.committedEffects, 2);
  assert.equal(state.checks.transactions, 'negative');
  assert.equal(state.checks.clientRecovery, 'negative');
  assert.deepEqual([state.metrics.successfulJourneys, state.metrics.interruptedJourneys, state.metrics.unknownJourneys], [1, 1, 0]);
});

test('budget boundaries are measured rather than inferred from fixture labels', () => {
  assert.equal(run('alternate-ready', 30).checks.budget, 'positive');
  assert.equal(run('alternate-ready', 29).checks.budget, 'negative');
  assert.equal(run('budget-exceeded', 60).metrics.interruptionSeconds, 75);
  assert.equal(run('budget-exceeded', 75).conclusion, 'positive');
  assert.equal(run('budget-exceeded', 120).conclusion, 'positive');
  const late = run('alternate-ready', 10);
  assert.equal(late.checks.detection, 'negative');
  assert.equal(late.recovery, 'selected', 'Late detection does not prohibit safe mitigation; it still fails the budget.');
  assert.equal(late.conclusion, 'negative');
});

test('raw budget strings reject coercion and support exact bounds', () => {
  for (const [raw, value] of [['10', 10], ['60', 60], ['120', 120]]) assert.equal(model.parseBudget(raw), value);
  for (const raw of [60, true, null, undefined, '', '9', '121', '060', ' 60', '60 ', '+60', '-60', '6e1', '60.0', 'NaN', 'Infinity', '６０']) {
    assert.throws(() => model.parseBudget(raw), (error) => error.code === 'S114_INPUT');
  }
});

test('ordered actions reject premature, repeated and unknown requests without mutation', () => {
  const initial = model.createState();
  for (const type of ['detect', 'recover', 'journeys']) rejected(initial, { type }, 'S114_ORDER');
  const isolated = model.applyAction(initial, start());
  rejected(isolated, start(), 'S114_ORDER');
  rejected(isolated, { type: 'recover' }, 'S114_ORDER');
  rejected(isolated, { type: 'journeys' }, 'S114_ORDER');
  const detected = model.applyAction(isolated, { type: 'detect' });
  rejected(detected, { type: 'detect' }, 'S114_ORDER');
  rejected(detected, { type: 'journeys' }, 'S114_ORDER');
  const recovered = model.applyAction(detected, { type: 'recover' });
  rejected(recovered, { type: 'recover' }, 'S114_ORDER');
  const assessed = model.applyAction(recovered, { type: 'journeys' });
  rejected(assessed, { type: 'journeys' }, 'S114_ORDER');
});

test('exact typed action shapes reject aliases, extras, wrong values and accessors', () => {
  const state = model.createState();
  for (const action of [
    null, undefined, [], 1, true, 'isolate', { type: 'fail-region' }, { type: 'reset', extra: true },
    { ...start(), fixture: 'arbitrary-origin' }, { ...start(), fault: 'Azure-region' },
    { ...start(), budgetSeconds: '60' }, { ...start(), budgetSeconds: false },
    { ...start(), budgetSeconds: NaN }, { ...start(), budgetSeconds: Infinity },
    { ...start(), budgetSeconds: 60.5 }, { ...start(), budgetSeconds: 9 },
    { ...start(), budgetSeconds: 121 }, { ...start(), extra: 1 },
    { type: 'isolate', fixture: 'alternate-ready', budgetSeconds: 60 },
    Object.assign(Object.create({ inherited: true }), start()),
  ]) rejected(state, action, 'S114_INPUT');
  let getterCalls = 0;
  const accessor = { ...start() };
  Object.defineProperty(accessor, 'fixture', { enumerable: true, get() { getterCalls++; return 'alternate-ready'; } });
  assert.throws(() => model.applyAction(state, accessor), (error) => error.code === 'S114_INPUT');
  assert.equal(getterCalls, 0);
  const symbolic = { ...start(), [Symbol('extra')]: true };
  assert.throws(() => model.applyAction(state, symbolic), (error) => error.code === 'S114_INPUT');
});

test('bounded replay rejects forged state and edited historical outcomes', () => {
  const original = run();
  const variants = [
    (state) => { state.schemaVersion = 2; },
    (state) => { state.runCount = 0; },
    (state) => { state.phase = 'idle'; },
    (state) => { state.regionalContinuity = 'positive'; },
    (state) => { state.metrics.committedEffects = 2; },
    (state) => { state.checks.capacity = 'negative'; },
    (state) => { state.history[0].conclusion = 'positive'; },
    (state) => { state.history[1].metrics.detectionSeconds = 0; },
    (state) => { state.history[0].action.budgetSeconds = 120; },
    (state) => { state.extra = true; },
    (state) => { state.history.extra = 1; },
    (state) => { delete state.history[1]; },
  ];
  for (const mutate of variants) {
    const forged = structuredClone(original);
    mutate(forged);
    assert.throws(() => model.applyAction(forged, { type: 'reset' }), (error) => error.code === 'S114_STATE');
  }
  let getterCalls = 0;
  const accessor = structuredClone(original);
  Object.defineProperty(accessor, 'phase', { enumerable: true, get() { getterCalls++; return 'assessed'; } });
  assert.throws(() => model.applyAction(accessor, { type: 'reset' }), (error) => error.code === 'S114_STATE');
  assert.equal(getterCalls, 0);
  const cycle = structuredClone(original);
  cycle.history[0].cycle = cycle;
  assert.throws(() => model.applyAction(cycle, { type: 'reset' }), (error) => error.code === 'S114_STATE');
  assert.deepEqual(model.applyAction(structuredClone(original), { type: 'reset' }), model.createState());
});

test('six runs retain earlier mixed history; the seventh is rejected; reset restores the original state', () => {
  let state = model.createState();
  for (const fixture of model.fixtures) {
    const prior = structuredClone(state.history);
    state = run(fixture.id, 60, 'both', state);
    assert.deepEqual(state.history.slice(0, prior.length), prior);
  }
  assert.equal(state.runCount, 6);
  assert.equal(state.history.length, 24);
  for (const result of ['positive', 'negative', 'unknown']) assert.ok(state.history.some((event) => event.conclusion === result));
  rejected(state, start(), 'S114_LIMIT');
  assert.ok(Object.isFrozen(state) && Object.isFrozen(state.metrics) && Object.isFrozen(state.history[0].checks));
  assert.throws(() => { state.checks.capacity = 'positive'; }, TypeError);
  const reset = model.applyAction(state, { type: 'reset' });
  assert.deepEqual(reset, model.createState());
  assert.equal(state.history.length, 24);
});

test('fixed data and repeated actions are deterministic with no timer, randomness or external calls', () => {
  assert.deepEqual(run(), run());
  assert.ok(Object.isFrozen(model.fixtures) && model.fixtures.every(Object.isFrozen));
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'model.js'), 'utf8');
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|Date|setTimeout|setInterval)\b|Math\.random|child_process/);
});
