'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('./model.js');
const apply = (state, overrides = {}) => model.reduce(state, { type: 'apply', ...model.DEFAULTS, ...overrides });
const tick = (state, times = 1) => {
  for (let count = 0; count < times; count += 1) state = model.reduce(state, { type: 'tick' });
  return state;
};
const observe = (state) => model.reduce(state, { type: 'observe' });
const scaled = (overrides = {}) => tick(apply(model.initial(), overrides), 4);

test('initial state has separate unobserved user and unrun verifier results', () => {
  const state = model.initial();
  assert.equal(state.capacity.confirmedReady, 2);
  assert.equal(model.summarize(state).users.verdict, 'NOT_OBSERVED');
  assert.equal(model.summarize(state).verification.verdict, 'NOT_RUN');
  assert.equal(state.journeys.length, 0);
});

for (const fixture of [
  { name: 'CPU', cpuUnits: 140, memoryUnits: 100, metric: 'cpuPct', expected: 46.67 },
  { name: 'memory', cpuUnits: 40, memoryUnits: 150, metric: 'memoryPct', expected: 50 }
]) {
  test(`${fixture.name} threshold is inclusive and requires two consecutive windows`, () => {
    let state = tick(apply(model.initial(), { cpuUnits: fixture.cpuUnits, memoryUnits: fixture.memoryUnits }));
    assert.equal(state.breachStreak, 1);
    assert.equal(state.capacity.requested, 2);
    state = tick(state);
    assert.equal(state.capacity.requested, 3);
    assert.equal(state.capacity.confirmedReady, 2);
    assert.equal(state.observations.at(-1)?.decision, 'SCALE_OUT_REQUESTED');
    assert.equal(state.transitions.length, 1);
  });

  test(`${fixture.name} demand is diluted only by effective ready capacity`, () => {
    let state = tick(apply(model.initial(), { cpuUnits: fixture.cpuUnits, memoryUnits: fixture.memoryUnits }), 3);
    assert.equal(state.capacity.confirmedReady, 2);
    assert.equal(state.transitions.length, 1, 'warm-up must not create duplicate scale requests');
    state = tick(state);
    assert.equal(state.capacity.confirmedReady, 3);
    assert.equal(state.transitions[0]?.status, 'READY');
    assert.equal(state.transitions[0]?.readyAt, 40);
    assert.equal(state.observations.at(-1)?.[fixture.metric], fixture.expected);
    assert.equal(model.summarize(state).users.verdict, 'NOT_OBSERVED');
    assert.equal(model.summarize(state).verification.verdict, 'INCOMPLETE');
  });
}

test('below-threshold demand does not trigger or count as a transition', () => {
  const state = tick(apply(model.initial(), { cpuUnits: 139, memoryUnits: 149 }), 8);
  assert.equal(state.observations.length, 8);
  assert.equal(state.transitions.length, 0);
  assert.equal(state.breachStreak, 0);
  assert.equal(state.observations.at(-1)?.decision, 'NO_BREACH');
});

test('changing demand restarts the consecutive evaluation, not the existing history', () => {
  let state = tick(model.initial());
  state = apply(state, { cpuUnits: 10 });
  state = tick(state);
  assert.equal(state.observations.length, 2);
  assert.equal(state.breachStreak, 0);
  assert.equal(state.capacity.requested, 2);
});

test('complete baseline/warming/post-scale exercise passes only with actual synthetic journey samples', () => {
  let state = observe(model.initial());
  state = observe(tick(state, 2));
  state = observe(tick(state, 2));
  const summary = model.summarize(state);
  assert.equal(summary.users.attempts, 30);
  assert.equal(summary.users.uninterrupted, 30);
  assert.equal(summary.users.interrupted, 0);
  assert.equal(summary.transition.baselineSamples, 10);
  assert.equal(summary.transition.warmingSamples, 10);
  assert.equal(summary.transition.postScaleSamples, 10);
  assert.ok(summary.transition.addedInstanceSamples > 0);
  assert.equal(summary.verification.verdict, 'PASS');
});

test('post-scale samples alone do not prove a transition-window exercise', () => {
  const summary = model.summarize(observe(scaled()));
  assert.equal(summary.users.uninterrupted, 10);
  assert.equal(summary.verification.verdict, 'INCOMPLETE');
});

test('premature saturation and queuing produce measured over-budget journeys', () => {
  let state = apply(model.initial(), { cpuUnits: 260, offeredRps: 260 });
  state = observe(tick(state));
  const summary = model.summarize(state);
  assert.equal(summary.capacity.saturationWindows, 1);
  assert.equal(summary.users.interrupted, 10);
  assert.equal(summary.users.verdict, 'INTERRUPTED');
  assert.ok(state.journeys.every((item) => item.queueRps === 60 && item.latencyMs > 250));
  assert.equal(summary.verification.verdict, 'FAIL');
});

test('memory saturation affects the deterministic journey budget as well as rule observations', () => {
  const state = observe(tick(apply(model.initial(), { cpuUnits: 20, memoryUnits: 210 })));
  assert.equal(state.observations.at(-1)?.memoryPct, 100);
  assert.equal(model.summarize(state).users.interrupted, 10);
});

test('saturation without client samples never invents interrupted or successful users', () => {
  const summary = model.summarize(tick(apply(model.initial(), { cpuUnits: 260 })));
  assert.equal(summary.capacity.saturationWindows, 1);
  assert.equal(summary.users.attempts, 0);
  assert.equal(summary.users.verdict, 'NOT_OBSERVED');
  assert.equal(summary.verification.verdict, 'FAIL');
});

test('restoring healthy input never erases earlier client failures', () => {
  let state = observe(apply(model.initial(), { cpuUnits: 260, offeredRps: 260 }));
  const failed = JSON.stringify(state.journeys);
  state = observe(tick(apply(state), 4));
  const summary = model.summarize(state);
  assert.equal(summary.users.interrupted, 10);
  assert.equal(summary.users.uninterrupted, 10);
  assert.equal(JSON.stringify(state.journeys.slice(0, 10)), failed);
  assert.equal(summary.verification.verdict, 'FAIL');
});

test('HTTP 200 plus incorrect state and duplicate effects is an interruption', () => {
  const state = observe(apply(model.initial(), { fault: 'journey-failure' }));
  assert.equal(state.journeys[0]?.httpStatus, 200);
  assert.equal(state.journeys[0]?.effects, 2);
  assert.equal(state.journeys[0]?.stateCorrect, false);
  assert.equal(model.summarize(state).users.interrupted, 1);
  assert.equal(model.summarize(state).users.uninterrupted, 9);
});

test('one missing journey observation is UNKNOWN, not a successful attempt', () => {
  const state = observe(apply(model.initial(), { fault: 'journey-unknown' }));
  const summary = model.summarize(state);
  assert.equal(summary.users.attempts, 10);
  assert.equal(summary.users.unknown, 1);
  assert.equal(summary.users.uninterrupted, 9);
  assert.equal(state.journeys[0]?.latencyMs, null);
  assert.equal(state.journeys[0]?.completed, null);
  assert.equal(summary.verification.verdict, 'UNKNOWN');
});

test('zero offered load does not fabricate ten successes or an availability rate', () => {
  const state = observe(apply(model.initial(), { offeredRps: 0 }));
  assert.equal(state.lastResult.verdict, 'NOT_OBSERVED');
  assert.equal(state.journeys.length, 0);
});

test('missing metrics break a streak, preserve known capacity, and retain unknown evidence', () => {
  let state = tick(model.initial());
  state = tick(apply(state, { fault: 'metrics-unknown' }));
  assert.equal(state.observations.at(-1)?.decision, 'UNKNOWN');
  assert.equal(state.observations.at(-1)?.cpuPct, null);
  assert.equal(state.breachStreak, 0);
  assert.equal(model.summarize(state).capacity.effectiveReady, 2);
  state = observe(tick(apply(state), 4));
  assert.equal(model.summarize(state).users.uninterrupted, 10);
  assert.equal(model.summarize(state).verification.verdict, 'UNKNOWN');
});

test('missing capacity telemetry cannot complete warm-up or invent routed journeys', () => {
  let state = tick(model.initial(), 2);
  state = tick(apply(state, { fault: 'capacity-unknown' }), 3);
  assert.equal(model.summarize(state).capacity.effectiveReady, null);
  assert.equal(state.capacity.confirmedReady, 2);
  assert.equal(state.transitions[0]?.status, 'WARMING');
  assert.equal(state.observations.at(-1)?.readyObserved, null);
  state = observe(state);
  assert.equal(model.summarize(state).users.unknown, 10);
  assert.equal(model.summarize(state).users.uninterrupted, 0);
});

test('provisioning failure preserves requested intent without promoting effective capacity', () => {
  let state = tick(apply(model.initial(), { fault: 'provision-failure' }), 3);
  assert.equal(state.capacity.requested, 3);
  assert.equal(state.capacity.confirmedReady, 2);
  assert.equal(state.capacity.pending, null);
  assert.equal(state.transitions[0]?.status, 'FAILED');
  state = tick(apply(state), 4);
  assert.equal(state.capacity.confirmedReady, 3);
  assert.equal(model.summarize(state).transition.failed, 1);
  assert.equal(model.summarize(state).verification.verdict, 'FAIL');
});

test('a busy maximum pool is an explicit capacity limit, never an unbounded allocation', () => {
  const state = tick(apply(model.initial(), { cpuUnits: 600, memoryUnits: 400 }), 16);
  assert.equal(state.capacity.confirmedReady, 4);
  assert.equal(state.capacity.requested, 4);
  assert.equal(state.transitions.length, 2);
  assert.equal(state.observations.at(-1)?.decision, 'AT_LIMIT');
});

for (const [profile, expected] of [['http-slot-unsupported', 'UNSUPPORTED'], ['unverified-rule', 'UNKNOWN']]) {
  test(`${profile} rejects execution without fabricated capacity or client evidence`, () => {
    let state = apply(model.initial(), { profile });
    state = observe(tick(state, 4));
    assert.equal(state.lastResult.verdict, expected);
    assert.equal(state.capacity.confirmedReady, 2);
    assert.equal(state.observations.length, 0);
    assert.equal(state.journeys.length, 0);
    assert.equal(model.summarize(state).verification.verdict, expected);
  });
}

for (const overrides of [
  { cpuUnits: '' }, { cpuUnits: ' ' }, { cpuUnits: -1 }, { cpuUnits: 1201 }, { cpuUnits: 12.5 },
  { memoryUnits: NaN }, { offeredRps: Infinity }, { offeredRps: 1001 }, { offeredRps: true },
  { latencyBudgetMs: 79 }, { latencyBudgetMs: 1001 }, { profile: 'invented' }, { fault: 'invented' },
  { unexpected: 'extra' }
]) {
  test(`invalid input ${JSON.stringify(overrides)} does not advance or create observations`, () => {
    const state = apply(model.initial(), overrides);
    assert.equal(state.lastResult.verdict, 'INVALID');
    assert.equal(state.clockSeconds, 0);
    assert.equal(state.observations.length, 0);
    assert.equal(state.journeys.length, 0);
    assert.equal(state.capacity.requested, 2);
    assert.deepEqual(state.input, model.DEFAULTS);
  });
}

test('strict valid numeric form strings are normalized and recorded', () => {
  const state = apply(model.initial(), { cpuUnits: '140', memoryUnits: '150', offeredRps: '80', latencyBudgetMs: '250' });
  assert.equal(state.lastResult.verdict, 'APPLIED');
  assert.equal(state.input.cpuUnits, 140);
  assert.equal(state.input.offeredRps, 80);
  assert.equal(state.events.length, 1);
});

for (const event of [null, [], { type: 'teleport' }, { type: 'tick', extra: 1 }, { type: 'observe', extra: 1 }]) {
  test(`unknown/malformed operation ${JSON.stringify(event)} is rejected`, () => {
    const state = model.reduce(model.initial(), event);
    assert.equal(state.lastResult.verdict, 'INVALID');
    assert.equal(state.events.length, 1);
  });
}

test('reducers and summaries do not mutate inputs or earlier retained observations', () => {
  const before = tick(model.initial(), 2);
  const bytes = JSON.stringify(before);
  const next = observe(tick(before, 2));
  model.summarize(next);
  assert.equal(JSON.stringify(before), bytes);
  assert.equal(before.capacity.confirmedReady, 2);
  assert.equal(next.capacity.confirmedReady, 3);
  assert.equal(next.journeys.length, 10);
});

test('equal explicit event sequences produce byte-identical deterministic traces', () => {
  const conduct = () => observe(tick(observe(tick(observe(model.initial()), 2)), 2));
  assert.equal(JSON.stringify(conduct()), JSON.stringify(conduct()));
  assert.equal(conduct().events.length, 7);
});

test('event limit retains all 80 commands and blocks command 81 without changing evidence', () => {
  const full = tick(model.initial(), model.MAX_EVENTS);
  assert.equal(full.events.length, 80);
  const observations = JSON.stringify(full.observations);
  const blocked = observe(full);
  assert.equal(blocked.lastResult.verdict, 'LIMIT');
  assert.equal(blocked.events.length, 80);
  assert.equal(JSON.stringify(blocked.observations), observations);
  assert.equal(blocked.journeys.length, 0);
});
