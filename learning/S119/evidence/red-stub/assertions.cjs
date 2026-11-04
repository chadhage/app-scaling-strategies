'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const model = require('./model.js');

function restore(fixture = 'aligned') {
  return model.transition(model.initialState(), { type: 'restore', fixture });
}

function eligible(fixture = 'aligned') {
  let state = restore(fixture);
  state = model.transition(state, { type: 'synchronize' });
  return model.transition(state, { type: 'ownership' });
}

function result(state) {
  return state.history.at(-1).result;
}

test('restoration accepts the fixed aligned observation without claiming migration', () => {
  const before = model.initialState();
  const state = model.transition(before, { type: 'restore', fixture: 'aligned' });
  assert.equal(state.phase, 'restored');
  assert.equal(before.phase, 'awaiting-restore');
  assert.equal(result(state).outcome, 'positive');
  assert.deepEqual(model.summarize(state).journeys, {
    attempted: 0, passed: 0, failed: 0, unknown: 0,
  });
});

test('data and sole-writer/fence gates precede 25, 50, 100 percent return', () => {
  let state = restore();
  state = model.transition(state, { type: 'return', percent: 25 });
  assert.equal(result(state).outcome, 'negative');
  assert.equal(result(state).blockedBeforeExposure, true);
  assert.equal(state.effectivePercent, 0);
  state = model.transition(state, { type: 'ownership' });
  assert.equal(result(state).outcome, 'negative');
  assert.equal(state.ownership, 'unchecked');
  state = model.transition(state, { type: 'synchronize' });
  assert.equal(state.synchronization, 'positive');
  state = model.transition(state, { type: 'return', percent: 25 });
  assert.equal(result(state).outcome, 'negative');
  state = model.transition(state, { type: 'ownership' });
  assert.equal(state.ownership, 'positive');
  for (const percent of [25, 50, 100]) {
    state = model.transition(state, { type: 'return', percent });
    assert.equal(result(state).outcome, 'positive');
    assert.equal(state.effectivePercent, percent);
    assert.equal(result(state).observations.routing.requestedPercent, percent);
    assert.equal(result(state).observations.routing.effectivePercent, percent);
  }
  assert.equal(state.phase, 'complete');
  const summary = model.summarize(state);
  assert.deepEqual(summary.journeys, { attempted: 6, passed: 6, failed: 0, unknown: 0 });
  assert.equal(summary.completed, true);
  assert.equal(summary.safeAborts, 2);
  assert.equal(state.history.length, 9);
});

test('cohort skipping, duplicate restore, and repeated cohorts cannot bypass order', () => {
  let state = eligible();
  state = model.transition(state, { type: 'return', percent: 100 });
  assert.equal(result(state).outcome, 'negative');
  assert.equal(state.effectivePercent, 0);
  state = model.transition(state, { type: 'restore', fixture: 'lagging-state' });
  assert.equal(state.fixture, 'aligned');
  assert.equal(result(state).outcome, 'negative');
  state = model.transition(state, { type: 'return', percent: 25 });
  state = model.transition(state, { type: 'return', percent: 25 });
  assert.equal(result(state).outcome, 'negative');
  assert.equal(state.effectivePercent, 25);
  assert.equal(model.summarize(state).journeys.attempted, 2);
});

for (const [fixture, gate, outcome] of [
  ['restore-unknown', 'restoration', 'unknown'],
  ['lagging-state', 'synchronization', 'negative'],
  ['sync-unknown', 'synchronization', 'unknown'],
  ['unfenced-writer', 'ownership', 'negative'],
  ['ownership-unknown', 'ownership', 'unknown'],
]) {
  test(`${fixture}: ${gate} remains ${outcome} and no return is certified`, () => {
    let state = restore(fixture);
    if (gate !== 'restoration') state = model.transition(state, { type: 'synchronize' });
    if (gate === 'ownership') state = model.transition(state, { type: 'ownership' });
    assert.equal(state[gate], outcome);
    assert.equal(result(state).outcome, outcome);
    state = model.transition(state, { type: 'return', percent: 25 });
    assert.notEqual(result(state).outcome, 'positive');
    assert.equal(state.effectivePercent, 0);
    assert.equal(model.summarize(state).completed, false);
    assert.equal(model.summarize(state).journeys.attempted, 0);
  });
}

test('insufficient fictional capacity rejects return even after synchronization and ownership', () => {
  let state = eligible('capacity-shortfall');
  state = model.transition(state, { type: 'return', percent: 25 });
  assert.equal(result(state).outcome, 'negative');
  assert.equal(result(state).blockedBeforeExposure, true);
  assert.equal(result(state).observations.capacity.availableUnits, 3);
  assert.equal(result(state).observations.capacity.requiredUnits, 5);
  assert.equal(state.effectivePercent, 0);
  assert.equal(model.summarize(state).journeys.attempted, 0);
});

for (const [fixture, percentages, outcome, expected] of [
  ['continuity-break', [25, 50], 'negative', { attempted: 4, passed: 3, failed: 1, unknown: 0 }],
  ['latency-breach', [25, 50], 'negative', { attempted: 4, passed: 3, failed: 1, unknown: 0 }],
  ['routing-mismatch', [25], 'negative', { attempted: 2, passed: 0, failed: 2, unknown: 0 }],
  ['routing-unknown', [25], 'unknown', { attempted: 2, passed: 0, failed: 0, unknown: 2 }],
  ['journey-unknown', [25], 'unknown', { attempted: 2, passed: 1, failed: 0, unknown: 1 }],
]) {
  test(`${fixture}: ${outcome} retains measured journeys and holds later return`, () => {
    let state = eligible(fixture);
    for (const percent of percentages) state = model.transition(state, { type: 'return', percent });
    assert.equal(result(state).outcome, outcome);
    assert.equal(state.phase, 'held');
    assert.equal(model.summarize(state).completed, false);
    assert.deepEqual(model.summarize(state).journeys, expected);
    const retained = JSON.stringify(state.history);
    state = model.transition(state, { type: 'return', percent: 100 });
    assert.notEqual(result(state).outcome, 'positive');
    assert.deepEqual(model.summarize(state).journeys, expected);
    assert.equal(JSON.stringify(state.history.slice(0, -1)), retained);
  });
}

test('all input guards use strict types and exact command shapes without mutation', () => {
  const state = model.initialState();
  const commands = [
    null, [], 'restore', {}, { type: 'deploy' }, { type: 1 },
    { type: 'restore', fixture: 'not-a-fixture' },
    { type: 'restore', fixture: 'aligned', region: 'real' },
    { type: 'synchronize', observed: true },
    { type: 'ownership', epoch: 99 },
    ...['25', null, true, NaN, Infinity, -1, 0, 24, 25.1, 101].map((percent) => ({ type: 'return', percent })),
    { type: 'return', percent: 25, forced: true },
    Object.assign(Object.create({ inherited: true }), { type: 'synchronize' }),
    Object.assign({ type: 'synchronize' }, { [Symbol('extra')]: true }),
  ];
  for (const command of commands) {
    assert.throws(() => model.transition(state, command), { code: 'ERR_S119_INPUT' });
    assert.equal(state.history.length, 0);
  }
});

test('forged flags, epochs, evidence, history order and unsupported state shapes fail closed', () => {
  const valid = eligible();
  const mutations = [
    (s) => { s.fixture = 'unfenced-writer'; },
    (s) => { s.effectivePercent = 100; s.phase = 'complete'; },
    (s) => { s.synchronization = true; },
    (s) => { s.history[1].result.outcome = 'negative'; },
    (s) => { s.history[2].result.observations.ownership.epoch = 999; },
    (s) => { s.history.reverse(); },
    (s) => { s.history[0].sequence = 2; },
    (s) => { s.history.pop(); },
    (s) => { s.extra = 'trust me'; },
  ];
  for (const mutate of mutations) {
    const forged = JSON.parse(JSON.stringify(valid));
    mutate(forged);
    assert.throws(() => model.transition(forged, { type: 'return', percent: 25 }), { code: 'ERR_S119_STATE' });
    assert.throws(() => model.summarize(forged), { code: 'ERR_S119_STATE' });
  }
  for (const forged of [null, [], {}, { ...valid, history: 'history' }]) {
    assert.throws(() => model.transition(forged, { type: 'return', percent: 25 }), { code: 'ERR_S119_STATE' });
  }
  const accessor = { ...valid };
  Object.defineProperty(accessor, 'phase', { enumerable: true, get() { throw new Error('must not execute'); } });
  assert.throws(() => model.transition(accessor, { type: 'return', percent: 25 }), { code: 'ERR_S119_STATE' });
});

test('fixed DATA and returned histories are immutable, deterministic and bounded', () => {
  let state = eligible();
  assert.equal(Object.isFrozen(model.FIXTURES), true);
  assert.equal(Object.isFrozen(model.FIXTURES.aligned.stages[25].journeys[0]), true);
  assert.equal(Object.isFrozen(state.history[2].result.observations.ownership), true);
  assert.throws(() => { state.phase = 'complete'; }, TypeError);
  assert.deepEqual(eligible(), eligible());
  assert.deepEqual(model.transition(JSON.parse(JSON.stringify(state)), { type: 'return', percent: 25 }),
    model.transition(state, { type: 'return', percent: 25 }));
  while (state.history.length < model.MAX_ACTIONS) {
    state = model.transition(state, { type: 'return', percent: 100 });
  }
  assert.equal(state.history.length, 24);
  assert.throws(() => model.transition(state, { type: 'return', percent: 100 }), { code: 'ERR_S119_LIMIT' });
  assert.equal(state.history.length, 24);
  assert.deepEqual(model.initialState(), model.initialState());
  assert.equal(model.initialState().history.length, 0);
});
