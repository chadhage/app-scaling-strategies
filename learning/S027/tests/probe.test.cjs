'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../probe.js');
const config = (fixture = 'error-500', prediction = 'HOLD') => ({ fixture, prediction });
const clone = (value) => JSON.parse(JSON.stringify(value));

test('500 is rejected on original status, not mistaken for readiness', () => {
  const result = model.evaluate(config());
  assert.equal(result.readiness, 'FAILURE');
  assert.equal(result.response.status, 500);
  assert.equal(result.decision, 'HOLD');
  assert.deepEqual(result.checks, { status: 'FAILURE', business: 'UNKNOWN' });
  assert.deepEqual(result.counts, { success: 0, failure: 1, unknown: 1 });
  assert.equal(result.verifier, 'PASS');
});

test('302 is rejected without following its Location', () => {
  const result = model.evaluate(config('redirect-302'));
  assert.equal(result.response.status, 302);
  assert.equal(result.response.location, '/sign-in');
  assert.equal(result.decision, 'HOLD');
  assert.match(result.trace.join('\n'), /not followed/);
  assert.deepEqual(result.counts, { success: 0, failure: 1, unknown: 1 });
});

test('200 with ready=true but wrong business identity fails', () => {
  const result = model.evaluate(config('misleading-200'));
  assert.equal(result.checks.business, 'FAILURE');
  assert.equal(result.response.status, 200);
  assert.equal(result.response.body.ready, true);
  assert.equal(result.response.body.profileId, 'wrong-profile');
  assert.equal(result.decision, 'HOLD');
  assert.deepEqual(result.counts, { success: 1, failure: 1, unknown: 0 });
});

test('incorrect ADMIT prediction cannot override the gate', () => {
  const result = model.evaluate(config('misleading-200', 'ADMIT'));
  assert.equal(result.verifier, 'FAIL');
  assert.equal(result.readiness, 'FAILURE');
  assert.equal(result.decision, 'HOLD');
});

test('positive control requires the exact status and business payload', () => {
  const result = model.evaluate(config('ready-200', 'ADMIT'));
  assert.deepEqual(result.response.body, {
    ready: true, candidate: 'candidate-v2', profileId: 'training-profile',
  });
  assert.equal(result.readiness, 'SUCCESS');
  assert.equal(result.decision, 'ADMIT');
  assert.equal(result.verifier, 'PASS');
  assert.deepEqual(result.counts, { success: 2, failure: 0, unknown: 0 });
  assert.equal(result.syntheticUsersMoved, 0);
  assert.equal(result.realJourneys, 'UNMEASURED');
});

test('a wrong HOLD prediction also fails without rewriting eligibility', () => {
  const result = model.evaluate(config('ready-200', 'HOLD'));
  assert.equal(result.verifier, 'FAIL');
  assert.equal(result.decision, 'ADMIT');
  assert.match(result.trace.join('\n'), /eligibility only/);
});

test('missing business evidence is UNKNOWN, not a health-only success', () => {
  const result = model.evaluate(config('unobserved-200'));
  assert.equal(result.readiness, 'UNKNOWN');
  assert.equal(result.decision, 'HOLD');
  assert.deepEqual(result.checks, { status: 'SUCCESS', business: 'UNKNOWN' });
  assert.deepEqual(result.counts, { success: 1, failure: 0, unknown: 1 });
});

test('all finite fixture/prediction pairs obey strict AND and deterministic accounting', () => {
  for (const fixture of ['error-500', 'redirect-302', 'misleading-200', 'ready-200', 'unobserved-200']) {
    for (const prediction of ['HOLD', 'ADMIT']) {
      const result = model.evaluate(config(fixture, prediction));
      const admit = result.checks.status === 'SUCCESS' && result.checks.business === 'SUCCESS';
      assert.equal(result.decision, admit ? 'ADMIT' : 'HOLD');
      assert.equal(result.verifier, prediction === result.decision ? 'PASS' : 'FAIL');
      assert.equal(result.counts.success + result.counts.failure + result.counts.unknown, 2);
      assert.deepEqual(model.evaluate(config(fixture, prediction)), result);
      assert.match(result.trace.join('\n'), /synthetic/i);
    }
  }
});

test('invalid finite inputs and extra or missing keys fail closed', () => {
  for (const bad of [
    config('200'), config('ready-200', 'admit'), config('ready-200', true),
    { fixture: 'ready-200' }, { ...config(), bypass: true },
    [], null, 'ready-200', { fixture: 200, prediction: 'HOLD' },
  ]) {
    assert.throws(() => model.evaluate(bad), /config|fixture|prediction/i);
  }
});

test('getters, prototypes, symbols and non-enumerable config keys are rejected unread', () => {
  let getterCalls = 0;
  const getter = { prediction: 'HOLD' };
  Object.defineProperty(getter, 'fixture', { enumerable: true, get() { getterCalls++; return 'ready-200'; } });
  const inherited = Object.assign(Object.create(config()), config());
  const symbol = { ...config(), [Symbol('bypass')]: true };
  const hidden = config();
  Object.defineProperty(hidden, 'bypass', { value: true });
  for (const bad of [getter, inherited, symbol, hidden]) {
    assert.throws(() => model.evaluate(bad), /config/i);
  }
  assert.equal(getterCalls, 0);
});

test('configure increments revisions only for changed exact settings', () => {
  const initial = model.createSession();
  const next = model.configure(initial, config('misleading-200'));
  assert.equal(next.revision, 1);
  assert.deepEqual(next.config, config('misleading-200'));
  assert.equal(initial.revision, 0);
  assert.deepEqual(initial.config, config());
  const unchanged = model.configure(next, config('misleading-200'));
  assert.deepEqual(unchanged, next);
  assert.notEqual(unchanged, next);
});

test('conduct records canonical configuration, trace, counts and failed answers', () => {
  const state = model.configure(model.createSession(), config('misleading-200', 'ADMIT'));
  const result = model.conduct(state);
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].run, 1);
  assert.equal(result.history[0].revision, 1);
  assert.deepEqual(result.history[0].config, state.config);
  assert.deepEqual(result.history[0].result, model.evaluate(state.config));
  assert.equal(result.history[0].result.verifier, 'FAIL');
  assert.equal(state.history.length, 0);
});

test('changed settings invalidate the current revision but retain earlier failures and unknowns', () => {
  const failed = model.conduct(model.createSession());
  const changed = model.configure(failed, config('unobserved-200'));
  const checked = model.conduct(changed);
  assert.equal(checked.history.length, 2);
  assert.equal(checked.history[0].result.readiness, 'FAILURE');
  assert.equal(checked.history[1].result.readiness, 'UNKNOWN');
  assert.ok(checked.history[0].revision < checked.revision);
  assert.equal(checked.history[1].revision, checked.revision);
});

test('eight checks fit and the ninth rejects without eviction or input mutation', () => {
  let state = model.createSession();
  for (let i = 0; i < 8; i++) state = model.conduct(state);
  assert.equal(state.history.length, 8);
  const before = clone(state);
  assert.throws(() => model.conduct(state), /eight|8|limit/i);
  assert.deepEqual(state, before);
  assert.deepEqual(state.history.map((row) => row.run), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('32 changed settings fit, unchanged is allowed, change 33 rejects', () => {
  let state = model.createSession();
  for (let i = 0; i < 32; i++) {
    state = model.configure(state, config(i % 2 ? 'error-500' : 'misleading-200'));
  }
  assert.equal(state.revision, 32);
  assert.deepEqual(model.configure(state, state.config), state);
  assert.throws(() => model.configure(state, config('ready-200')), /32|limit/i);
});

test('corrupt session identity, bounds and top-level shape are rejected', () => {
  for (const patch of [
    { schemaVersion: 2 }, { revision: -1 }, { revision: 0.5 }, { revision: '0' },
    { revision: 33 }, { history: {} }, { extra: true }, { config: config('no-fixture') },
  ]) {
    const bad = { ...model.createSession(), ...patch };
    assert.throws(() => model.conduct(bad), /session|revision|history|config|fixture/i);
    assert.throws(() => model.configure(bad, config()), /session|revision|history|config|fixture/i);
  }
});

test('forged history gates, metrics, identity and trace are rejected', () => {
  const state = model.conduct(model.createSession());
  assert.equal(state.history.length, 1);
  for (const mutate of [
    (row) => { row.run = 2; },
    (row) => { row.revision = 1; },
    (row) => { row.result.decision = 'ADMIT'; },
    (row) => { row.result.counts.success = 2; },
    (row) => { row.result.trace = []; },
    (row) => { row.result.response.status = 200; },
    (row) => { row.config.fixture = 'ready-200'; },
    (row) => { row.result.syntheticUsersMoved = 4; },
  ]) {
    const bad = clone(state);
    mutate(bad.history[0]);
    assert.throws(() => model.conduct(bad), /history|revision|result|config/i);
  }
});

test('sparse, decorated and accessor histories reject before reading getters', () => {
  const sparse = model.createSession();
  sparse.history = new Array(1);
  const decorated = model.createSession();
  decorated.history.extra = true;
  let calls = 0;
  const accessor = model.createSession();
  accessor.history = new Array(1);
  Object.defineProperty(accessor.history, '0', { enumerable: true, get() { calls++; return {}; } });
  for (const bad of [sparse, decorated, accessor]) {
    assert.throws(() => model.conduct(bad), /history/i);
  }
  assert.equal(calls, 0);
});

test('history revisions cannot go backward or contradict current settings', () => {
  let state = model.conduct(model.createSession());
  state = model.conduct(model.configure(state, config('misleading-200')));
  assert.equal(state.history.length, 2);
  const backward = clone(state);
  backward.history[0].revision = 1;
  backward.history[1].revision = 0;
  assert.throws(() => model.conduct(backward), /history|revision/i);
  const currentMismatch = clone(state);
  currentMismatch.config = config('ready-200');
  assert.throws(() => model.conduct(currentMismatch), /history|config/i);
});

test('snapshots are independent and reset creates a clean bounded session', () => {
  const original = model.conduct(model.createSession());
  assert.equal(original.history.length, 1);
  const next = model.conduct(original);
  next.history[0].result.trace[0] = 'tampered';
  assert.notEqual(original.history[0].result.trace[0], 'tampered');
  const fresh = model.createSession();
  assert.equal(fresh.history.length, 0);
  assert.equal(fresh.revision, 0);
  assert.deepEqual(fresh.config, config());
  assert.equal(model.validateSession(fresh), true);
});
