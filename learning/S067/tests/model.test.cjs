'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../model.js');
const fixture = require('../fixture.js');
const settings = (changes = {}) => ({ ...fixture.defaults, ...changes });
const lagged = (changes = {}) => model.introduceLag(model.initial(), settings(changes));
const observed = (changes = {}) => model.read(lagged(changes));
const checked = (changes = {}, prediction = 'FAIL') => model.check(observed(changes), prediction);
const guard = (code) => (error) => error instanceof model.GuardError && error.code === code;

test('all 32 finite configurations obey an independent freshness oracle', () => {
  let count = 0;
  for (const lag of ['none', 'two', 'five', 'unknown']) {
    for (const freshness of ['current', 'two-ticks']) {
      for (const routing of ['reader-only', 'gated']) {
        for (const coverage of ['complete', 'missing']) {
          const label = JSON.stringify({ lag, freshness, routing, coverage });
          const readerVersion = { none: 12, two: 10, five: 7, unknown: null }[lag];
          const budget = freshness === 'current' ? 0 : 2;
          const minimum = 12 - budget;
          const selected = routing === 'gated' && (readerVersion === null || readerVersion < minimum)
            ? 'primary' : 'reader-1';
          const returned = coverage === 'missing' ? null : selected === 'primary' ? 12 : readerVersion;
          const gate = returned === null ? 'UNKNOWN' : returned < minimum ? 'FAIL' : 'PASS';
          const before = lagged({ lag, freshness, routing, coverage });
          const snapshot = JSON.stringify(before);
          const state = model.read(before);
          assert.equal(JSON.stringify(before), snapshot, `No transition mutation: ${label}`);
          assert.equal(state.result.selectedReader, selected, label);
          assert.equal(state.result.receivedVersion, returned, label);
          assert.equal(state.result.requiredVersion, minimum, label);
          assert.equal(state.result.gate, gate, label);
          assert.equal(state.result.observedLagTicks, returned === null ? null : 12 - returned, label);
          assert.equal(state.lagObservation.readerVersion, readerVersion, label);
          assert.equal(state.lagObservation.primaryVersion, 12, label);
          assert.equal(state.result.correct + state.result.failed + state.result.unknown, 1, label);
          assert.equal(state.result.correct, Number(gate === 'PASS'), label);
          assert.equal(state.result.failed, Number(gate === 'FAIL'), label);
          assert.equal(state.result.unknown, Number(gate === 'UNKNOWN'), label);
          assert.equal(state.result.impact, { PASS: 'CONTRACT_MET', FAIL: 'INTERRUPTED', UNKNOWN: 'UNVERIFIED' }[gate], label);
          assert.equal(state.history.length, 0, 'Reading does not auto-retain or award a learning check');
          const retained = model.check(state, gate);
          assert.equal(retained.prediction.matched, true);
          assert.deepEqual(retained.history[0].result, state.result);
          count += 1;
        }
      }
    }
  }
  assert.equal(count, 32);
});

test('configuration is exact, finite and cannot run getters or accept prototype tricks', () => {
  const invalidRecords = [
    null, undefined, [], '', 0, false, new Date(0),
    Object.create(fixture.defaults), Object.assign(Object.create(null), fixture.defaults),
    {}, { ...settings(), extra: true }, { lag: 'five', freshness: 'current', routing: 'reader-only' },
    { ...settings(), [Symbol('extra')]: 'no' },
  ];
  const initial = model.initial();
  const original = JSON.stringify(initial);
  for (const value of invalidRecords) {
    assert.throws(() => model.introduceLag(initial, value), guard('INVALID_CONFIG'));
    assert.equal(JSON.stringify(initial), original);
  }
  for (const field of Object.keys(fixture.defaults)) {
    for (const value of ['', ' ', '__proto__', 'constructor', '<img onerror=alert(1)>',
      null, undefined, true, 0, 2, NaN, [], {}, new String(fixture.defaults[field])]) {
      assert.throws(() => model.introduceLag(initial, { ...settings(), [field]: value }),
        (error) => guard('INVALID_INPUT')(error) && error.field === field);
      assert.equal(JSON.stringify(initial), original);
    }
  }
  let accessed = false;
  const accessor = settings();
  Object.defineProperty(accessor, 'lag', { get() { accessed = true; return 'five'; } });
  assert.throws(() => model.introduceLag(initial, accessor), guard('INVALID_INPUT'));
  assert.equal(accessed, false);
  assert.deepEqual(model.configuration(settings()), fixture.defaults);
});

test('forged or cloned states are rejected before any state getter is accessed', () => {
  let accessed = false;
  const forged = { get phase() { accessed = true; return 'lagged'; } };
  for (const value of [null, undefined, 0, '', [], {}, forged,
    JSON.parse(JSON.stringify(lagged())), { ...observed() }]) {
    for (const action of [
      () => model.introduceLag(value, settings()), () => model.read(value),
      () => model.check(value, 'PASS'), () => model.next(value),
    ]) assert.throws(action, guard('UNTRUSTED_STATE'));
  }
  assert.equal(accessed, false);
});

test('only the declared action is allowed in each phase and invalid transitions preserve proof', () => {
  const states = [model.initial(), lagged(), observed(), checked()];
  const actions = [
    ['configuring', (state) => model.introduceLag(state, settings())],
    ['lagged', (state) => model.read(state)],
    ['observed', (state) => model.check(state, 'FAIL')],
    ['checked', (state) => model.next(state)],
  ];
  for (const state of states) {
    const snapshot = JSON.stringify(state);
    for (const [phase, action] of actions) {
      if (state.phase === phase) assert.doesNotThrow(() => action(state));
      else assert.throws(() => action(state), guard('INVALID_PHASE'));
      assert.equal(JSON.stringify(state), snapshot);
    }
  }
});

test('all nested state, evidence, trace and history values are immutable', () => {
  const state = checked();
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) visit(child);
  };
  visit(state);
  assert.throws(() => { state.result.gate = 'PASS'; }, TypeError);
  assert.throws(() => { state.history[0].result.impact = 'CONTRACT_MET'; }, TypeError);
  assert.throws(() => { state.config.lag = 'none'; }, TypeError);
  assert.throws(() => state.trace.push('fake evidence'), TypeError);
  assert.throws(() => state.history.splice(0, 1), TypeError);
  assert.equal(state.history[0].result.gate, 'FAIL');
});

test('wrong predictions do not alter actual PASS, FAIL or UNKNOWN results', () => {
  for (const [changes, predicted, actual] of [
    [{}, 'PASS', 'FAIL'],
    [{ routing: 'gated' }, 'FAIL', 'PASS'],
    [{ lag: 'unknown' }, 'PASS', 'UNKNOWN'],
  ]) {
    const state = checked(changes, predicted);
    assert.equal(state.prediction.matched, false);
    assert.equal(state.result.gate, actual);
    assert.equal(state.history[0].result.gate, actual);
    assert.equal(state.history[0].predicted, predicted);
    assert.equal(state.history[0].matched, false);
  }
});

test('invalid prediction values preserve observed results and do not append history', () => {
  const state = observed();
  const original = JSON.stringify(state);
  for (const value of ['', 'pass', ' PASS', null, undefined, true, 1, {}, [], '<script>']) {
    assert.throws(() => model.check(state, value), guard('INVALID_PREDICTION'));
    assert.equal(JSON.stringify(state), original);
    assert.equal(state.history.length, 0);
  }
});

test('six checked attempts are retained exactly and a seventh attempt is blocked', () => {
  let state = model.initial();
  const expected = [];
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    assert.equal(state.attempt, attempt);
    state = model.check(model.read(model.introduceLag(state, settings())), 'FAIL');
    expected.push(state.history.at(-1));
    assert.deepEqual(state.history, expected);
    assert.equal(state.history.length, attempt);
    if (attempt < 6) {
      const previousHistory = state.history;
      state = model.next(state);
      assert.equal(state.history, previousHistory);
      assert.equal(state.result, null);
      assert.equal(state.config, null);
      assert.equal(state.lagObservation, null);
      assert.equal(state.prediction, null);
      assert.deepEqual(state.trace, []);
      assert.equal(state.phase, 'configuring');
    }
  }
  const preserved = JSON.stringify(state);
  assert.throws(() => model.next(state), guard('HISTORY_FULL'));
  assert.equal(JSON.stringify(state), preserved);
  assert.equal(state.history.length, 6);
});

test('explicit reset clears every phase and history without changing any prior snapshot', () => {
  for (const prior of [model.initial(), lagged(), observed(), checked()]) {
    const snapshot = JSON.stringify(prior);
    const reset = model.reset();
    assert.notEqual(reset, prior);
    assert.deepEqual(reset, model.initial());
    assert.equal(reset.history.length, 0);
    assert.equal(reset.result, null);
    assert.equal(reset.attempt, 1);
    assert.equal(JSON.stringify(prior), snapshot);
  }
});
