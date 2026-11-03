'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const m = require('./model.js');
const apply = (state, type, fields = {}) => m.reduce(state, { type, ...fields });
const configure = (demand = 4) => apply(m.initial(), 'configure', { demand });
const tick = (state, observation = 'healthy') => apply(state, 'tick', { observation });
const prepare = (demand = 4) => apply(configure(demand), 'prepare');
const ready = (demand = 4) => tick(tick(prepare(demand)));
const handedOff = (demand = 4) => apply(ready(demand), 'handoff');
const migrated = (demand = 4) => tick(handedOff(demand));
const execution = (state) => ({
  demand: state.demand, strategy: state.strategy, phase: state.phase,
  route: state.route, ready: state.observedReadyCapacity,
  progress: state.warmupProgress, handedOffAt: state.handedOffAt,
  targetFailed: state.targetFailed, windows: state.windows
});

test('loadable portable exports and exact synthetic fixture', () => {
  for (const name of ['initial', 'reduce', 'summarize']) assert.equal(typeof m[name], 'function');
  assert.equal(m.constants.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(m.initial().phase, 'IDLE');
  assert.equal(m.summarize(m.initial()).verification, 'NOT_RUN');
});

test('configuration accepts only the bounded applied demand', () => {
  for (const demand of [1, 4, 8, '1', '6', '8']) {
    const state = configure(demand);
    assert.equal(state.demand, Number(demand));
    assert.equal(state.events.length, 1);
    assert.equal(state.events[0].accepted, true);
  }
});

test('in-place restart records the unavailable window then observed larger service', () => {
  let state = apply(configure(), 'in-place');
  assert.equal(state.phase, 'RESIZING');
  assert.equal(state.route, 'unavailable');
  state = tick(state);
  assert.equal(state.windows[0]?.servingCapacity, 0);
  assert.equal(state.windows[0]?.interrupted, 4);
  assert.equal(state.phase, 'ACTIVE');
  assert.equal(state.route, 'target');
  state = tick(tick(state));
  const summary = m.summarize(state);
  assert.equal(summary.attempted, 12);
  assert.equal(summary.successful, 8);
  assert.equal(summary.interrupted, 4);
  assert.equal(summary.costCredits, 6);
  assert.equal(summary.observedReadyCapacity, 8);
  assert.equal(summary.verification, 'FAIL');
  assert.equal(summary.userImpact, 'interrupted');
});

test('parallel replacement warms separately before changing routing', () => {
  let state = prepare();
  assert.equal(state.phase, 'WARMING');
  state = tick(state);
  assert.equal(state.phase, 'WARMING');
  assert.equal(state.observedReadyCapacity, 0);
  assert.equal(state.windows[0]?.route, 'old');
  state = tick(state);
  assert.equal(state.phase, 'READY');
  assert.equal(state.observedReadyCapacity, 8);
  assert.equal(state.route, 'old');
  assert.equal(state.warmupProgress, 2);
  assert.equal(m.summarize(state).verification, 'INCOMPLETE');
});

test('handoff has no clock or cost and is not itself a successful journey', () => {
  const before = ready();
  const after = apply(before, 'handoff');
  assert.equal(after.route, 'target');
  assert.equal(after.handedOffAt, 10);
  assert.equal(after.windows.length, before.windows.length);
  assert.equal(m.summarize(after).costCredits, 6);
  assert.equal(m.summarize(after).verification, 'INCOMPLETE');
});

test('matched three-window comparison exposes continuity and retained-capacity cost', () => {
  const parallel = m.summarize(migrated());
  let inplace = apply(configure(), 'in-place');
  for (let index = 0; index < 3; index += 1) inplace = tick(inplace);
  const resized = m.summarize(inplace);
  assert.equal(parallel.verification, 'PASS');
  assert.equal(parallel.userImpact, 'uninterrupted-transition');
  assert.equal(parallel.attempted, 12);
  assert.equal(parallel.successful, 12);
  assert.equal(parallel.interrupted, 0);
  assert.equal(parallel.targetSuccessful, 4);
  assert.equal(parallel.costCredits, 9);
  assert.equal(parallel.oldRetained, true);
  assert.equal(parallel.elapsedSeconds, resized.elapsedSeconds);
  assert.equal(parallel.costCredits - resized.costCredits, 3);
});

test('warm-up overload remains failed despite later larger-capacity successes', () => {
  const summary = m.summarize(migrated(6));
  assert.equal(summary.attempted, 18);
  assert.equal(summary.successful, 14);
  assert.equal(summary.interrupted, 4);
  assert.equal(summary.targetSuccessful, 6);
  assert.equal(summary.verification, 'FAIL');
});

test('candidate failure safely aborts but cannot claim successful migration', () => {
  const state = tick(prepare(), 'target-failure');
  const summary = m.summarize(state);
  assert.equal(state.phase, 'ABORTED');
  assert.equal(state.route, 'old');
  assert.equal(state.observedReadyCapacity, 0);
  assert.equal(summary.successful, 4);
  assert.equal(summary.interrupted, 0);
  assert.equal(summary.verification, 'FAIL');
  assert.equal(summary.userImpact, 'safe-abort-before-exposure');
});

test('target failure after handoff records exposed client interruptions', () => {
  const state = tick(handedOff(), 'target-failure');
  assert.equal(state.phase, 'FAILED');
  assert.equal(state.route, 'target');
  assert.equal(m.summarize(state).interrupted, 4);
  assert.equal(m.summarize(state).verification, 'FAIL');
});

test('in-place target failure is not a safe parallel abort', () => {
  const state = tick(apply(configure(), 'in-place'), 'target-failure');
  assert.equal(state.phase, 'FAILED');
  assert.equal(m.summarize(state).userImpact, 'interrupted');
  assert.equal(m.summarize(state).oldRetained, false);
});

test('missing observation is null capacity and unknown outcomes, never zeros', () => {
  const state = tick(prepare(), 'missing');
  const summary = m.summarize(state);
  assert.equal(state.observedReadyCapacity, null);
  assert.equal(state.warmupProgress, 0);
  assert.equal(state.windows[0]?.servingCapacity, null);
  assert.equal(summary.effectiveServingCapacity, null);
  assert.equal(summary.attempted, 4);
  assert.equal(summary.successful, 0);
  assert.equal(summary.interrupted, 0);
  assert.equal(summary.unknown, 4);
  assert.equal(summary.verification, 'UNKNOWN');
  assert.equal(summary.userImpact, 'unknown');
});

test('healthy recovery never erases earlier unknown observations', () => {
  let state = tick(prepare(), 'missing');
  state = tick(tick(state));
  state = tick(apply(state, 'handoff'));
  const summary = m.summarize(state);
  assert.equal(summary.unknown, 4);
  assert.equal(summary.successful, 12);
  assert.equal(summary.targetSuccessful, 4);
  assert.equal(summary.verification, 'UNKNOWN');
});

test('a missing readiness refresh invalidates READY until it is observed again', () => {
  let state = tick(ready(), 'missing');
  assert.equal(state.phase, 'WARMING');
  state = apply(state, 'handoff');
  assert.equal(state.lastRejection?.code, 'BLOCKED');
  assert.equal(state.route, 'old');
  state = tick(state);
  assert.equal(state.phase, 'READY');
  assert.equal(state.observedReadyCapacity, 8);
});

test('unknown after handoff cannot silently move users back to old', () => {
  const state = tick(handedOff(), 'missing');
  assert.equal(state.route, 'target');
  assert.equal(state.phase, 'ACTIVE');
  assert.equal(m.summarize(state).verification, 'UNKNOWN');
});

test('known failure takes precedence over earlier unknown', () => {
  let state = tick(prepare(), 'missing');
  state = tick(state, 'target-failure');
  assert.equal(m.summarize(state).unknown, 4);
  assert.equal(m.summarize(state).verification, 'FAIL');
});

for (const demand of ['', ' ', '1.0', '1e0', '+1', '01', '-1', '9', 0, 9, 1.5,
  NaN, Infinity, null, undefined, true, [], {}, new Number(4)]) {
  test(`invalid demand ${String(demand)} cannot change execution and is retained`, () => {
    const before = m.initial();
    const after = apply(before, 'configure', { demand });
    assert.equal(after.lastRejection?.code, 'INVALID');
    assert.deepEqual(execution(after), execution(before));
    assert.equal(after.events.length, 1);
    assert.equal(after.events[0].accepted, false);
    assert.equal(m.summarize(after).commandStatus, 'INVALID');
  });
}

for (const command of [null, [], {}, { type: 'tick', observation: 'bogus' },
  { type: 'tick', observation: 0 }, { type: 'tick' }, { type: 'delete' },
  { type: 'prepare', extra: true }, { type: 'configure', demand: 4, extra: true },
  Object.assign(Object.create({ inherited: true }), { type: 'prepare' })]) {
  test(`malformed command ${JSON.stringify(command)} is a behavioral refusal`, () => {
    const before = prepare();
    const after = m.reduce(before, command);
    assert.equal(after.lastRejection?.code, 'INVALID');
    assert.deepEqual(execution(after), execution(before));
    assert.equal(after.events.at(-1)?.accepted, false);
  });
}

for (const stateFactory of [m.initial, prepare, () => tick(prepare()),
  () => tick(prepare(), 'missing'), () => tick(prepare(), 'target-failure')]) {
  test(`handoff guard refuses ${stateFactory.name || 'unready state'}`, () => {
    const before = stateFactory();
    const after = apply(before, 'handoff');
    assert.equal(after.lastRejection?.code, 'BLOCKED');
    assert.deepEqual(execution(after), execution(before));
  });
}

test('active configuration, duplicate start and terminal observation are blocked', () => {
  for (const command of [{ type: 'configure', demand: 8 }, { type: 'in-place' }, { type: 'prepare' }]) {
    const before = prepare();
    const after = m.reduce(before, command);
    assert.equal(after.lastRejection?.code, 'BLOCKED');
    assert.deepEqual(execution(after), execution(before));
  }
  const failed = tick(prepare(), 'target-failure');
  const after = tick(failed);
  assert.equal(after.lastRejection?.code, 'BLOCKED');
  assert.deepEqual(execution(after), execution(failed));
});

test('idle ticks do not invent work or cost', () => {
  const state = tick(m.initial());
  assert.equal(state.lastRejection?.code, 'BLOCKED');
  assert.equal(m.summarize(state).attempted, 0);
  assert.equal(m.summarize(state).costCredits, 0);
});

test('trusted immutable states reject forgery and nested mutation', () => {
  const state = migrated();
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.windows), true);
  assert.equal(Object.isFrozen(state.windows[0]), true);
  assert.throws(() => { state.windows[0].successful = 999; }, TypeError);
  assert.throws(() => { state.phase = 'READY'; }, TypeError);
  for (const forged of [null, {}, { ...state }, JSON.parse(JSON.stringify(state))]) {
    assert.throws(() => tick(forged), /trusted S017 state/);
    assert.throws(() => m.summarize(forged), /trusted S017 state/);
  }
});

test('window bound locks without losing or rewriting earlier proof', () => {
  let state = apply(configure(), 'in-place');
  for (let index = 0; index < m.constants.maxWindows; index += 1) state = tick(state);
  assert.equal(state.windows.length, 12);
  const before = execution(state);
  state = tick(state);
  assert.equal(state.lastRejection?.code, 'LIMIT');
  assert.equal(state.locked, true);
  assert.deepEqual(execution(state), before);
  assert.equal(tick(state), state);
});

test('command bound retains all 40 refusals and never silently prunes them', () => {
  let state = m.initial();
  for (let index = 0; index < m.constants.maxCommands; index += 1) state = apply(state, 'handoff');
  assert.equal(state.events.length, 40);
  assert.equal(state.locked, true);
  assert.equal(m.summarize(state).commandStatus, 'LIMIT');
  assert.equal(apply(state, 'prepare'), state);
});

test('outcome conservation and deterministic fixed-window costs across conditions', () => {
  for (const demand of [1, 4, 6, 8]) {
    for (const observation of ['healthy', 'missing', 'target-failure']) {
      const state = tick(prepare(demand), observation);
      const summary = m.summarize(state);
      assert.equal(summary.attempted, demand);
      assert.equal(summary.successful + summary.interrupted + summary.unknown, demand);
      assert.equal(summary.costCredits, 3);
      assert.deepEqual(state, tick(prepare(demand), observation));
    }
  }
});
