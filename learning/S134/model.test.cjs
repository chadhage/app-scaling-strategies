'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const lesson = require('./model.js');
const { createState, execute, LEDGERS, LEDGER_IDS, INTENT } = lesson;
const load = { type: 'load', checkoutId: 'CHECKOUT-DEMO-01' };
const retry = { type: 'retry' };
const inspect = { type: 'inspect' };
const select = (ledgerId) => ({ type: 'select', ledgerId });
const clone = (value) => structuredClone(value);
function inspected(state = createState()) {
  return execute(execute(execute(state, load), retry), inspect);
}
function conduct(ledgerId, state = createState()) {
  return execute(inspected(state), select(ledgerId));
}
function rejectsUnchanged(state, command, code) {
  const before = clone(state);
  assert.throws(() => execute(state, command), (error) => error.code === code && /Safe hold/.test(error.message));
  assert.deepEqual(state, before);
}

test('loading response-loss DATA must retain the interruption and unknown first outcome', () => {
  const state = lesson.execute(lesson.createState(), {
    type: 'load',
    checkoutId: 'CHECKOUT-DEMO-01',
  });
  assert.equal(state.phase, 'lost');
  assert.equal(state.active.initial.interruption, 'response-lost');
  assert.equal(state.active.initial.effectOutcome, 'unknown');
  assert.equal(state.history.length, 1);
});

test('load, retry and inspection reveal only fixed DATA and do not certify any effect', () => {
  let state = execute(createState(), load);
  assert.equal(state.active.initial.ack, 'missing');
  assert.equal(state.active.initial.response, null);
  assert.equal(state.active.result, null);
  assert.equal(state.runs.length, 0);
  state = execute(state, retry);
  assert.equal(state.phase, 'retried');
  assert.equal(state.active.retryRevealed, true);
  assert.equal(state.active.result, null);
  state = execute(state, inspect);
  assert.equal(state.phase, 'inspected');
  assert.equal(state.active.inspected, true);
  assert.equal(state.history.length, 3);
  assert.equal(state.runs.length, 0);
  assert.deepEqual(state.active.initial, lesson.INITIAL);
});

for (const [ledgerId, outcome, counts, client, oneOrder] of [
  ['kept-key', 'positive', [1, 1, 1], 'correct', true],
  ['fresh-key', 'negative', [2, 2, 2], 'incorrect', false],
  ['wrong-response', 'negative', [1, 1, 1], 'incorrect', true],
  ['lost-state', 'negative', [1, 1, 1], 'incorrect', false],
  ['wrong-identity', 'negative', [1, 1, 1], 'incorrect', false],
  ['unacknowledged', 'unknown', [1, 1, 1], 'unresolved', true],
  ['unobserved', 'unknown', [null, null, null], 'unresolved', null],
]) {
  test(`${ledgerId}: counts, client result and ${outcome} conclusion are independently measured`, () => {
    const state = conduct(ledgerId);
    const result = state.active.result;
    assert.equal(state.phase, 'measured');
    assert.equal(result.outcome, outcome);
    assert.deepEqual([result.counts.orders, result.counts.effects, result.counts.paymentMarkers], counts);
    assert.equal(result.counts.attempts, 2);
    assert.equal(result.clientOutcome, client);
    assert.equal(result.oneCorrectOrder, oneOrder);
    assert.equal(result.measuredFrom, 'fixed-fictional-ledger');
    assert.equal(result.interruptionCount, 1);
    assert.equal(result.initialInterruption, 'response-lost');
    assert.equal(result.unknownObservations.includes('first response (lost)'), true);
    assert.equal(result.unknownObservations.includes('first attempt effect outcome at response-loss boundary'), true);
    assert.deepEqual(state.active.initial, lesson.INITIAL);
    assert.deepEqual(state.runs, [result]);
    assert.deepEqual([LEDGERS[ledgerId].orders, LEDGERS[ledgerId].effects, LEDGERS[ledgerId].payments]
      .map((data) => data === null ? null : data.length), counts);
  });
}

test('missing ACK is neither a failed/successful order nor permission for a new key', () => {
  const noReply = conduct('unacknowledged').active.result;
  const unknown = conduct('unobserved').active.result;
  const duplicate = conduct('fresh-key').active.result;
  assert.equal(noReply.retryAck, 'missing');
  assert.equal(noReply.oneCorrectOrder, true);
  assert.equal(noReply.clientOutcome, 'unresolved');
  assert.equal(noReply.outcome, 'unknown');
  assert.equal(unknown.oneCorrectOrder, null);
  assert.equal(unknown.counts.orders, null);
  assert.equal(unknown.outcome, 'unknown');
  assert.equal(duplicate.outcome, 'negative');
  assert.equal(duplicate.sameKey, false);
  assert.equal(duplicate.reasonCodes.includes('KEY_CHANGED'), true);
  assert.equal(noReply.reasonCodes.some((code) => /ACK.*FAIL|ACK.*SUCCESS/.test(code)), false);
});

test('an acknowledged synthetic 200 cannot conceal order, response, identity or state failure', () => {
  for (const ledgerId of ['fresh-key', 'wrong-response', 'lost-state', 'wrong-identity']) {
    assert.equal(LEDGERS[ledgerId].retry.ack, 'present');
    assert.equal(LEDGERS[ledgerId].retry.response.statusCode, 200);
    assert.equal(conduct(ledgerId).active.result.outcome, 'negative');
  }
  assert.equal(conduct('lost-state').active.result.statePreserved, false);
  assert.equal(conduct('wrong-identity').active.result.identityPreserved, false);
  assert.equal(conduct('wrong-response').active.result.reasonCodes.includes('CLIENT_RESULT_MISMATCH'), true);
});

test('a later positive run retains every previous negative, unknown and original interruption', () => {
  let state = conduct('fresh-key');
  const first = clone(state.runs[0]);
  state = conduct('unobserved', state);
  const second = clone(state.runs[1]);
  state = conduct('kept-key', state);
  assert.deepEqual(state.runs.map((run) => run.outcome), ['negative', 'unknown', 'positive']);
  assert.deepEqual(state.runs[0], first);
  assert.deepEqual(state.runs[1], second);
  assert.equal(state.history.length, 12);
  assert.equal(state.runs.reduce((total, run) => total + run.interruptionCount, 0), 3);
  assert.equal(state.runs.every((run) => run.unknownObservations.length >= 2), true);
});

test('four complete runs retain sixteen actions and a seventeenth action holds without pruning', () => {
  let state = createState();
  for (const id of ['fresh-key', 'unobserved', 'kept-key', 'unacknowledged']) state = conduct(id, state);
  assert.equal(state.runs.length, lesson.MAX_RUNS);
  assert.equal(state.history.length, lesson.MAX_ACTIONS);
  assert.deepEqual(state.history.map((event) => event.sequence), Array.from({ length: 16 }, (_, i) => i + 1));
  rejectsUnchanged(state, load, 'ERR_LIMIT');
  rejectsUnchanged(state, retry, 'ERR_LIMIT');
  assert.deepEqual(createState(), { version: 1, phase: 'ready', active: null, history: [], runs: [] });
  assert.equal(state.history.length, 16);
});

test('exact state/command ordering rejects premature or repeated actions without mutation', () => {
  rejectsUnchanged(createState(), retry, 'ERR_STATE');
  rejectsUnchanged(createState(), inspect, 'ERR_STATE');
  rejectsUnchanged(createState(), select('kept-key'), 'ERR_STATE');
  const loaded = execute(createState(), load);
  rejectsUnchanged(loaded, load, 'ERR_STATE');
  rejectsUnchanged(loaded, inspect, 'ERR_STATE');
  rejectsUnchanged(loaded, select('kept-key'), 'ERR_STATE');
  const retried = execute(loaded, retry);
  rejectsUnchanged(retried, retry, 'ERR_STATE');
  rejectsUnchanged(retried, select('kept-key'), 'ERR_STATE');
  const observed = execute(retried, inspect);
  rejectsUnchanged(observed, inspect, 'ERR_STATE');
  const measured = execute(observed, select('kept-key'));
  rejectsUnchanged(measured, select('kept-key'), 'ERR_STATE');
});

test('exact tokens reject coercion, whitespace, inherited names and extra fields', () => {
  const bad = [
    null, undefined, true, 1, 'load', [], new Date(0),
    { type: 'Load', checkoutId: INTENT.checkoutId },
    { type: 'constructor' }, { type: '__proto__' }, { type: 'reset' }, { type: 'retry', extra: false },
    { type: 'load' }, { type: 'load', checkoutId: INTENT.checkoutId, amount: 1 },
    ...[null, 1, true, {}, [], new String(INTENT.checkoutId), ' CHECKOUT-DEMO-01', 'CHECKOUT-DEMO-01 ', 'checkout-demo-01', '<script>']
      .map((checkoutId) => ({ type: 'load', checkoutId })),
    Object.create({ type: 'load', checkoutId: INTENT.checkoutId }),
    Object.assign(Object.create(null), load),
    { type: 'load', checkoutId: INTENT.checkoutId, [Symbol('extra')]: true },
  ];
  for (const command of bad) rejectsUnchanged(createState(), command, 'ERR_INPUT');
  const observed = inspected();
  for (const id of [null, undefined, 1, true, {}, [], 'kept-key ', 'constructor', '__proto__', 'toString']) {
    rejectsUnchanged(observed, select(id), 'ERR_INPUT');
  }
});

test('accessor-backed, hidden, symbolic, cyclic or sparse DATA is rejected without evaluating getters', () => {
  let getterCalls = 0;
  const command = { type: 'load' };
  Object.defineProperty(command, 'checkoutId', { enumerable: true, get() { getterCalls++; return INTENT.checkoutId; } });
  rejectsUnchanged(createState(), command, 'ERR_INPUT');
  const hidden = { ...load };
  Object.defineProperty(hidden, 'hidden', { value: true });
  rejectsUnchanged(createState(), hidden, 'ERR_INPUT');
  const cyclic = { ...load };
  cyclic.extra = cyclic;
  rejectsUnchanged(createState(), cyclic, 'ERR_INPUT');
  const state = clone(conduct('kept-key'));
  Object.defineProperty(state.active.initial, 'ack', { enumerable: true, get() { getterCalls++; return 'present'; } });
  assert.throws(() => execute(state, load), (error) => error.code === 'ERR_STATE');
  const arrayState = clone(conduct('kept-key'));
  Object.defineProperty(arrayState.history, '0', { enumerable: true, get() { getterCalls++; return {}; } });
  assert.throws(() => execute(arrayState, load), (error) => error.code === 'ERR_STATE');
  const sparse = clone(conduct('kept-key'));
  delete sparse.history[1];
  assert.throws(() => execute(sparse, load), (error) => error.code === 'ERR_STATE');
  assert.equal(getterCalls, 0);
});

test('history replay rejects forged phase, state, identity, ACK, counts, outcomes and omitted attempts', () => {
  const original = conduct('unobserved');
  const mutations = [
    (s) => { s.version = '1'; },
    (s) => { s.phase = 'ready'; },
    (s) => { s.extra = 'optimistic'; },
    (s) => { s.active.initial.ack = 'present'; },
    (s) => { s.active.initial.effectOutcome = 'success'; },
    (s) => { s.active.checkoutId = 'CHECKOUT-DEMO-OTHER'; },
    (s) => { s.active.result.counts.orders = 1; },
    (s) => { s.active.result.outcome = 'positive'; },
    (s) => { s.runs[0].interruptionCount = 0; },
    (s) => { s.runs[0].unknownObservations = []; },
    (s) => { s.runs = []; },
    (s) => { s.history.pop(); },
    (s) => { s.history[0].sequence = 0; },
    (s) => { s.history[1].command = inspect; },
    (s) => { s.history[3].command.ledgerId = 'kept-key'; },
    (s) => { s.history[1].hidden = true; },
    (s) => { s.history = Array.from({ length: 17 }, () => s.history[0]); },
  ];
  for (const mutate of mutations) {
    const state = clone(original);
    mutate(state);
    rejectsUnchanged(state, load, 'ERR_STATE');
  }
});

test('deterministic replay permits an equivalent plain clone and preserves immutable fixture bytes', () => {
  const state = conduct('fresh-key');
  const reordered = {
    runs: clone(state.runs), active: clone(state.active), history: clone(state.history),
    phase: state.phase, version: state.version,
  };
  assert.deepEqual(execute(reordered, load), execute(state, load));
  assert.deepEqual(conduct('kept-key'), conduct('kept-key'));
  function deeplyFrozen(value) {
    if (value !== null && typeof value === 'object') {
      assert.equal(Object.isFrozen(value), true);
      Object.values(value).forEach(deeplyFrozen);
    }
  }
  deeplyFrozen(state);
  deeplyFrozen(LEDGERS);
  assert.throws(() => { state.active.result.outcome = 'positive'; }, TypeError);
  assert.throws(() => { LEDGERS.unobserved.orders = []; }, TypeError);
  assert.throws(() => { state.history.pop(); }, TypeError);
  assert.deepEqual(LEDGER_IDS, ['kept-key', 'fresh-key', 'wrong-response', 'lost-state', 'wrong-identity', 'unacknowledged', 'unobserved']);
});
