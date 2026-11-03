'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../model.js');

test('supported synthetic resize recovers three transactions within declared budgets', () => {
  const result = model.evaluate(model.DEFAULTS);
  assert.equal(result.selected.verdict, 'PASSED');
  assert.equal(result.selected.reconnectMs, 420);
  assert.equal(result.selected.recoveryMs, 560);
  assert.equal(result.selected.transactions.completed, 3);
  assert.equal(result.comparison.length, 2);
});

const compare = (changes = {}) => model.evaluate({ ...model.DEFAULTS, ...changes });
const inPlace = (result) => result.comparison[0];
const parallel = (result) => result.comparison[1];
const check = (result, id) => result.checks.find((item) => item.id === id);

test('comparison has independent metrics and selection never changes the paired evidence', () => {
  const first = compare();
  const second = compare({ path: 'parallel-failover' });
  assert.deepEqual(first.comparison, second.comparison);
  assert.equal(first.selected, first.comparison[0]);
  assert.equal(second.selected, second.comparison[1]);
  assert.equal(parallel(first).reconnectMs, 180);
  assert.equal(parallel(first).recoveryMs, 320);
  for (const result of first.comparison) {
    assert.equal(result.verdict, 'PASSED');
    assert.match(result.nativeQualification, /^UNKNOWN: no native platform/);
    assert.equal(result.transactions.started, 3);
    assert.deepEqual(result.transactions.rows.map((row) => row.effects), [1, 1, 1]);
  }
});

test('restart-required resize stays NOT ONLINE even inside arbitrarily generous allowed budgets', () => {
  const result = compare({ fixture: 'restart-required', reconnectBudgetMs: 5000, recoveryBudgetMs: 5000 });
  assert.equal(inPlace(result).verdict, 'FAILED');
  assert.equal(inPlace(result).operationClass, 'NOT ONLINE');
  assert.equal(check(inPlace(result), 'capability').verdict, 'FAILED');
  assert.equal(check(inPlace(result), 'reconnect').verdict, 'PASSED');
  assert.equal(check(inPlace(result), 'transaction-recovery').verdict, 'PASSED');
  assert.equal(inPlace(result).transactions.completed, 3);
  assert.match(inPlace(result).userImpact, /eventual recovery cannot establish an online operation/);
  assert.equal(parallel(result).verdict, 'PASSED');
});

test('exact boundaries pass and a one millisecond shortfall fails the relevant budget', () => {
  assert.equal(compare({ reconnectBudgetMs: 420, recoveryBudgetMs: 560 }).selected.verdict, 'PASSED');
  assert.equal(compare({ reconnectBudgetMs: 419 }).selected.verdict, 'FAILED');
  assert.equal(compare({ recoveryBudgetMs: 559 }).selected.verdict, 'FAILED');
  assert.equal(parallel(compare({ reconnectBudgetMs: 180, recoveryBudgetMs: 320 })).verdict, 'PASSED');
  assert.equal(parallel(compare({ reconnectBudgetMs: 179 })).verdict, 'FAILED');
  assert.equal(parallel(compare({ recoveryBudgetMs: 319 })).verdict, 'FAILED');
  assert.equal(compare({ reconnectBudgetMs: 0, recoveryBudgetMs: 0 }).selected.verdict, 'FAILED');
});

test('unsupported and unsynchronized parallel paths fail before transition without fabricated observations', () => {
  for (const changes of [{ fixture: 'parallel-unavailable' }, { readiness: 'not-ready' }]) {
    const result = compare(changes);
    const blocked = parallel(result);
    assert.equal(blocked.verdict, 'FAILED');
    assert.equal(blocked.attempted, false);
    assert.equal(blocked.reconnectMs, null);
    assert.equal(blocked.recoveryMs, null);
    assert.deepEqual(blocked.transactions, {
      population: 3, started: 0, completed: 0, failed: 0, unknown: 0, notRun: 3, rows: [],
    });
    assert.equal(inPlace(result).verdict, 'PASSED');
  }
});

test('unverified capabilities and unknown synchronization remain unknown and blocked', () => {
  for (const report of compare({ fixture: 'unverified' }).comparison) {
    assert.equal(report.operationClass, 'UNVERIFIED');
    assert.equal(report.verdict, 'UNKNOWN');
    assert.equal(report.attempted, false);
    assert.equal(report.transactions.notRun, 3);
  }
  const result = compare({ readiness: 'unknown' });
  assert.equal(parallel(result).verdict, 'UNKNOWN');
  assert.equal(parallel(result).attempted, false);
  assert.equal(inPlace(result).verdict, 'PASSED');
});

test('unresolved outcomes stay in the started denominator and do not invent effects', () => {
  for (const report of compare({ transaction: 'unresolved' }).comparison) {
    assert.equal(report.verdict, 'UNKNOWN');
    assert.equal(report.transactions.started, 3);
    assert.equal(report.transactions.completed, 2);
    assert.equal(report.transactions.unknown, 1);
    assert.equal(report.transactions.rows[1].effects, null);
    assert.equal(report.transactions.notRun, 0);
  }
});

test('missing timing evidence is not zero, does not remove transactions and cannot pass', () => {
  for (const report of compare({ observation: 'missing' }).comparison) {
    assert.equal(report.verdict, 'UNKNOWN');
    assert.equal(report.reconnectMs, null);
    assert.equal(report.recoveryMs, null);
    assert.equal(report.transactions.completed, 3);
    assert.equal(report.transactions.started, 3);
  }
});

test('known failed transactions, budgets and disruptive capability dominate uncertainty', () => {
  const failed = compare({ transaction: 'failed', observation: 'missing' });
  for (const report of failed.comparison) {
    assert.equal(report.verdict, 'FAILED');
    assert.equal(check(report, 'reconnect').verdict, 'UNKNOWN');
    assert.equal(check(report, 'transaction-outcomes').verdict, 'FAILED');
    assert.equal(report.transactions.failed, 1);
    assert.equal(report.transactions.completed, 2);
    assert.equal(report.transactions.rows[1].effects, 0);
  }
  assert.equal(compare({ transaction: 'unresolved', reconnectBudgetMs: 419 }).selected.verdict, 'FAILED');
  assert.equal(compare({ fixture: 'restart-required', observation: 'missing' }).selected.verdict, 'FAILED');
  assert.equal(parallel(compare({ fixture: 'parallel-unavailable', readiness: 'unknown' })).verdict, 'FAILED');
});

test('inputs require exact own fields, declared enums and bounded numeric integers', () => {
  const invalid = [null, [], {}, Object.create(model.DEFAULTS),
    { ...model.DEFAULTS, extra: true }, { ...model.DEFAULTS, path: '__proto__' }];
  for (const field of Object.keys(model.OPTIONS)) {
    for (const value of ['', ' ', '__proto__', null, 1]) invalid.push({ ...model.DEFAULTS, [field]: value });
  }
  for (const field of ['reconnectBudgetMs', 'recoveryBudgetMs']) {
    for (const value of [-1, -0, 5001, 1.5, NaN, Infinity, '600', null, true, undefined, 9007199254740992]) {
      invalid.push({ ...model.DEFAULTS, [field]: value });
    }
  }
  for (const input of invalid) assert.throws(() => model.evaluate(input), { code: 'INVALID_INPUT' });
  const missing = { ...model.DEFAULTS };
  delete missing.path;
  assert.throws(() => model.evaluate(missing), { code: 'INVALID_INPUT' });
});

test('state, configuration, reports and retained history are deeply immutable', () => {
  const initial = model.createState();
  const next = model.run(initial, model.DEFAULTS);
  assert.equal(initial.history.length, 0);
  assert.equal(next.history.length, 1);
  assert.equal(next.history[0].number, 1);
  assert.throws(() => { next.history.push({}); }, TypeError);
  assert.throws(() => { next.history[0].result.selected.verdict = 'FAILED'; }, TypeError);
  assert.throws(() => { model.DEFAULTS.fixture = 'unverified'; }, TypeError);
  assert.throws(() => { model.FIXTURES['bounded-resize'].parallel = 'unsupported'; }, TypeError);
  const before = JSON.stringify(next);
  assert.throws(() => model.run(next, { ...model.DEFAULTS, reconnectBudgetMs: '1' }), { code: 'INVALID_INPUT' });
  assert.equal(JSON.stringify(next), before);
});

test('altered, malformed and unserializable retained state cannot be trusted or advanced', () => {
  const valid = model.run(model.createState(), model.DEFAULTS);
  const edited = structuredClone(valid);
  edited.history[0].result.selected.verdict = 'UNKNOWN';
  const changedInput = structuredClone(valid);
  changedInput.history[0].result.input.fixture = 'restart-required';
  const circular = structuredClone(valid);
  circular.history[0].result.loop = circular.history[0].result;
  const malformed = [null, [], {}, { schemaVersion: 2, history: [] },
    { schemaVersion: 1, history: [], extra: true }, { schemaVersion: 1, history: [null] },
    edited, changedInput, circular];
  for (const state of malformed) assert.throws(() => model.run(state, model.DEFAULTS), { code: 'INVALID_STATE' });
  assert.equal(model.run(structuredClone(valid), model.DEFAULTS).history.length, 2);
});

test('exact data guards reject hidden/symbol fields and accessors without invoking getters', () => {
  const hidden = { ...model.DEFAULTS };
  Object.defineProperty(hidden, 'extra', { value: true });
  const symbolic = { ...model.DEFAULTS, [Symbol('extra')]: true };
  let getterCalls = 0;
  const accessor = { ...model.DEFAULTS };
  Object.defineProperty(accessor, 'fixture', { enumerable: true, get() { getterCalls += 1; return 'bounded-resize'; } });
  for (const input of [hidden, symbolic, accessor]) {
    assert.throws(() => model.evaluate(input), { code: 'INVALID_INPUT' });
  }
  const state = structuredClone(model.run(model.createState(), model.DEFAULTS));
  Object.defineProperty(state.history[0].result, 'input', {
    enumerable: true, get() { getterCalls += 1; return model.DEFAULTS; },
  });
  assert.throws(() => model.run(state, model.DEFAULTS), { code: 'INVALID_STATE' });
  assert.equal(getterCalls, 0);
});

test('structural history validation cannot be bypassed with toJSON, hidden fields or array decoration', () => {
  const valid = model.run(model.createState(), model.DEFAULTS);
  const disguised = structuredClone(valid);
  disguised.history[0].result.selected.verdict = 'PASSED';
  disguised.history[0].result.selected.reconnectMs = 0;
  disguised.history[0].result.toJSON = () => valid.history[0].result;
  const decorated = structuredClone(valid);
  decorated.history.extra = true;
  const hidden = structuredClone(valid);
  Object.defineProperty(hidden.history[0].result.selected, 'extra', { value: true });
  for (const state of [disguised, decorated, hidden]) {
    assert.throws(() => model.run(state, model.DEFAULTS), { code: 'INVALID_STATE' });
  }
  const reordered = structuredClone(valid);
  reordered.history[0].result = Object.fromEntries(Object.entries(reordered.history[0].result).reverse());
  assert.equal(model.run(reordered, model.DEFAULTS).history.length, 2);
});

test('six success/failure/unknown comparisons retain their inputs; a seventh requires explicit reset', () => {
  let state = model.createState();
  const fixtures = ['bounded-resize', 'restart-required', 'unverified'];
  for (let index = 0; index < model.MAX_RUNS; index += 1) {
    const old = state;
    state = model.run(state, { ...model.DEFAULTS, fixture: fixtures[index % 3] });
    assert.equal(old.history.length, index);
    assert.deepEqual(state.history.slice(0, -1), old.history);
  }
  assert.deepEqual(state.history.slice(0, 3).map((entry) => entry.result.selected.verdict), ['PASSED', 'FAILED', 'UNKNOWN']);
  const before = JSON.stringify(state);
  assert.throws(() => model.run(state, model.DEFAULTS), { code: 'HISTORY_LIMIT', field: 'clear-lesson' });
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(model.createState(), { schemaVersion: 1, history: [] });
});

test('all 144 declared fixture/selection combinations are deterministic with honest accounting', () => {
  let combinations = 0;
  for (const path of model.OPTIONS.path) {
    for (const fixture of model.OPTIONS.fixture) {
      for (const readiness of model.OPTIONS.readiness) {
        for (const transaction of model.OPTIONS.transaction) {
          for (const observation of model.OPTIONS.observation) {
            const input = { ...model.DEFAULTS, path, fixture, readiness, transaction, observation };
            const result = model.evaluate(input);
            assert.deepEqual(result, model.evaluate(input));
            for (const report of result.comparison) {
              const tx = report.transactions;
              assert.equal(tx.completed + tx.failed + tx.unknown, tx.started);
              assert.equal(tx.started + tx.notRun, 3);
              assert.equal(tx.rows.length, tx.started);
              if (!report.attempted) {
                assert.equal(report.reconnectMs, null);
                assert.equal(report.recoveryMs, null);
              }
              if (report.verdict === 'PASSED') {
                assert.equal(report.operationClass, 'SYNTHETIC SUPPORTED');
                assert.ok(report.checks.every((item) => item.verdict === 'PASSED'));
                assert.equal(tx.completed, 3);
              }
              if (report.checks.some((item) => item.verdict === 'FAILED')) assert.equal(report.verdict, 'FAILED');
            }
            combinations += 1;
          }
        }
      }
    }
  }
  assert.equal(combinations, 144);
});
