'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, createSession, decide, resetSession, totals, MAX_ATTEMPTS } = require('../model.js');
const input = (fixture = 'cold-gap', budgetSeconds = 6, answer = 'promise-met') => ({ fixture, budgetSeconds, answer });
const rejects = (operation, code) => assert.throws(operation, (error) => error.code === code);

test('cold standby violates the recovery promise despite eventual recovery', () => {
  const observed = evaluate({ fixture: 'cold-gap', budgetSeconds: 6, answer: 'promise-met' });
  assert.equal(observed.acceptance, 'failure');
  assert.equal(observed.verifier, 'fail');
  assert.equal(observed.expectedAnswer, 'promise-violated');
  assert.equal(observed.selected.timing, 'failure');
  assert.equal(observed.selected.recoverySeconds, 20);
  assert.equal(observed.selected.retentionAcceptance, 'failure');
  assert.equal(observed.selected.readinessThroughout, false);
  assert.equal(observed.selected.minimumReadyCapacity, 0);
  assert.equal(observed.selected.recoveredCapacity, 12);
  assert.deepEqual(observed.selected.phases.map((phase) => phase.durationSeconds), [4, 12, 2, 2]);
  assert.deepEqual(observed.selected.phases.map((phase) => phase.cumulativeSeconds), [4, 16, 18, 20]);
  assert.match(observed.selected.reasons.join(' '), /20 s exceeds the original 6 s budget/);
  assert.deepEqual(observed.comparison.map((reference) => reference.recoverySeconds), [4, 20]);
  assert.deepEqual(observed.comparison.map((reference) => reference.acceptance), ['success', 'failure']);
  assert.equal(observed.coldDelaySeconds, 16);
});

test('warm ready compatible retained capacity meets both declared synthetic budgets', () => {
  for (const budget of [6, 24]) {
    const observed = evaluate(input('warm-ready', budget));
    assert.equal(observed.acceptance, 'success');
    assert.equal(observed.verifier, 'pass');
    assert.equal(observed.selected.timing, 'success');
    assert.equal(observed.selected.retentionAcceptance, 'success');
    assert.equal(observed.selected.readinessThroughout, true);
    assert.equal(observed.selected.minimumReadyCapacity, 12);
    assert.equal(observed.selected.requiredCapacity, 10);
    assert.equal(observed.selected.compatible, true);
    assert.equal(observed.selected.recoverySeconds, 4);
    assert.equal(observed.selected.retentionSeconds, 300);
    assert.equal(observed.selected.rollbackAtSeconds, 240);
  }
});

test('a safe failure answer passes only its verifier, never the broken promise', () => {
  const state = decide(createSession(), input('cold-gap', 6, 'promise-violated'));
  assert.equal(state.current.result.acceptance, 'failure');
  assert.equal(state.current.result.verifier, 'pass');
  assert.deepEqual(totals(state), { attempted: 1, success: 0, failure: 1, unknown: 0, evidence: 'synthetic-only' });
});

test('larger budget can meet cold timing but cannot repair readiness or rewrite earlier budgets', () => {
  let state = decide(createSession(), input('cold-gap', 6, 'promise-violated'));
  state = decide(resetSession(state), input('cold-gap', 24, 'promise-violated'));
  assert.equal(state.current.result.selected.recoverySeconds, 20);
  assert.equal(state.current.result.selected.timing, 'success');
  assert.equal(state.current.result.selected.retentionAcceptance, 'failure');
  assert.equal(state.current.result.acceptance, 'failure');
  assert.equal(state.current.result.verifier, 'pass');
  assert.deepEqual(state.history.map((record) => record.input.budgetSeconds), [6, 24]);
  assert.deepEqual(state.history.map((record) => record.result.selected.timing), ['failure', 'success']);
  assert.deepEqual(totals(state), { attempted: 2, success: 0, failure: 2, unknown: 0, evidence: 'synthetic-only' });
});

test('fresh probes and short timing cannot substitute for sufficient retained and recovered capacity', () => {
  const observed = evaluate(input('capacity-shortfall', 6, 'promise-violated'));
  assert.equal(observed.selected.readinessThroughout, true);
  assert.equal(observed.selected.minimumReadyCapacity, 6);
  assert.equal(observed.selected.recoveredCapacity, 6);
  assert.equal(observed.selected.recoverySeconds, 4);
  assert.equal(observed.selected.timing, 'success');
  assert.equal(observed.acceptance, 'failure');
  assert.equal(observed.verifier, 'pass');
  assert.match(observed.selected.reasons.join(' '), /below required 10.*cannot serve/);
});

test('missing selected evidence is unknown even though reference timings are available', () => {
  const observed = evaluate(input('missing-evidence', 6, 'unverified'));
  assert.equal(observed.acceptance, 'unknown');
  assert.equal(observed.verifier, 'pass');
  assert.equal(observed.expectedAnswer, 'unverified');
  assert.equal(observed.selected.timing, 'unknown');
  assert.equal(observed.selected.retentionAcceptance, 'unknown');
  assert.equal(observed.selected.recoverySeconds, null);
  assert.equal(observed.selected.minimumReadyCapacity, null);
  assert.equal(observed.selected.compatible, null);
  assert.deepEqual(observed.selected.phases.map((phase) => phase.cumulativeSeconds), [0, null, null, null]);
  assert.deepEqual(observed.comparison.map((reference) => reference.recoverySeconds), [4, 20]);
  assert.equal(evaluate(input('missing-evidence', 24)).verifier, 'fail');
});

test('all four fixtures, two budgets and three answers have deterministic frozen results', () => {
  for (const fixture of ['warm-ready', 'cold-gap', 'missing-evidence', 'capacity-shortfall']) {
    for (const budget of [6, 24]) {
      for (const answer of ['promise-met', 'promise-violated', 'unverified']) {
        const observed = evaluate(input(fixture, budget, answer));
        assert.deepEqual(observed, evaluate(input(fixture, budget, answer)));
        assert.equal(observed.verifier, observed.expectedAnswer === answer ? 'pass' : 'fail');
        assert.equal(Object.isFrozen(observed), true);
        assert.equal(Object.isFrozen(observed.selected.phases), true);
        assert.equal(Object.isFrozen(observed.selected.phases[0]), true);
      }
    }
  }
});

test('invalid input shape, aliases, coercion and extra fields are rejected without a decision', () => {
  const invalid = [
    undefined, null, [], {}, 'cold-gap', { ...input(), extra: true },
    { ...input(), fixture: 'warm' }, { ...input(), fixture: '__proto__' },
    { ...input(), fixture: { toString: () => 'warm-ready' } }, { ...input(), fixture: Symbol('warm-ready') },
    ...['6', '06', 4, 0, -1, 25, 6.5, NaN, Infinity, null, 6n, new Number(6)].map((budgetSeconds) => ({ ...input(), budgetSeconds })),
    { ...input(), answer: 'success' }, { ...input(), answer: null }, { ...input(), answer: true },
    Object.assign(Object.create(null), input()), { ...input(), [Symbol('extra')]: true },
  ];
  const state = createSession();
  for (const candidate of invalid) {
    rejects(() => evaluate(candidate), 'ERR_INPUT');
    rejects(() => decide(state, candidate), 'ERR_INPUT');
    assert.equal(state.history.length, 0);
  }
});

test('input accessors are rejected without being invoked', () => {
  let read = false;
  const candidate = { budgetSeconds: 6, answer: 'promise-met' };
  Object.defineProperty(candidate, 'fixture', { enumerable: true, get() { read = true; return 'warm-ready'; } });
  rejects(() => evaluate(candidate), 'ERR_INPUT');
  assert.equal(read, false);
});

test('empty state is no evidence and decisions require an explicit current reset', () => {
  const empty = createSession();
  assert.deepEqual(totals(empty), { attempted: 0, success: 0, failure: 0, unknown: 0, evidence: 'none' });
  const checked = decide(empty, input());
  assert.equal(checked.phase, 'checked');
  rejects(() => decide(checked, input('warm-ready')), 'ERR_STATE');
  assert.equal(checked.history.length, 1);
  const reset = resetSession(checked);
  assert.equal(reset.phase, 'ready');
  assert.equal(reset.current, null);
  assert.deepEqual(reset.history, checked.history);
  assert.equal(checked.current.result.acceptance, 'failure');
});

test('failure and unknown accounting survives later success and any current reset', () => {
  let state = createSession();
  for (const candidate of [input(), input('warm-ready'), input('missing-evidence', 6, 'unverified'), input('cold-gap', 24, 'promise-violated')]) {
    state = decide(resetSession(state), candidate);
  }
  const before = totals(state);
  assert.deepEqual(before, { attempted: 4, success: 1, failure: 2, unknown: 1, evidence: 'synthetic-only' });
  assert.equal(before.success + before.failure + before.unknown, before.attempted);
  for (let i = 0; i < 3; i += 1) state = resetSession(state);
  assert.deepEqual(totals(state), before);
  assert.deepEqual(state.history.map((record) => record.result.acceptance), ['failure', 'success', 'unknown', 'failure']);
  assert.deepEqual(state.history.map((record) => record.input.budgetSeconds), [6, 6, 6, 24]);
});

test('six-check history is bounded and reset cannot erase failures or renew its allowance', () => {
  assert.equal(MAX_ATTEMPTS, 6);
  let state = createSession();
  for (let i = 0; i < MAX_ATTEMPTS; i += 1) state = decide(resetSession(state), input());
  state = resetSession(state);
  const before = JSON.stringify(state);
  rejects(() => decide(state, input('warm-ready')), 'ERR_HISTORY_LIMIT');
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(totals(state), { attempted: 6, success: 0, failure: 6, unknown: 0, evidence: 'synthetic-only' });
});

test('issued state and retained inputs/results are deeply immutable', () => {
  const candidate = input();
  const state = decide(createSession(), candidate);
  candidate.budgetSeconds = 24;
  assert.equal(state.current.input.budgetSeconds, 6);
  for (const value of [state, state.history, state.current, state.current.input, state.current.result, state.current.result.selected]) {
    assert.equal(Object.isFrozen(value), true);
  }
  assert.throws(() => { state.history.length = 0; }, TypeError);
  assert.throws(() => { state.current.result.acceptance = 'success'; }, TypeError);
  assert.throws(() => { state.current.input.budgetSeconds = 24; }, TypeError);
});

test('forged, serialized, altered and impossible states cannot enter the in-memory state machine', () => {
  const valid = decide(createSession(), input());
  const clone = () => JSON.parse(JSON.stringify(valid));
  const altered = [
    undefined, null, [], {}, { ...createSession(), schemaVersion: 2 },
    { ...createSession(), phase: 'other' }, { ...createSession(), extra: true },
    { ...createSession(), current: valid.current }, { ...createSession(), phase: 'checked' },
    clone(),
  ];
  const wrongOutcome = clone();
  wrongOutcome.history[0].result.acceptance = 'success';
  const wrongBudget = clone();
  wrongBudget.history[0].input.budgetSeconds = 24;
  const wrongPhase = clone();
  wrongPhase.current = null;
  const wrongTrace = clone();
  wrongTrace.history[0].result.selected.phases[0].durationSeconds = 0;
  altered.push(wrongOutcome, wrongBudget, wrongPhase, wrongTrace);
  for (const state of altered) {
    rejects(() => decide(state, input('warm-ready')), 'ERR_STATE');
    rejects(() => resetSession(state), 'ERR_STATE');
    rejects(() => totals(state), 'ERR_STATE');
  }
  assert.equal(valid.current.result.acceptance, 'failure');
  assert.equal(valid.history.length, 1);
});
