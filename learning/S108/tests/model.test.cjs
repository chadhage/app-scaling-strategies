'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../model.js');

test('applying a mismatched policy records a pending comparison before observations', () => {
  const initial = model.createState();
  const before = JSON.stringify(initial);
  const applied = model.transition(initial, {
    type: 'apply', policy: 'journey-block', recovery: 'complete',
  });
  assert.equal(applied.phase, 'applied');
  assert.equal(applied.activePolicy, 'journey-block');
  assert.equal(applied.current.result, 'unknown');
  assert.equal(applied.history.length, 1);
  assert.equal(applied.history[0].action, 'apply');
  assert.equal(JSON.stringify(initial), before);
});

const apply = (state = model.createState(), policy = 'journey-block', recovery = 'complete') =>
  model.transition(state, { type: 'apply', policy, recovery });
const act = (state, type) => model.transition(state, { type });
const inspect = (policy, recovery = 'complete') => act(apply(model.createState(), policy, recovery), 'inspect');
const finish = (state, policy = 'journey-block', recovery = 'complete') => {
  let next = apply(state, policy, recovery);
  for (const type of ['inspect', 'restore', 'verify']) next = act(next, type);
  return next;
};
const clone = (value) => structuredClone(value);
const hasCode = (code) => (problem) => problem instanceof Error && problem.code === code;

test('the initial fixture and returned state are immutable, resource-free and bounded', () => {
  const state = model.createState();
  assert.deepEqual(model.availability(state), { apply: true, inspect: false, restore: false, verify: false });
  assert.equal(state.fixture, 's108-waf-fixture-v1');
  assert.equal(state.activePolicy, 'baseline-v1');
  assert.equal(state.stats.comparisons, 0);
  assert.deepEqual(model.config.limits, { comparisons: 4, history: 16 });
  assert.equal(model.config.route, 'training-candidate-route');
  assert.equal(model.config.requests.length, 3);
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.history));
  assert.ok(Object.isFrozen(model.config.requests[0]));
  assert.throws(() => { state.stats.positive = 1; }, TypeError);
  assert.throws(() => { model.config.limits.comparisons = 100; }, TypeError);
});

test('a valid API block interrupts a complete journey despite a successful page observation', () => {
  const state = inspect('journey-block');
  assert.equal(state.phase, 'inspected');
  assert.equal(state.current.result, 'negative');
  assert.deepEqual(state.current.requests.map((request) => request.status), [200, 403, 200]);
  assert.equal(state.current.requests[1].rule, 'POLICY-API');
  assert.equal(state.current.requests[1].authentication, 'valid-fictional-session');
  assert.equal(state.current.requests[1].route, model.config.route);
  assert.deepEqual(state.history[1].counts, {
    attempted: 3, allowed: 2, blocked: 1, unknown: 0,
    journeysAttempted: 1, journeysSuccessful: 0, journeysInterrupted: 1, journeysUnknown: 0,
    blockedJourneys: 1, blockedAssets: 0,
  });
  assert.equal(state.stats.negative, 1);
  assert.equal(state.stats.positive, 0);
});

test('a required asset block is detected even when both page and API are allowed', () => {
  const state = inspect('asset-block');
  assert.deepEqual(state.current.requests.map((request) => request.status), [200, 200, 403]);
  assert.equal(state.current.requests[2].rule, 'POLICY-ASSET');
  assert.equal(state.current.result, 'negative');
  assert.equal(state.stats.blockedJourneys, 0);
  assert.equal(state.stats.blockedAssets, 1);
  assert.equal(state.history[1].counts.journeysInterrupted, 1);
});

test('a complete matched observation is the only positive comparison fixture', () => {
  const state = inspect('matched');
  assert.equal(state.current.result, 'positive');
  assert.ok(state.current.requests.every((request) => request.status === 200 && request.rule === null));
  assert.equal(state.stats.positive, 1);
  assert.equal(state.history[1].counts.allowed, 3);
  assert.equal(state.history[1].counts.journeysSuccessful, 1);
  assert.equal(state.stats.recoveries, 0);
});

test('uninspected or missing observations are never counted as successful journeys', () => {
  const pending = apply(model.createState(), 'matched');
  assert.equal(pending.current.result, 'unknown');
  assert.equal(pending.current.requests, null);
  assert.equal(pending.stats.positive, 0);
  assert.equal(pending.stats.inspected, 0);
  assert.equal(pending.stats.pendingInspections, 1);
  assert.equal(pending.stats.unknown, 0, 'Pending and measured unknown are distinct');
  const missing = inspect('missing-observation');
  assert.equal(missing.current.result, 'unknown');
  assert.equal(missing.current.requests[2].status, null);
  assert.equal(missing.current.requests[2].rule, null);
  assert.equal(missing.stats.unknown, 1);
  assert.equal(missing.stats.positive, 0);
  assert.equal(missing.history[1].counts.unknown, 1);
  assert.equal(missing.history[1].counts.journeysUnknown, 1);
});

test('restoration alone cannot prove recovery and successful recovery retains the initial interruption', () => {
  const interrupted = inspect('journey-block');
  const original = JSON.stringify(interrupted.history);
  const restored = act(interrupted, 'restore');
  assert.equal(restored.activePolicy, 'baseline-v1');
  assert.equal(restored.current.recoveryResult, 'unknown');
  assert.equal(restored.current.recoveryRequests, null);
  assert.equal(restored.stats.recoveries, 0);
  assert.equal(restored.stats.pendingRecoveries, 1);
  const verified = act(restored, 'verify');
  assert.equal(verified.current.recoveryResult, 'positive');
  assert.equal(verified.current.result, 'negative');
  assert.equal(verified.stats.negative, 1);
  assert.equal(verified.stats.positive, 0);
  assert.equal(verified.stats.recoveryPositive, 1);
  assert.equal(JSON.stringify(verified.history.slice(0, 2)), original);
  assert.ok(verified.current.recoveryRequests.every((request) => request.status === 200));
  assert.equal(verified.history[3].counts.journeysSuccessful, 1);
});

test('a restored desired label cannot hide failed or unknown recovery observations', () => {
  for (const [fixture, expected] of [['blocked-asset', 'negative'], ['missing-asset', 'unknown']]) {
    const state = finish(model.createState(), 'asset-block', fixture);
    assert.equal(state.activePolicy, 'baseline-v1');
    assert.equal(state.current.recoveryResult, expected);
    assert.equal(state.stats.recoveryPositive, 0);
    assert.equal(state.stats[expected === 'negative' ? 'recoveryNegative' : 'recoveryUnknown'], 1);
    assert.equal(state.current.result, 'negative');
    assert.equal(state.stats.negative, 1);
  }
});

test('four deterministic comparisons preserve all sixteen events and cannot admit a fifth', () => {
  let state = model.createState();
  for (const policy of ['journey-block', 'asset-block', 'matched', 'missing-observation']) {
    state = finish(state, policy);
  }
  assert.equal(state.stats.comparisons, 4);
  assert.equal(state.stats.inspected, 4);
  assert.equal(state.stats.positive, 1);
  assert.equal(state.stats.negative, 2);
  assert.equal(state.stats.unknown, 1);
  assert.equal(state.stats.recoveryPositive, 4);
  assert.equal(state.history.length, 16);
  assert.deepEqual(state.history.map((event) => event.sequence), Array.from({ length: 16 }, (_, index) => index + 1));
  assert.ok(Object.values(model.availability(state)).every((allowed) => allowed === false));
  const before = JSON.stringify(state);
  assert.throws(() => apply(state), hasCode('ERR_S108_ACTION'));
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(model.createState(), model.createState(), 'Explicit reset creates a clean deterministic state');
});

test('the state machine rejects every out-of-order action without mutating prior state', () => {
  const initial = model.createState();
  const applied = apply(initial);
  const inspected = act(applied, 'inspect');
  const restored = act(inspected, 'restore');
  const verified = act(restored, 'verify');
  for (const [state, invalid] of [
    [initial, ['inspect', 'restore', 'verify']],
    [applied, ['apply', 'restore', 'verify']],
    [inspected, ['apply', 'inspect', 'verify']],
    [restored, ['apply', 'inspect', 'restore']],
    [verified, ['inspect', 'restore', 'verify']],
  ]) {
    const before = JSON.stringify(state);
    for (const type of invalid) {
      assert.throws(() => type === 'apply' ? apply(state) : act(state, type), hasCode('ERR_S108_ACTION'));
      assert.equal(JSON.stringify(state), before);
    }
  }
});

test('strict typed commands reject coercion, arbitrary rules, extra keys and exotic properties', () => {
  const valid = { type: 'apply', policy: 'journey-block', recovery: 'complete' };
  const getter = { policy: 'journey-block', recovery: 'complete' };
  Object.defineProperty(getter, 'type', { enumerable: true, get() { throw new Error('must not execute accessor'); } });
  const nonEnumerable = { ...valid };
  Object.defineProperty(nonEnumerable, 'policy', { value: 'journey-block', enumerable: false });
  const bad = [
    null, [], true, 1, 'apply', {}, getter, nonEnumerable, Object.create(valid),
    { ...valid, type: new String('apply') }, { ...valid, policy: 1 },
    { ...valid, policy: '' }, { ...valid, recovery: false },
    { ...valid, policy: '__proto__' }, { ...valid, recovery: 'constructor' },
    { ...valid, route: 'other-route' }, { ...valid, rule: 'operator-rule' },
    { ...valid, [Symbol('extra')]: true }, { type: 'inspect', policy: 'matched' },
    { type: 'restore', bypass: true }, { type: 'reset' },
  ];
  const state = model.createState();
  const before = JSON.stringify(state);
  for (const input of bad) {
    assert.throws(() => model.transition(state, input), hasCode('ERR_S108_INPUT'));
    assert.equal(JSON.stringify(state), before);
  }
});

test('canonical history replay rejects forged observations, counts and impossible states', () => {
  const valid = finish(model.createState(), 'asset-block');
  const changed = [
    (state) => { state.schemaVersion = '1'; },
    (state) => { state.fixture = 's108-waf-fixture-v2'; },
    (state) => { state.phase = 'ready'; },
    (state) => { state.activePolicy = 'asset-block'; },
    (state) => { state.stats.negative = 0; },
    (state) => { state.stats.positive = 1; },
    (state) => { state.current.result = 'positive'; },
    (state) => { state.current.requests[2].status = 200; },
    (state) => { state.history[1].requests[2].rule = null; },
    (state) => { state.history[1].counts.journeysInterrupted = 0; },
    (state) => { state.history[0].sequence = 0; },
    (state) => { state.history[0].sequence = -0; },
    (state) => { state.history[2].recoveryFixture = 'complete-other'; },
    (state) => { state.history[3].comparisonId = 2; },
    (state) => { state.history.reverse(); },
    (state) => { state.history.splice(1, 1); },
    (state) => { state.history.push(clone(state.history[3])); },
    (state) => { state.history[0].extra = true; },
    (state) => { state.stats.negative = NaN; },
    (state) => { state.stats.recoveries = Infinity; },
    (state) => { state.extra = null; },
  ];
  for (const alter of changed) {
    const state = clone(valid);
    alter(state);
    const before = JSON.stringify(state);
    assert.throws(() => apply(state), hasCode('ERR_S108_STATE'));
    assert.equal(JSON.stringify(state), before);
  }
  assert.throws(() => act(model.createState(), 'inspect'), hasCode('ERR_S108_ACTION'));
});

test('state data guards reject sparse or extended arrays, accessors, cycles and unsupported prototypes', () => {
  const invalid = [];
  const sparse = clone(apply());
  delete sparse.history[0];
  invalid.push(sparse);
  const extended = clone(apply());
  extended.history.extra = true;
  invalid.push(extended);
  const symbol = clone(apply());
  symbol.history[Symbol('extra')] = true;
  invalid.push(symbol);
  const hidden = clone(apply());
  Object.defineProperty(hidden.stats, 'hidden', { value: 1 });
  invalid.push(hidden);
  const accessor = clone(apply());
  Object.defineProperty(accessor, 'phase', { enumerable: true, get() { throw new Error('state accessor must not execute'); } });
  invalid.push(accessor);
  const cyclic = clone(apply());
  cyclic.current.loop = cyclic;
  invalid.push(cyclic);
  const prototype = clone(apply());
  Object.setPrototypeOf(prototype.stats, { injected: 1 });
  invalid.push(prototype);
  const long = clone(apply());
  long.fixture = 'x'.repeat(257);
  invalid.push(long);
  for (const state of [null, {}, [], new Date(), ...invalid]) {
    assert.throws(() => model.transition(state, { type: 'inspect' }), hasCode('ERR_S108_STATE'));
  }
});

test('valid serialized states replay exactly and remain independent of input object key order', () => {
  const state = apply();
  const reordered = Object.fromEntries(Object.entries(clone(state)).reverse());
  const inspected = act(reordered, 'inspect');
  assert.deepEqual(inspected, act(state, 'inspect'));
  const verified = finish(model.createState(), 'matched', 'missing-asset');
  assert.deepEqual(apply(JSON.parse(JSON.stringify(verified)), 'journey-block'), apply(verified, 'journey-block'));
  assert.ok(Object.isFrozen(inspected.history[1].requests[1]));
  assert.throws(() => { inspected.history[1].requests[1].status = 200; }, TypeError);
});
