'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../long-work.js');
const input = (changes = {}) => ({ ...api.DEFAULT_INPUT, ...changes });
const check = (result, id) => result.checks.find((item) => item.id === id);

test('drain completes at inclusive HTTP, drain and original user deadlines', () => {
  const result = api.rehearse(input({ hostLimitMs: 12000, drainMs: 8000, budgetMs: 12000 }));
  assert.equal(result.status, 'completed');
  assert.equal(result.elapsedMs, 12000);
  assert.equal(result.persistedUnits, 0);
  assert.ok(result.trace.some((item) => item.text.includes('stays on v1')));
});

test('each declared drain, HTTP or original deadline is independently enforced', () => {
  for (const [changes, id, elapsed] of [
    [{ hostLimitMs: 11999 }, 'host-limit', 11999],
    [{ drainMs: 7999 }, 'drain-or-checkpoint', 11999],
    [{ budgetMs: 11999 }, 'original-budget', 12000],
  ]) {
    const result = api.rehearse(input(changes));
    assert.equal(result.status, 'interrupted');
    assert.equal(result.elapsedMs, elapsed);
    assert.equal(check(result, id).verdict, 'fail');
  }
});

test('durable handoff fits a short HTTP envelope and needs no HTTP drain', () => {
  const durable = api.rehearse(input({
    mode: 'durable', hostLimitMs: 4000, drainMs: 0, budgetMs: 14000,
  }));
  assert.equal(durable.status, 'completed');
  assert.equal(durable.persistedUnits, 4);
  assert.equal(durable.remainingFromCheckpoint, 8);
  assert.equal(durable.elapsedMs, 14000);
  assert.ok(durable.trace.some((item) => item.atMs === 4000 && item.text.includes('not completion')));
  assert.ok(durable.trace.some((item) => item.atMs === 5000 && item.text.includes('Retire')));
  assert.equal(api.rehearse(input({ hostLimitMs: 10000 })).status, 'interrupted');
  assert.equal(api.rehearse(input({ mode: 'durable', hostLimitMs: 10000 })).status, 'completed');
});

test('unproved durable acceptance does not conjure a checkpoint or successor', () => {
  const result = api.rehearse(input({ mode: 'durable', hostLimitMs: 3999 }));
  assert.equal(result.status, 'interrupted');
  assert.equal(result.persistedUnits, 0);
  assert.equal(result.completedUnits, null);
  assert.equal(result.elapsedMs, 3999);
  assert.ok(!result.trace.some((item) => item.text.includes('Successor')));
  assert.equal(check(result, 'result-proof').verdict, 'unknown');
});

test('active successor termination fails even though a checkpoint remains', () => {
  const result = api.rehearse(input({ mode: 'durable', condition: 'forced-stop' }));
  assert.equal(result.status, 'interrupted');
  assert.equal(result.elapsedMs, 8000);
  assert.equal(result.persistedUnits, 4);
  assert.equal(result.completedUnits, null);
  assert.equal(check(result, 'active-work').verdict, 'fail');
  assert.equal(check(result, 'result-proof').verdict, 'unknown');
});

test('retry clocks carry the original operation and inclusive absolute deadline', () => {
  const late = api.rehearse(input({ mode: 'durable', condition: 'delayed-retry' }));
  assert.equal(late.status, 'interrupted');
  assert.equal(late.retryElapsedMs, 8000);
  assert.equal(late.completedUnits, 12);
  assert.ok(late.retryElapsedMs < late.originalDeadlineMs);
  assert.equal(check(late, 'original-budget').verdict, 'fail');
  assert.ok(late.trace.every((item) => item.originalDeadlineMs === 18000));
  assert.ok(late.trace.every((item) => item.operationId === api.OPERATION_ID));
  assert.equal(api.rehearse(input({
    mode: 'durable', condition: 'delayed-retry', budgetMs: 22000,
  })).status, 'completed');
  assert.equal(api.rehearse(input({
    mode: 'durable', condition: 'delayed-retry', budgetMs: 21999,
  })).status, 'interrupted');
});

test('a later HTTP retry cannot erase an already interrupted request', () => {
  const result = api.rehearse(input({ condition: 'delayed-retry', budgetMs: 60000 }));
  assert.equal(result.status, 'interrupted');
  assert.equal(result.completedUnits, 12);
  assert.equal(result.elapsedMs, 20000);
  assert.equal(result.retryElapsedMs, 12000);
  assert.equal(check(result, 'original-budget').verdict, 'pass');
  assert.equal(check(result, 'active-work').verdict, 'fail');
});

test('missing result proof stays unknown in both modes', () => {
  for (const mode of api.MODES) {
    const result = api.rehearse(input({ mode, condition: 'missing-proof' }));
    assert.equal(result.status, 'unknown');
    assert.equal(result.completedUnits, null);
    assert.equal(check(result, 'result-proof').verdict, 'unknown');
    assert.equal(check(result, 'original-budget').verdict, 'pass');
  }
});

test('known failures outrank uncertainty without falsifying the unknown check', () => {
  for (const changes of [
    { budgetMs: 10000 }, { hostLimitMs: 10000 }, { drainMs: 0 },
    { mode: 'durable', budgetMs: 13999 }, { mode: 'durable', hostLimitMs: 3999 },
  ]) {
    const result = api.rehearse(input({ condition: 'missing-proof', ...changes }));
    assert.equal(result.status, 'interrupted');
    assert.equal(check(result, 'result-proof').verdict, 'unknown');
    assert.ok(result.checks.some((item) => item.verdict === 'fail'));
  }
});

test('strict numeric, enum, object and exact-key guards reject silent coercion', () => {
  for (const field of ['budgetMs', 'drainMs', 'hostLimitMs']) {
    for (const value of ['8000', '', true, false, null, undefined, NaN, Infinity, -Infinity, 1.5, -1, -0]) {
      assert.throws(() => api.rehearse(input({ [field]: value })), TypeError, `${field}: ${String(value)}`);
    }
  }
  for (const changes of [
    { budgetMs: 0 }, { budgetMs: 60001 }, { drainMs: 12001 },
    { hostLimitMs: 0 }, { hostLimitMs: 30001 },
    { mode: 'live' }, { condition: '<img src=x onerror=alert(1)>' },
  ]) assert.throws(() => api.rehearse(input(changes)), TypeError);
  for (const value of [null, [], 42, false, 'drain', Object.create(api.DEFAULT_INPUT)]) {
    assert.throws(() => api.rehearse(value), TypeError);
  }
  const missing = input();
  delete missing.mode;
  assert.throws(() => api.rehearse(missing), TypeError);
  assert.throws(() => api.rehearse({ ...input(), extra: true }), TypeError);
  assert.throws(() => api.rehearse({ ...input(), [Symbol('extra')]: true }), TypeError);
});

test('model is deterministic, immutable and bounded across the declared fixture matrix', () => {
  let cases = 0;
  for (const mode of api.MODES) for (const condition of api.CONDITIONS) {
    for (const budgetMs of [1, 12000, 14000, 18000, 22000, 60000]) {
      for (const drainMs of [0, 7999, 8000, 12000]) {
        for (const hostLimitMs of [1, 3999, 4000, 10000, 12000, 30000]) {
          const fixture = input({ mode, condition, budgetMs, drainMs, hostLimitMs });
          const before = JSON.stringify(fixture);
          const result = api.rehearse(fixture);
          assert.deepEqual(result, api.rehearse(fixture));
          assert.equal(JSON.stringify(fixture), before);
          assert.ok(Object.isFrozen(result));
          assert.ok(Object.isFrozen(result.trace));
          assert.ok(api.OUTCOMES.includes(result.status));
          assert.equal(result.nativeResult, 'unknown');
          assert.equal(result.originalDeadlineMs, budgetMs);
          assert.ok(result.trace.length <= 10);
          assert.ok(result.trace.every((item, index, all) =>
            Number.isSafeInteger(item.atMs) && item.atMs >= 0
            && item.atMs <= result.elapsedMs
            && (index === 0 || all[index - 1].atMs <= item.atMs)
            && item.operationId === api.OPERATION_ID && item.originalDeadlineMs === budgetMs));
          if (result.status === 'completed') {
            assert.equal(result.completedUnits, 12);
            assert.ok(result.elapsedMs <= budgetMs);
            assert.ok(result.checks.every((item) => item.verdict === 'pass'));
          }
          if (result.status === 'unknown') {
            assert.ok(!result.checks.some((item) => item.verdict === 'fail'));
            assert.ok(result.checks.some((item) => item.verdict === 'unknown'));
          }
          cases++;
        }
      }
    }
  }
  assert.equal(cases, 1152);
});

test('session rejects forged state and unknown or extra-field actions', () => {
  const state = api.createSession();
  for (const forged of [null, {}, { ...state }]) {
    assert.throws(() => api.dispatch(forged, { type: 'RUN', input: input() }), TypeError);
  }
  for (const action of [null, {}, { type: 'FORCE_PASS' }, { type: 'RESET', extra: true }]) {
    assert.throws(() => api.dispatch(state, action), TypeError);
  }
  assert.ok(Object.isFrozen(state));
});

test('prediction checking is one-time, guarded and separate from user impact', () => {
  let state = api.createSession();
  state = api.dispatch(state, { type: 'CHECK', prediction: 'completed' });
  assert.equal(state.phase, 'error');
  assert.equal(state.activeId, null);
  assert.equal(state.history.length, 0);
  state = api.dispatch(state, { type: 'RUN', input: input({ condition: 'forced-stop' }) });
  state = api.dispatch(state, { type: 'CHECK', prediction: 'interrupted' });
  assert.equal(state.phase, 'checked');
  assert.equal(state.history[0].verification.verdict, 'pass');
  assert.equal(state.history[0].result.status, 'interrupted');
  const secondCheck = api.dispatch(state, { type: 'CHECK', prediction: 'completed' });
  assert.equal(secondCheck.phase, 'error');
  assert.equal(secondCheck.activeId, null);
  assert.deepEqual(secondCheck.history, state.history);
  assert.throws(() => { state.history[0].result.status = 'completed'; }, TypeError);
});

test('wrong and invalid predictions cannot rewrite an observed result', () => {
  const run = api.dispatch(api.createSession(), { type: 'RUN', input: input() });
  const wrong = api.dispatch(run, { type: 'CHECK', prediction: 'interrupted' });
  assert.equal(wrong.history[0].verification.verdict, 'fail');
  assert.equal(wrong.history[0].result.status, 'completed');
  const malformed = api.dispatch(run, { type: 'CHECK', prediction: 'native-pass' });
  assert.equal(malformed.phase, 'error');
  assert.equal(malformed.activeId, null);
  assert.deepEqual(malformed.history, run.history);
});

test('invalid inputs and edits clear current success, retaining earlier history', () => {
  const run = api.dispatch(api.createSession(), { type: 'RUN', input: input() });
  const bad = api.dispatch(run, { type: 'RUN', input: input({ budgetMs: NaN }) });
  assert.equal(bad.phase, 'error');
  assert.equal(bad.errorField, 'budgetMs');
  assert.equal(bad.activeId, null);
  assert.deepEqual(bad.history, run.history);
  const edited = api.dispatch(run, { type: 'EDIT' });
  assert.equal(edited.phase, 'ready');
  assert.equal(edited.activeId, null);
  assert.deepEqual(edited.history, run.history);
  const recovered = api.dispatch(bad, { type: 'RUN', input: input({ condition: 'missing-proof' }) });
  assert.equal(recovered.history.length, 2);
  assert.equal(recovered.history[0].result.status, 'completed');
  assert.equal(recovered.history[1].result.status, 'unknown');
});

test('six-run cap never silently prunes records and reset is explicit', () => {
  let state = api.createSession();
  for (let count = 0; count < api.MAX_RUNS; count++) {
    state = api.dispatch(state, { type: 'RUN', input: input({
      condition: count % 2 ? 'forced-stop' : 'normal',
    }) });
  }
  const full = state;
  state = api.dispatch(state, { type: 'RUN', input: input() });
  assert.equal(state.phase, 'error');
  assert.equal(state.activeId, null);
  assert.equal(state.history.length, 6);
  assert.deepEqual(state.history, full.history);
  assert.match(state.error, /Reset explicitly/);
  const reset = api.dispatch(state, { type: 'RESET' });
  assert.deepEqual(reset, api.createSession());
  assert.equal(reset.history.length, 0);
});
