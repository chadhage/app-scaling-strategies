'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('./model.js');
const clone = (value) => JSON.parse(JSON.stringify(value));
const configure = (values = {}) => ({ type: 'configure', ...model.defaults, ...values });
const step = (state, condition = 'complete') => model.reduce(state, { type: 'step', condition });
const run = (state = model.initial(), condition = 'complete') => {
  for (let count = state.cursor; count < 10; count += 1) state = step(state, condition);
  return state;
};

test('default configuration declares the exact bounded synthetic fixture', () => {
  assert.deepEqual(model.defaults, {
    pattern: 'oscillating', lowRps: 60, highRps: 180,
    stabilizationWindows: 2, cooldownWindows: 2, budgetMs: 250
  });
  const initial = model.initial();
  assert.equal(initial.lanes.immediate.ready, 2);
  assert.equal(initial.lanes.stabilized.ready, 2);
  assert.equal(model.summarize(initial).verification.verdict, 'NOT_RUN');
  assert.equal(model.summarize(initial).lanes.immediate.attempts, 0);
});

test('one shared demand window produces four actual synthetic observations per lane', () => {
  const state = step(model.initial());
  assert.equal(state.cursor, 1);
  assert.equal(state.observations[0].demandRps, 180);
  for (const name of ['immediate', 'stabilized']) {
    assert.equal(state.observations[0].lanes[name].journeys.length, 4);
    assert.equal(model.summarize(state).lanes[name].attempts, 4);
    assert.equal(model.summarize(state).lanes[name].uninterrupted, 4);
  }
  assert.equal(model.summarize(state).verification.verdict, 'IN_PROGRESS');
});

test('default oscillating trace is exact and retained, not randomized', () => {
  const state = run();
  assert.equal(state.cursor, 10);
  assert.deepEqual(state.observations.map((entry) => entry.demandRps), [180, 60, 180, 60, 180, 60, 180, 60, 180, 60]);
  assert.deepEqual(run(), state);
});

test('immediate capacity removal interrupts a continuation while retaining HTTP and state facts', () => {
  const state = step(step(model.initial()));
  assert.equal(state.cursor, 2);
  const row = state.observations[1].lanes.immediate;
  assert.equal(row.ready, 1);
  assert.equal(row.unsafeDown, true);
  assert.equal(row.journeys[3].outcome, 'INTERRUPTED');
  assert.equal(row.journeys[3].completed, false);
  assert.equal(row.journeys[3].httpStatus, null);
  assert.equal(row.journeys[3].stateCorrect, true);
  assert.match(row.journeys[3].reasons.join(' '), /unfinished continuation/);
});

test('requested scale-out is not ready capacity and queued clients exceed the original budget', () => {
  let state = model.initial();
  for (let count = 0; count < 3; count += 1) state = step(state);
  assert.equal(state.cursor, 3);
  const row = state.observations[2].lanes.immediate;
  assert.equal(row.target, 2);
  assert.equal(row.ready, 1);
  assert.deepEqual(state.lanes.immediate.pending, { target: 2, readyAtWindow: 4 });
  assert.equal(row.queueRps, 80);
  assert.equal(row.journeys[0].latencyMs, 880);
  assert.equal(row.journeys[0].budgetMs, 250);
  assert.equal(row.journeys[0].outcome, 'INTERRUPTED');
});

test('suitable stabilization reduces changes, reversals and unsafe removals with no budget breach', () => {
  const summary = model.summarize(run());
  assert.equal(summary.verification.verdict, 'PASS');
  assert.equal(summary.lanes.immediate.requestedChanges, 9);
  assert.equal(summary.lanes.immediate.effectiveChanges, 9);
  assert.equal(summary.lanes.immediate.reversals, 8);
  assert.equal(summary.lanes.immediate.unsafeTransitions, 5);
  assert.equal(summary.lanes.immediate.interrupted, 21);
  assert.equal(summary.lanes.immediate.attempts, 40);
  assert.equal(summary.lanes.stabilized.requestedChanges, 0);
  assert.equal(summary.lanes.stabilized.interrupted, 0);
  assert.equal(summary.lanes.stabilized.uninterrupted, 40);
  assert.equal(summary.lanes.stabilized.maxLatencyMs, 80);
  assert.equal(summary.lanes.stabilized.userOutcome, 'UNINTERRUPTED');
});

test('short stabilization with zero cooldown reproduces the disruptive comparator', () => {
  const state = run(model.reduce(model.initial(), configure({ stabilizationWindows: 1, cooldownWindows: 0 })));
  const summary = model.summarize(state);
  assert.equal(summary.verification.verdict, 'FAIL');
  assert.deepEqual(summary.lanes.stabilized, summary.lanes.immediate);
});

test('rebound pattern permits a safe settled scale-in and then observes replacement readiness', () => {
  const state = run(model.reduce(model.initial(), configure({ pattern: 'rebound' })));
  const summary = model.summarize(state);
  assert.equal(state.cursor, 10);
  assert.deepEqual(state.observations.map((entry) => entry.demandRps), [180, 60, 180, 60, 60, 60, 180, 180, 180, 180]);
  assert.equal(state.observations[4].lanes.stabilized.ready, 1);
  assert.equal(state.observations[4].lanes.stabilized.unsafeDown, false);
  assert.equal(state.observations[6].lanes.stabilized.decision, 'SCALE_OUT_REQUESTED');
  assert.equal(state.observations[7].lanes.stabilized.ready, 2);
  assert.equal(summary.verification.verdict, 'FAIL');
});

test('excessive cooldown cannot earn a pass merely by reducing capacity changes', () => {
  const state = run(model.reduce(model.initial(), configure({ pattern: 'rebound', cooldownWindows: 4 })));
  const summary = model.summarize(state);
  assert.equal(summary.verification.verdict, 'FAIL');
  assert.equal(state.observations[6].lanes.stabilized.decision, 'COOLDOWN');
  assert.equal(state.observations[6].lanes.stabilized.cooldownRemaining, 2);
  assert.ok(summary.lanes.stabilized.requestedChanges < summary.lanes.immediate.requestedChanges);
  assert.equal(summary.lanes.stabilized.interrupted, 12);
  assert.equal(state.observations[9].lanes.stabilized.journeys[0].outcome, 'UNINTERRUPTED');
});

test('four low windows of stabilization avoid the rebound scale-in altogether', () => {
  const summary = model.summarize(run(model.reduce(model.initial(), configure({
    pattern: 'rebound', stabilizationWindows: 4
  }))));
  assert.equal(summary.verification.verdict, 'PASS');
  assert.equal(summary.lanes.stabilized.requestedChanges, 0);
  assert.equal(summary.lanes.stabilized.uninterrupted, 40);
});

test('larger demand explicitly exposes warm-up overload rather than inferring success', () => {
  let state = model.reduce(model.initial(), configure({ highRps: 360 }));
  state = step(state);
  assert.equal(state.cursor, 1);
  assert.equal(state.lanes.stabilized.ready, 2);
  assert.deepEqual(state.lanes.stabilized.pending, { target: 4, readyAtWindow: 2 });
  assert.equal(state.observations[0].lanes.stabilized.queueRps, 160);
  assert.equal(model.summarize(state).verification.verdict, 'FAIL');
  state = step(state);
  assert.equal(state.observations[1].lanes.stabilized.ready, 4);
  assert.equal(model.summarize(state).lanes.stabilized.interrupted, 4);
});

test('readiness failure is retained, no failed request fabricates ready capacity', () => {
  let state = model.reduce(model.initial(), configure({ highRps: 360 }));
  state = step(state);
  state = step(state, 'readiness-failed');
  assert.equal(state.cursor, 2);
  assert.equal(state.observations[1].lanes.stabilized.decision, 'READINESS_FAILED');
  assert.equal(state.lanes.stabilized.ready, 2);
  assert.equal(state.lanes.stabilized.pending, null);
  assert.equal(model.summarize(state).lanes.stabilized.readinessFailures, 1);
  state = run(state);
  assert.equal(model.summarize(state).verification.verdict, 'FAIL');
  assert.equal(model.summarize(state).lanes.stabilized.readinessFailures, 1);
});

test('missing client evidence is null and permanently unknown after later recovery', () => {
  let state = step(model.initial(), 'missing-client');
  assert.equal(state.cursor, 1);
  const journey = state.observations[0].lanes.stabilized.journeys[0];
  assert.equal(journey.completed, null);
  assert.equal(journey.latencyMs, null);
  assert.equal(journey.outcome, 'UNKNOWN');
  state = run(state);
  const summary = model.summarize(state);
  assert.equal(summary.verification.verdict, 'UNKNOWN');
  assert.equal(summary.lanes.stabilized.unknown, 1);
  assert.equal(summary.lanes.stabilized.uninterrupted, 39);
});

test('unknown effective capacity blocks decisions and makes all four clients unknown', () => {
  const state = step(model.initial(), 'capacity-unknown');
  assert.equal(state.cursor, 1);
  const row = state.observations[0].lanes.stabilized;
  assert.equal(row.ready, null);
  assert.equal(row.queueRps, null);
  assert.equal(row.decision, 'CAPACITY_UNKNOWN');
  assert.equal(state.lanes.stabilized.ready, 2);
  assert.equal(model.summarize(state).lanes.stabilized.currentReady, null);
  assert.equal(model.summarize(state).lanes.stabilized.unknown, 4);
  assert.equal(model.summarize(run(state)).verification.verdict, 'UNKNOWN');
});

test('HTTP 200 and a completed request do not override incorrect business state', () => {
  const state = step(model.initial(), 'state-loss');
  assert.equal(state.cursor, 1);
  const journey = state.observations[0].lanes.stabilized.journeys[0];
  assert.equal(journey.httpStatus, 200);
  assert.equal(journey.completed, true);
  assert.equal(journey.stateCorrect, false);
  assert.equal(journey.outcome, 'INTERRUPTED');
  assert.equal(model.summarize(state).verification.verdict, 'FAIL');
});

test('known failures take precedence over unknowns without deleting uncertainty', () => {
  let state = model.reduce(model.initial(), configure({ highRps: 360 }));
  state = step(state, 'missing-client');
  assert.equal(state.cursor, 1);
  const summary = model.summarize(state);
  assert.equal(summary.verification.verdict, 'FAIL');
  assert.equal(summary.lanes.stabilized.unknown, 1);
  assert.equal(summary.lanes.stabilized.interrupted, 3);
});

test('configuration at equivalent low capacity cannot falsely demonstrate an improvement', () => {
  const summary = model.summarize(run(model.reduce(model.initial(), configure({ lowRps: 20, highRps: 100 }))));
  assert.equal(summary.verification.verdict, 'NOT_DEMONSTRATED');
  assert.equal(summary.lanes.stabilized.interrupted, 0);
});

test('latency budget is explicit, inclusive and never silently increased', () => {
  const state = step(model.reduce(model.initial(), configure({ budgetMs: 80 })));
  assert.equal(state.cursor, 1);
  assert.equal(state.observations[0].lanes.stabilized.journeys[0].outcome, 'UNINTERRUPTED');
  assert.equal(state.observations[0].lanes.stabilized.journeys[0].budgetMs, 80);
});

test('canonical decimal whole-number form strings are accepted without coercing malformed input', () => {
  const state = model.reduce(model.initial(), configure({
    lowRps: '60', highRps: '180', stabilizationWindows: '3', cooldownWindows: '0', budgetMs: '250'
  }));
  assert.equal(state.lastResult.verdict, 'CONFIGURED');
  assert.equal(state.config.stabilizationWindows, 3);
  assert.equal(state.config.cooldownWindows, 0);
});

for (const [label, values] of [
  ['blank', { lowRps: '' }], ['whitespace', { highRps: ' 180' }],
  ['fraction', { highRps: '180.5' }], ['exponent', { highRps: '2e2' }],
  ['leading zero', { lowRps: '060' }], ['NaN', { highRps: NaN }],
  ['infinity', { highRps: Infinity }], ['boolean', { cooldownWindows: true }],
  ['low underflow', { lowRps: 19 }], ['high overflow', { highRps: 401 }],
  ['stabilization underflow', { stabilizationWindows: 0 }], ['cooldown overflow', { cooldownWindows: 6 }],
  ['budget underflow', { budgetMs: 79 }], ['reversed demand', { lowRps: 180, highRps: 100 }],
  ['unsupported pattern', { pattern: 'native-azure' }], ['extra configuration field', { region: 'unapproved' }]
]) {
  test(`invalid ${label} is rejected and retained without changing the configured fixture`, () => {
    const original = model.initial();
    const state = model.reduce(original, configure(values));
    assert.equal(state.lastResult.verdict, 'INVALID');
    assert.deepEqual(state.config, original.config);
    assert.deepEqual(state.lanes, original.lanes);
    assert.equal(state.observations.length, 0);
    assert.equal(state.events.length, 1);
    assert.deepEqual(original, model.initial());
  });
}

test('unknown, null, extra-key and unsupported observation commands are bounded rejections', () => {
  for (const event of [null, {}, { type: 'native-scale' }, { type: 'step', condition: 'imaginary' },
    { type: 'step', condition: 'complete', native: true }]) {
    const state = model.reduce(model.initial(), event);
    assert.equal(state.lastResult.verdict, 'INVALID');
    assert.equal(state.cursor, 0);
    assert.equal(state.events.length, 1);
  }
});

test('configuration is locked after observations and previous failures remain intact', () => {
  const state = step(model.initial(), 'state-loss');
  const next = model.reduce(state, configure({ highRps: 360 }));
  assert.equal(next.lastResult.verdict, 'INVALID');
  assert.deepEqual(next.config, state.config);
  assert.deepEqual(next.observations, state.observations);
  assert.equal(model.summarize(next).verification.verdict, 'FAIL');
});

test('finished trace rejects further samples and preserves all forty lane attempts', () => {
  const state = run();
  const next = step(state);
  assert.equal(next.lastResult.verdict, 'LIMIT');
  assert.deepEqual(next.observations, state.observations);
  assert.equal(model.summarize(next).lanes.stabilized.attempts, 40);
});

test('forty-command limit throws before deleting or appending any retained evidence', () => {
  let state = model.initial();
  for (let count = 0; count < 40; count += 1) state = model.reduce(state, { type: 'invalid' });
  const before = clone(state);
  assert.throws(() => step(state), /Command limit/);
  assert.deepEqual(state, before);
});

test('forged capacity, config, cursor, results, unknown fields and incomplete history are rejected', () => {
  const state = step(model.initial());
  for (const mutate of [
    (copy) => { copy.lanes.stabilized.ready = 99; },
    (copy) => { copy.config.budgetMs = 9999; },
    (copy) => { copy.cursor = 3; },
    (copy) => { copy.lastResult.verdict = 'PASS'; },
    (copy) => { copy.owner = 'other'; },
    (copy) => { copy.events = []; }
  ]) {
    const forged = clone(state);
    mutate(forged);
    assert.throws(() => step(forged), /Invalid rehearsal state/);
    assert.throws(() => model.summarize(forged), /Invalid rehearsal state/);
  }
});

test('forged client results cannot conceal an earlier interruption', () => {
  const state = step(model.initial(), 'state-loss');
  assert.equal(state.cursor, 1);
  const forged = clone(state);
  forged.observations[0].lanes.stabilized.journeys[0].outcome = 'UNINTERRUPTED';
  assert.throws(() => model.summarize(forged), /Invalid rehearsal state/);
});

test('non-object, cyclic and nonfinite states fail closed', () => {
  const cyclic = model.initial();
  cyclic.loop = cyclic;
  const nan = model.initial();
  nan.lanes.stabilized.ready = NaN;
  for (const state of [null, [], {}, cyclic, nan]) {
    assert.throws(() => model.reduce(state, { type: 'step', condition: 'complete' }), /Invalid rehearsal state/);
  }
});

test('reducers and summaries never mutate previously returned state or history', () => {
  const original = model.initial();
  const baseline = clone(original);
  const next = step(original);
  assert.equal(next.cursor, 1);
  model.summarize(next);
  assert.deepEqual(original, baseline);
  const before = clone(next);
  step(next);
  assert.deepEqual(next, before);
});
