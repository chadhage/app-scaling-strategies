'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Model = require(path.join(__dirname, '..', 'model.js'));

const selection = (scenario = 'slow-200', budgetMs = 1000, action = 'expand') => ({
  scenario, budgetMs, action,
});
const result = (input) => Model.decide(Model.createState(), input).history.at(-1);
const rejects = (operation, code) => assert.throws(operation, (error) => error.code === code);

test('slow HTTP 200 must fail journey acceptance and block expansion', () => {
  const observed = result(selection());
  assert.equal(observed.acceptance, 'failure');
  assert.equal(observed.verification, 'fail');
  assert.equal(observed.expansion, 'blocked');
  assert.equal(observed.nextCanaryPercent, 25);
  assert.deepEqual(observed.metrics, {
    attempted: 3, http200: 3, success: 1, interrupted: 2, unknown: 0,
  });
  assert.deepEqual(observed.journeys.map((journey) => journey.status), [200, 200, 200]);
});

test('safe rejection passes only the decision verifier and retains interruptions', () => {
  const observed = result(selection('slow-200', 1000, 'hold'));
  assert.equal(observed.acceptance, 'failure');
  assert.equal(observed.verification, 'pass');
  assert.equal(observed.expansion, 'held');
  assert.equal(observed.metrics.interrupted, 2);
  assert.equal(observed.metrics.attempted, 3);
  assert.equal(observed.nextCanaryPercent, 25);
});

test('complete latency evidence including exact budget boundary permits synthetic expansion', () => {
  const observed = result(selection('within-budget'));
  assert.equal(observed.acceptance, 'success');
  assert.equal(observed.verification, 'pass');
  assert.equal(observed.expansion, 'allowed');
  assert.equal(observed.nextCanaryPercent, 50);
  assert.equal(observed.journeys[2].durationMs, 1000);
  assert.equal(observed.journeys[2].outcome, 'success');
  assert.equal(observed.metrics.success, 3);
});

test('missing latency remains unknown and is not removed from the denominator', () => {
  for (const action of ['expand', 'hold']) {
    const observed = result(selection('unmeasured-200', 1000, action));
    assert.equal(observed.acceptance, 'unknown');
    assert.equal(observed.verification, 'unknown');
    assert.notEqual(observed.expansion, 'allowed');
    assert.equal(observed.nextCanaryPercent, 25);
    assert.deepEqual(observed.metrics, {
      attempted: 3, http200: 3, success: 2, interrupted: 0, unknown: 1,
    });
  }
});

test('both declared budgets still reject the fixed slow trace', () => {
  for (const budgetMs of [1000, 1500]) {
    const observed = result(selection('slow-200', budgetMs));
    assert.equal(observed.acceptance, 'failure');
    assert.equal(observed.metrics.interrupted, 2);
    assert.equal(observed.selection.budgetMs, budgetMs);
  }
});

test('holding a compliant candidate claims no expansion', () => {
  const observed = result(selection('within-budget', 1000, 'hold'));
  assert.equal(observed.acceptance, 'success');
  assert.equal(observed.verification, 'pass');
  assert.equal(observed.expansion, 'held');
  assert.equal(observed.nextCanaryPercent, 25);
});

test('reset preserves earlier failure and its original budget before a later success', () => {
  const first = Model.decide(Model.createState(), selection());
  const saved = JSON.stringify(first);
  const ready = Model.reset(first);
  assert.equal(ready.phase, 'ready');
  assert.equal(ready.currentId, null);
  assert.deepEqual(ready.history, first.history);
  const next = Model.decide(ready, selection('within-budget', 1500));
  assert.equal(next.history[0].acceptance, 'failure');
  assert.equal(next.history[0].selection.budgetMs, 1000);
  assert.equal(next.history[1].acceptance, 'success');
  assert.equal(JSON.stringify(first), saved);
  assert.deepEqual(Model.summarize(next), {
    runs: 2, attempted: 6, http200: 6, success: 4, interrupted: 2, unknown: 0,
  });
});

test('fixed fixture results are deterministic and metrics reconcile for every choice', () => {
  for (const scenario of Model.constants.scenarios) {
    for (const budgetMs of Model.constants.budgets) {
      for (const action of Model.constants.actions) {
        const input = selection(scenario, budgetMs, action);
        const left = result(input);
        assert.deepEqual(left, result(input));
        assert.equal(left.metrics.attempted,
          left.metrics.success + left.metrics.interrupted + left.metrics.unknown);
        assert.equal(left.metrics.http200, 3);
        assert.ok(left.journeys.every((journey) => journey.status === 200));
      }
    }
  }
});

test('undeclared, coercible, missing and extra inputs are explicitly rejected without mutation', () => {
  const state = Model.createState();
  const before = JSON.stringify(state);
  for (const invalid of [
    null, [], {}, 'slow-200',
    selection('unknown'), selection('slow-200', '1000'), selection('slow-200', NaN),
    selection('slow-200', Infinity), selection('slow-200', 1001),
    selection('slow-200', 1000, 'force'),
    { ...selection(), endpoint: 'not-an-endpoint' },
    { ...selection(), [Symbol('extra')]: true },
    Object.assign(Object.create({ inherited: true }), selection()),
  ]) {
    rejects(() => Model.decide(state, invalid), 'ERR_INPUT');
    assert.equal(JSON.stringify(state), before);
  }
});

test('completed decision cannot be replayed without an explicit reset', () => {
  const state = Model.decide(Model.createState(), selection());
  rejects(() => Model.decide(state, selection()), 'ERR_STATE');
  assert.equal(state.history.length, 1);
});

test('state structure and altered historical outcomes cannot forge acceptance', () => {
  const state = Model.decide(Model.createState(), selection());
  const tampered = structuredClone(state);
  tampered.history[0].acceptance = 'success';
  const alteredBudget = structuredClone(state);
  alteredBudget.history[0].selection.budgetMs = 1500;
  for (const invalid of [
    null, {}, { ...state, phase: 'running' }, { ...state, currentId: 0 },
    { ...state, extra: true }, { ...state, schemaVersion: 2 },
    tampered, alteredBudget, { ...Model.createState(), phase: 'decided' },
  ]) {
    rejects(() => Model.decide(invalid, selection()), 'ERR_STATE');
    rejects(() => Model.reset(invalid), 'ERR_STATE');
    rejects(() => Model.summarize(invalid), 'ERR_STATE');
  }
});

test('six retained attempts are bounded and reset cannot discard failures or refill allowance', () => {
  let state = Model.createState();
  for (let i = 0; i < Model.constants.maxAttempts; i += 1) {
    state = Model.reset(Model.decide(state, selection()));
  }
  const before = JSON.stringify(state);
  rejects(() => Model.decide(state, selection()), 'ERR_HISTORY_LIMIT');
  assert.equal(JSON.stringify(state), before);
  assert.equal(Model.reset(state).history.length, 6);
  assert.equal(Model.summarize(state).interrupted, 12);
});

test('returned states, records and fixtures are immutable', () => {
  const state = Model.decide(Model.createState(), selection());
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.history));
  assert.ok(Object.isFrozen(state.history[0].selection));
  assert.ok(Object.isFrozen(state.history[0].journeys[0]));
  assert.ok(Object.isFrozen(Model.constants.scenarios));
  assert.throws(() => { state.history[0].acceptance = 'success'; }, TypeError);
});

test('accessors, sparse arrays and serialization tricks cannot bypass strict state guards', () => {
  const valid = Model.decide(Model.createState(), selection());
  const serialized = structuredClone(valid);
  serialized.history[0].acceptance = 'success';
  serialized.history[0].toJSON = () => valid.history[0];
  const sparse = { ...Model.createState(), history: new Array(1) };
  const extraArrayField = structuredClone(valid);
  extraArrayField.history.extra = true;
  const accessor = { ...valid };
  Object.defineProperty(accessor, 'phase', { get() { throw new Error('must not execute'); } });
  for (const invalid of [serialized, sparse, extraArrayField, accessor]) {
    rejects(() => Model.reset(invalid), 'ERR_STATE');
  }
});
