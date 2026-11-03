'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('../fixture.js');
const model = require('../model.js');
const config = (changes = {}) => ({ ...fixture.DEFAULTS, ...changes });
const run = (changes = {}) => model.probeMixedTraffic(model.resizeCache(model.createRehearsal(), config(changes)));
const guarded = (action, field) => assert.throws(action, (error) =>
  error instanceof model.GuardError && error.code === 'ERR_S071_GUARD'
    && (field === undefined || error.field === field));

test('configuration accepts only exact own plain-data fields and strict bounded values', () => {
  const invalid = [
    null, undefined, [], {}, Object.create(config()), { ...config(), extra: true },
    Object.assign(Object.create(null), config()),
    { ...config(), [Symbol('extra')]: true },
  ];
  for (const input of invalid) guarded(() => model.resizeCache(model.createRehearsal(), input));
  for (const [field, values] of Object.entries({
    targetCapacity: [0, 4, 9, 100, '8', NaN, Infinity, null],
    payloadMode: ['', 'COMPATIBLE', '<script>', 1, null],
    resizeMode: ['', 'online', 'continuous ', true, null],
    coverage: ['', 'v1', 'ALL', 0, null],
    budgetMs: ['', '100', 0, 19, 21, 125, 1000, 30.5, NaN, Infinity, null],
  })) for (const value of values) {
    guarded(() => model.resizeCache(model.createRehearsal(), config({ [field]: value })), field);
  }
  const accessor = config();
  Object.defineProperty(accessor, 'budgetMs', { get() { throw new Error('Accessor must not execute'); } });
  guarded(() => model.resizeCache(model.createRehearsal(), accessor), 'budgetMs');
  for (const budgetMs of [20, 30, 100, 120]) {
    assert.equal(model.resizeCache(model.createRehearsal(), config({ budgetMs })).config.budgetMs, budgetMs);
  }
});

test('authentic immutable states reject forged, out-of-order and repeated actions', () => {
  const start = model.createRehearsal();
  guarded(() => model.probeMixedTraffic(start));
  guarded(() => model.newAttempt(start));
  for (const state of [null, {}, { ...start }, JSON.parse(JSON.stringify(start)), 1, 'state']) {
    guarded(() => model.resizeCache(state, config()));
    guarded(() => model.probeMixedTraffic(state));
    guarded(() => model.newAttempt(state));
    guarded(() => model.resetRehearsal(state));
  }
  const resized = model.resizeCache(start, config());
  guarded(() => model.resizeCache(resized, config()));
  guarded(() => model.newAttempt(resized));
  const done = model.probeMixedTraffic(resized);
  guarded(() => model.probeMixedTraffic(done));
  guarded(() => model.resizeCache(done, config()));
  assert.equal(start.phase, 'configuring');
  assert.equal(resized.result, null);
});

test('frozen config, rows, payloads, metrics and history do not share mutable operator input', () => {
  const input = config();
  const resized = model.resizeCache(model.createRehearsal(), input);
  input.payloadMode = 'compatible';
  assert.equal(resized.config.payloadMode, 'breaking');
  const done = model.probeMixedTraffic(resized);
  for (const value of [
    done, done.config, done.operation, done.history, done.history[0],
    done.result, done.result.metrics, done.result.comparison, done.result.reasons,
    done.result.rows, done.result.rows[0], done.result.rows[0].reasons,
    done.result.rows[1].returnedProfile,
  ]) assert.equal(Object.isFrozen(value), true);
  assert.throws(() => { done.result.metrics.failed = 0; }, TypeError);
  assert.throws(() => { done.history.length = 0; }, TypeError);
  assert.equal(done.result.metrics.payloadFailures, 3);
});

test('new attempts retain exactly six immutable results and reset is complete from every phase', () => {
  let state = model.createRehearsal();
  const original = [];
  for (let attempt = 1; attempt <= 6; attempt++) {
    state = model.probeMixedTraffic(model.resizeCache(state, config({ targetCapacity: attempt % 2 ? 8 : 12 })));
    original.push(state.history[attempt - 1]);
    assert.equal(state.attempt, attempt);
    assert.equal(state.history.length, attempt);
    assert.deepEqual(state.history, original);
    if (attempt < 6) {
      state = model.newAttempt(state);
      assert.equal(state.result, null);
      assert.equal(state.config, null);
      assert.equal(state.operation, null);
      assert.equal(state.phase, 'configuring');
      assert.deepEqual(state.history, original);
    }
  }
  guarded(() => model.newAttempt(state));
  assert.deepEqual(state.history, original);
  const stages = [model.createRehearsal(), model.resizeCache(model.createRehearsal(), config()), state];
  for (const stage of stages) {
    const reset = model.resetRehearsal(stage);
    assert.deepEqual(reset, {
      phase: 'configuring', attempt: 1, history: [], config: null, operation: null, result: null,
    });
  }
  assert.equal(state.history.length, 6);
});

test('same workload executes actual synthetic serialization and old/new decoding on a shared key', () => {
  const result = run().result;
  for (const phase of ['before', 'during', 'after']) {
    const rows = result.rows.filter((row) => row.phase === phase);
    assert.equal(rows.length, 6);
    assert.deepEqual(rows.map((row) => `${row.operation}:${row.client}:${row.writer}`), [
      'write:v1:v1', 'read:v1:v1', 'read:v2:v1', 'write:v2:v2', 'read:v1:v2', 'read:v2:v2',
    ]);
    assert.equal(JSON.parse(rows[0].payloadJSON).schema, 1);
    assert.equal(JSON.parse(rows[3].payloadJSON).schema, 2);
    assert.deepEqual(rows[1].returnedProfile, fixture.PROFILE);
    assert.equal(rows[4].returnedProfile, null);
    assert.match(rows[4].reasons[0], /v1 cannot preserve.*schema 2/);
    assert.deepEqual(rows[5].returnedProfile, fixture.PROFILE);
    assert.equal(rows[3].payloadJSON, rows[4].payloadJSON);
    assert.equal(rows[4].payloadJSON, rows[5].payloadJSON);
  }
});

test('known failures outrank uncertainty without inventing target capacity or missing results', () => {
  for (const resizeMode of ['unverified', 'unsupported']) {
    const done = run({ resizeMode });
    assert.equal(done.result.gate, 'FAIL', 'A known baseline payload failure remains a failure');
    assert.equal(done.result.metrics.observed, 6);
    assert.equal(done.result.metrics.payloadFailures, 1);
    assert.equal(done.result.metrics.missing, 12);
    assert.equal(done.operation.appliedCapacity, null);
    assert.equal(done.result.comparison.afterWorstMs, null);
    assert.equal(done.result.rows.some((row) => row.phase !== 'before'), false);
  }
  const missingWithBudgetFailures = run({ coverage: 'new-only', budgetMs: 30 }).result;
  assert.equal(missingWithBudgetFailures.gate, 'FAIL');
  assert.equal(missingWithBudgetFailures.metrics.budgetFailures, 3);
  assert.equal(missingWithBudgetFailures.metrics.missing, 9);
  assert.equal(run({ coverage: 'none', resizeMode: 'unsupported' }).result.gate, 'FAIL');
});

test('bounded enum matrix is deterministic, internally consistent and never grants empty success', () => {
  let cases = 0;
  for (const targetCapacity of [8, 12]) {
    for (const payloadMode of ['breaking', 'compatible']) {
      for (const resizeMode of ['continuous', 'gap', 'unsupported', 'unverified']) {
        for (const coverage of ['all', 'new-only', 'none']) {
          for (let budgetMs = 20; budgetMs <= 120; budgetMs += 10) {
            const input = { targetCapacity, payloadMode, resizeMode, coverage, budgetMs };
            const first = run(input);
            assert.deepEqual(first, run(input));
            const { result } = first;
            const { metrics } = result;
            assert.equal(metrics.expected, 18);
            assert.equal(metrics.observed + metrics.missing, 18);
            assert.equal(metrics.succeeded + metrics.failed, metrics.observed);
            assert.ok(result.rows.length <= 18);
            assert.equal(new Set(result.rows.map((row) => row.id)).size, result.rows.length);
            if (result.gate === 'PASS') {
              assert.equal(metrics.missing, 0);
              assert.equal(metrics.failed, 0);
              assert.equal(payloadMode, 'compatible');
              assert.equal(resizeMode, 'continuous');
              assert.equal(coverage, 'all');
              assert.ok(budgetMs >= 80);
            }
            if (metrics.failed) assert.equal(result.gate, 'FAIL');
            if (metrics.observed === 0) assert.notEqual(result.gate, 'PASS');
            cases++;
          }
        }
      }
    }
  }
  assert.equal(cases, 528);
});
