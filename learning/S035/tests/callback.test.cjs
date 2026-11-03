'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('..\\callback.js');
const config = (changes = {}) => ({ ...model.DEFAULTS, ...changes });
function run(state = model.createLesson(), changes = {}) {
  return model.deliverCallback(model.cutover(model.startLogin(state, config(changes))));
}

test('default callback completes the original v1 login on v2 at 160 ms', () => {
  const result = run().history[0];
  assert.equal(result.outcome, 'SUCCESS');
  assert.equal(result.callbackVersion, 'v2');
  assert.equal(result.elapsedMs, 160);
  assert.equal(result.loginCompleted, true);
  assert.equal(result.correlationMatched, true);
  assert.equal(result.returnPath, '/training/home');
  assert.equal(result.redirectHops, 0);
  assert.equal(result.restartRequired, false);
  assert.deepEqual(result.counts, { success: 1, failure: 0, unknown: 0 });
  assert.equal(result.verifier, 'PASS');
});

test('trace crosses cutover once and preserves the original start and return path', () => {
  const result = run().history[0];
  assert.deepEqual(result.trace.map((event) => [event.atMs, event.version, event.event]), [
    [0, 'v1', 'login-start'], [40, 'v2', 'cutover'], [140, 'v2', 'callback-arrived'],
    [160, 'v2', 'login-complete'],
  ]);
  assert.equal(result.trace.at(-1).path, '/training/home');
});

test('v1-local correlation loss fails rather than silently restarting', () => {
  const result = run(undefined, { storeMode: 'v1-only', prediction: 'FAILURE' }).history[0];
  assert.equal(result.outcome, 'FAILURE');
  assert.deepEqual(result.reasons, ['STATE_LOST']);
  assert.equal(result.correlationMatched, false);
  assert.equal(result.loginCompleted, false);
  assert.equal(result.returnPath, null);
  assert.equal(result.restartRequired, true);
  assert.equal(result.verifier, 'PASS');
  assert.equal(result.trace.filter((event) => event.event === 'login-start').length, 1);
});

test('redirect loop is detected after exactly three synthetic hops', () => {
  const result = run(undefined, { callbackPath: 'redirect-loop', prediction: 'FAILURE' }).history[0];
  assert.equal(result.outcome, 'FAILURE');
  assert.deepEqual(result.reasons, ['REDIRECT_LOOP']);
  assert.equal(result.redirectHops, 3);
  assert.equal(result.trace.filter((event) => event.event === 'redirect').length, 3);
  assert.equal(result.elapsedMs, 200);
  assert.equal(result.loginCompleted, false);
  assert.equal(result.trace.at(-1).event, 'loop-stopped');
});

test('mismatched synthetic state is rejected without weakening validation', () => {
  const result = run(undefined, { callbackState: 'mismatch', prediction: 'FAILURE' }).history[0];
  assert.equal(result.outcome, 'FAILURE');
  assert.deepEqual(result.reasons, ['STATE_MISMATCH']);
  assert.equal(result.correlationMatched, false);
  assert.equal(result.loginCompleted, false);
  assert.equal(result.redirectHops, 0);
});

test('original latency budget is inclusive and never restarted at cutover', () => {
  const exact = run(undefined, { budgetMs: 160 }).history[0];
  assert.equal(exact.outcome, 'SUCCESS');
  const late = run(undefined, { budgetMs: 159, prediction: 'FAILURE' }).history[0];
  assert.equal(late.outcome, 'FAILURE');
  assert.deepEqual(late.reasons, ['BUDGET_EXCEEDED']);
  assert.equal(late.elapsedMs, 160);
  assert.equal(late.loginCompleted, true);
  assert.equal(late.budgetMs, 159);
});

test('loop and original budget failure can both remain visible', () => {
  const result = run(undefined, { callbackPath: 'redirect-loop', budgetMs: 199 }).history[0];
  assert.deepEqual(result.reasons, ['REDIRECT_LOOP', 'BUDGET_EXCEEDED']);
  assert.equal(result.outcome, 'FAILURE');
});

test('missing observations stay unknown without invented terminal measurements', () => {
  const result = run(undefined, { observations: 'missing', prediction: 'UNKNOWN' }).history[0];
  assert.equal(result.outcome, 'UNKNOWN');
  assert.deepEqual(result.counts, { success: 0, failure: 0, unknown: 1 });
  for (const key of ['elapsedMs', 'callbackVersion', 'loginCompleted', 'correlationMatched',
    'returnPath', 'redirectHops', 'restartRequired']) assert.equal(result[key], null, key);
  assert.equal(result.trace.at(-1).event, 'callback-unobserved');
  assert.equal(result.trace.at(-1).atMs, null);
  assert.equal(result.verifier, 'PASS');
});

test('prediction success cannot turn observed failure or unknown into success', () => {
  const failure = run(undefined, { storeMode: 'v1-only' }).history[0];
  const unknown = run(undefined, { observations: 'missing' }).history[0];
  assert.equal(failure.outcome, 'FAILURE');
  assert.equal(failure.verifier, 'FAIL');
  assert.equal(unknown.outcome, 'UNKNOWN');
  assert.equal(unknown.verifier, 'FAIL');
});

test('strict numeric bounds reject strings, fractions, nonfinite and out-of-range values', () => {
  for (const budgetMs of ['500', '', null, undefined, true, NaN, Infinity, 99, 2001, 150.5]) {
    assert.throws(() => model.validateConfig(config({ budgetMs })), /budgetMs/);
  }
  for (const delayMs of ['100', null, NaN, -1, 1001, 1.5]) {
    assert.throws(() => model.validateConfig(config({ delayMs })), /delayMs/);
  }
  assert.equal(run(undefined, { budgetMs: 100, delayMs: 0 }).history[0].outcome, 'SUCCESS');
  assert.equal(run(undefined, { budgetMs: 2000, delayMs: 1000 }).history[0].elapsedMs, 1060);
});

test('unknown enums and missing or extra configuration fields are rejected', () => {
  for (const key of ['storeMode', 'callbackPath', 'callbackState', 'observations', 'prediction']) {
    assert.throws(() => model.validateConfig(config({ [key]: 'other' })), new RegExp(key));
  }
  const missing = config();
  delete missing.callbackState;
  assert.throws(() => model.validateConfig(missing), /configuration/);
  assert.throws(() => model.validateConfig(config({ extra: true })), /configuration/);
  assert.throws(() => model.validateConfig(null), /configuration/);
  assert.throws(() => model.validateConfig([]), /configuration/);
});

test('configuration getters, symbols, hidden fields and nonplain records never execute', () => {
  let called = false;
  const getter = config();
  Object.defineProperty(getter, 'budgetMs', { enumerable: true, get() { called = true; return 500; } });
  assert.throws(() => model.validateConfig(getter), /configuration/);
  assert.equal(called, false);
  assert.throws(() => model.validateConfig({ ...config(), [Symbol('extra')]: 1 }), /configuration/);
  const hidden = config();
  Object.defineProperty(hidden, 'extra', { value: 1 });
  assert.throws(() => model.validateConfig(hidden), /configuration/);
  assert.throws(() => model.validateConfig(Object.assign(Object.create({}), config())), /configuration/);
});

test('strict lifecycle rejects callback before cutover and repeated or overlapping actions', () => {
  const idle = model.createLesson();
  assert.throws(() => model.cutover(idle), /start/);
  assert.throws(() => model.deliverCallback(idle), /cutover/);
  const started = model.startLogin(idle, config());
  assert.throws(() => model.startLogin(started, config()), /active/);
  assert.throws(() => model.deliverCallback(started), /cutover/);
  const switched = model.cutover(started);
  assert.throws(() => model.cutover(switched), /already/);
  assert.throws(() => model.deliverCallback(run()), /cutover/);
});

test('each transition returns independent deeply frozen configuration and history', () => {
  const input = config();
  const initial = model.createLesson();
  const started = model.startLogin(initial, input);
  input.storeMode = 'v1-only';
  assert.equal(started.active.config.storeMode, 'shared');
  assert.equal(initial.active, null);
  for (const value of [model.DEFAULTS, initial, initial.history, started, started.active, started.active.config]) {
    assert.equal(Object.isFrozen(value), true);
  }
  const finished = model.deliverCallback(model.cutover(started));
  for (const value of [finished, finished.history, finished.history[0], finished.history[0].trace,
    finished.history[0].trace[0], finished.history[0].counts]) assert.equal(Object.isFrozen(value), true);
});

test('six runs retain prior failures and a seventh is rejected without eviction', () => {
  let state = model.createLesson();
  state = run(state, { storeMode: 'v1-only', prediction: 'SUCCESS' });
  for (let index = 1; index < model.MAX_HISTORY; index++) state = run(state);
  const before = JSON.stringify(state);
  assert.equal(state.history.length, 6);
  assert.equal(state.history[0].outcome, 'FAILURE');
  assert.equal(state.history[0].verifier, 'FAIL');
  assert.deepEqual(state.history.map((item) => item.id), [1, 2, 3, 4, 5, 6]);
  assert.throws(() => model.startLogin(state, config()), /six|6|history/i);
  assert.equal(JSON.stringify(state), before);
});

test('forged history results, configurations, traces, counts and identities are rejected', () => {
  const original = run(undefined, { storeMode: 'v1-only' });
  const mutations = [
    (state) => { state.history[0].outcome = 'SUCCESS'; },
    (state) => { state.history[0].config.storeMode = 'shared'; },
    (state) => { state.history[0].trace[0].version = 'v2'; },
    (state) => { state.history[0].counts.success = 1; },
    (state) => { state.history[0].id = 2; },
    (state) => { state.history[0].extra = true; },
  ];
  for (const mutate of mutations) {
    const forged = JSON.parse(JSON.stringify(original));
    mutate(forged);
    assert.throws(() => model.startLogin(forged, config()), /state|history/);
  }
});

test('sparse, decorated, oversized and accessor state containers are rejected', () => {
  const sparse = model.createLesson();
  const cases = [
    { active: null, history: new Array(1) },
    { active: null, history: Object.assign([], { extra: true }) },
    { active: null, history: Array(7).fill(null) },
    { active: null, history: [], extra: true },
    { active: { id: 2, stage: 'started', config: config() }, history: [] },
    { active: { id: 1, stage: 'other', config: config() }, history: [] },
    Object.create(sparse),
  ];
  let called = false;
  const getter = { history: [] };
  Object.defineProperty(getter, 'active', { enumerable: true, get() { called = true; return null; } });
  cases.push(getter);
  for (const value of cases) assert.throws(() => model.startLogin(value, config()), /state|history|active/);
  assert.equal(called, false);
});

test('missing observations never bypass input or state validation', () => {
  assert.throws(() => model.evaluate(config({ observations: 'missing', budgetMs: '500' })), /budgetMs/);
  assert.throws(() => model.evaluate(config(), 0), /id/);
  assert.throws(() => model.evaluate(config(), 7), /id/);
  assert.throws(() => model.evaluate(config(), '1'), /id/);
});

test('bounded fixture matrix is deterministic and has exactly one journey per run', () => {
  let checked = 0;
  for (const storeMode of ['shared', 'v1-only']) {
    for (const callbackPath of ['compatible', 'redirect-loop']) {
      for (const callbackState of ['matching', 'mismatch']) {
        for (const observations of ['complete', 'missing']) {
          for (const budgetMs of [100, 160, 2000]) {
            const input = config({ storeMode, callbackPath, callbackState, observations, budgetMs });
            const first = model.evaluate(input);
            assert.deepEqual(first, model.evaluate(input));
            const expected = observations === 'missing' ? 'UNKNOWN'
              : storeMode === 'shared' && callbackPath === 'compatible'
                && callbackState === 'matching' && budgetMs >= 160 ? 'SUCCESS' : 'FAILURE';
            assert.equal(first.outcome, expected);
            assert.equal(first.counts.success + first.counts.failure + first.counts.unknown, 1);
            assert.ok(first.trace.length <= 8);
            checked++;
          }
        }
      }
    }
  }
  assert.equal(checked, 48);
});

test('reset is a fresh empty lesson rather than a mutation of retained evidence', () => {
  const previous = run(undefined, { storeMode: 'v1-only' });
  const reset = model.createLesson();
  assert.deepEqual(reset, { active: null, history: [] });
  assert.equal(previous.history[0].outcome, 'FAILURE');
});
