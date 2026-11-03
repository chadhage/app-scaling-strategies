'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, LIMITS, createRehearsal, transition } = require('.\\scale-in.js');
const start = (overrides = {}) => transition(createRehearsal(), 'start', { ...DEFAULTS, ...overrides });
const step = (state, action, payload) => transition(state, action, payload);
const partition = (state) => {
  const m = state.metrics;
  assert.equal(m.succeeded + m.failed + m.unknown + m.pending, m.attempted);
  assert.equal(m.attempted, state.work.length);
  assert.ok(state.tick >= 0 && state.tick <= LIMITS.ticks);
  assert.ok(state.events.length <= LIMITS.actions);
  assert.ok(state.probes.length <= LIMITS.probes);
  assert.ok(state.archives.length <= LIMITS.archives);
  assert.ok(state.work.every((item) => item.admittedAt === 0 && item.deadline === state.config.workBudget));
  assert.equal(state.result.nativeOutcome, 'UNVERIFIED');
};

test('all supported duration boundaries preserve original deadlines, outcomes, and one-effect accounting', () => {
  for (const mechanism of ['drain', 'checkpoint']) {
    for (const duration of [1, 2, 4, 8]) {
      for (const budget of [1, duration, 12]) {
        let state = start({ mechanism, requestTicks: duration, jobTicks: duration, workBudget: budget, drainBudget: 10 });
        state = step(step(state, 'close-admission'), 'probe');
        if (mechanism === 'checkpoint') state = step(state, 'checkpoint');
        for (let tick = 0; tick < duration; tick++) {
          state = step(state, 'advance');
          partition(state);
        }
        state = step(step(state, 'retire'), 'probe');
        state = step(state, 'verify');
        partition(state);
        assert.equal(state.metrics.failed, duration > budget ? 2 : 0);
        assert.equal(state.metrics.succeeded, duration > budget ? 0 : 2);
        assert.equal(state.result.verifier, duration > budget ? 'FAIL' : 'PASS');
        assert.equal(state.work[1].effects, 1);
      }
    }
  }
});

test('fixed adversarial action sequences cannot rewrite historical observations', () => {
  const plans = [
    ['retire', 'close-admission', 'probe', 'retire', 'advance', 'checkpoint', 'advance', 'verify'],
    ['probe', 'advance', 'close-admission', 'checkpoint', 'checkpoint', 'probe', 'advance', 'retire'],
    ['close-admission', 'probe', 'advance', 'advance', 'retire', 'probe', 'advance', 'advance', 'verify']
  ];
  for (const mechanism of ['drain', 'checkpoint', 'opaque']) {
    for (const plan of plans) {
      let state = start({ mechanism });
      for (const action of plan) {
        const old = state;
        const bytes = JSON.stringify(old);
        state = step(old, action);
        partition(state);
        assert.equal(JSON.stringify(old), bytes);
        assert.deepEqual(state.events.slice(0, old.events.length), old.events);
      }
    }
  }
});

test('getters, inherited records, symbols, boxed values, and coercion are not configuration data', () => {
  let getterCalled = false;
  const getter = { ...DEFAULTS };
  Object.defineProperty(getter, 'jobTicks', { enumerable: true, get() { getterCalled = true; return 4; } });
  const symbol = { ...DEFAULTS, [Symbol('extra')]: 1 };
  const inherited = Object.create(DEFAULTS);
  const nullPrototype = Object.assign(Object.create(null), DEFAULTS);
  for (const value of [getter, symbol, inherited, nullPrototype, new Number(2), '2', 2, true]) {
    const state = step(createRehearsal(), 'start', value);
    assert.equal(state.lastAction.verdict, 'INVALID');
    assert.equal(state.metrics.attempted, 0);
  }
  assert.equal(getterCalled, false);
});

test('confirmation and action payload schemas reject surprises without triggering termination', () => {
  for (const payload of [undefined, null, true, { confirmed: 'true' }, { confirmed: 1 },
    { confirmed: true, extra: true }, []]) {
    const state = step(start(), 'force-retire', payload);
    assert.equal(state.lastAction.verdict, 'INVALID');
    assert.equal(state.actualCapacity, 2);
    assert.equal(state.metrics.pending, 2);
  }
  for (const action of ['close-admission', 'checkpoint', 'advance', 'probe', 'retire', 'verify', 'reset']) {
    const state = step(start(), action, null);
    assert.equal(state.lastAction.verdict, 'INVALID');
    assert.equal(state.tick, 0);
    assert.equal(state.actualCapacity, 2);
  }
});

test('repeated closure, checkpoint, and start cannot reset time or duplicate effects', () => {
  let state = start({ mechanism: 'checkpoint' });
  state = step(step(state, 'advance'), 'close-admission');
  state = step(state, 'checkpoint');
  state = step(state, 'close-admission');
  assert.equal(state.closedAt, 1);
  assert.equal(state.lastAction.verdict, 'BLOCKED');
  state = step(state, 'checkpoint');
  assert.equal(state.lastAction.verdict, 'BLOCKED');
  state = step(state, 'start', DEFAULTS);
  assert.equal(state.lastAction.verdict, 'BLOCKED');
  for (let n = 0; n < 6; n++) state = step(state, 'advance');
  assert.equal(state.work[1].deadline, 6);
  assert.equal(state.work[1].dueAt, 4);
  assert.equal(state.work[1].effects, 1);
  assert.equal(state.work.length, 2);
});

test('a late checkpoint cannot erase a known original-budget breach', () => {
  let state = start({ mechanism: 'checkpoint', requestTicks: 1, jobTicks: 8, workBudget: 2, drainBudget: 10 });
  state = step(step(state, 'close-admission'), 'probe');
  for (let n = 0; n < 3; n++) state = step(state, 'advance');
  state = step(state, 'checkpoint');
  assert.equal(state.work[1].checkpoint.progress, 3);
  assert.equal(state.work[1].deadline, 2);
  state = step(state, 'retire');
  for (let n = 0; n < 5; n++) state = step(state, 'advance');
  state = step(state, 'probe');
  assert.equal(state.metrics.failed, 1);
  assert.equal(state.result.verifier, 'FAIL');
  assert.equal(state.work[1].completedAt, 8);
});

test('known active work and unknown completed work are not conflated by a later fault', () => {
  let state = start({ condition: 'missing-completion' });
  state = step(step(state, 'advance'), 'advance');
  assert.equal(state.metrics.unknown, 1);
  state = step(state, 'force-retire', { confirmed: true });
  assert.equal(state.metrics.unknown, 1);
  assert.equal(state.metrics.failed, 1);
  assert.equal(state.result.workOutcome, 'INTERRUPTED');
  assert.equal(state.work[0].lifecycle, 'UNOBSERVED');
  assert.equal(state.work[1].lifecycle, 'LOST');
});

test('post-retirement stale route is rejected, not fabricated as admitted work', () => {
  let state = start({ condition: 'stale-routing' });
  state = step(step(state, 'close-admission'), 'probe');
  for (let n = 0; n < 4; n++) state = step(state, 'advance');
  state = step(state, 'force-retire', { confirmed: true });
  state = step(state, 'probe');
  assert.equal(state.probes.at(-1).owner, 'retiring-A');
  assert.equal(state.probes.at(-1).accepted, false);
  assert.equal(state.metrics.newToRetiring, 1);
  assert.equal(state.metrics.rejectedToRetiring, 1);
  assert.equal(state.metrics.attempted, 2);
  assert.equal(state.result.workOutcome, 'SUCCESS');
  assert.equal(state.result.verifier, 'FAIL');
});

test('probe and action saturation preserve the entire bounded prefix', () => {
  let state = start();
  for (let n = 0; n < 8; n++) state = step(state, 'probe');
  const probes = JSON.stringify(state.probes);
  state = step(state, 'probe');
  assert.equal(state.lastAction.verdict, 'LIMIT');
  assert.equal(JSON.stringify(state.probes), probes);
  for (let n = 0; n < 60; n++) state = step(state, 'verify');
  assert.equal(state.events.length, 48);
  const prefix = JSON.stringify(state.events);
  state = step(state, 'advance');
  assert.equal(state.lastAction.verdict, 'LIMIT');
  assert.equal(JSON.stringify(state.events), prefix);
  state = step(state, 'reset');
  assert.equal(state.archives.length, 1);
  assert.equal(JSON.stringify(state.archives[0].events), prefix);
  assert.equal(Object.isFrozen(state.archives[0].events[0].view.work[0]), true);
});
