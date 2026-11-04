'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('..\\model.js');

const input = (fixture = 'healthy', path = 'manual', budgetMs = 250) => ({ path, fixture, budgetMs });
const assess = (state = model.initialState(), options = input()) => model.apply(state, { type: 'assess', input: options });
const promote = (state) => model.apply(state, { type: 'promote' });
const measure = (state) => model.apply(state, { type: 'measure' });
const reset = (state) => model.apply(state, { type: 'reset' });
const completed = (fixture = 'healthy', path = 'manual', budgetMs = 250) => {
  const ready = assess(model.initialState(), input(fixture, path, budgetMs));
  return measure(ready.phase === 'ready' ? promote(ready) : ready);
};
const rejects = (operation, code) => assert.throws(operation, (error) => error.code === code);

test('supported Linux path requires explicit promotion and preserves shared compute', () => {
  const state = assess();
  assert.equal(state.phase, 'ready', 'supported manual Linux assessment must produce READY, not a no-op');
  assert.equal(state.current.path, 'manual');
  assert.equal(state.current.target, 'production');
  assert.equal(state.current.source, 'staging');
  assert.equal(state.current.computeWorkers, 2);
  assert.equal(state.current.slots, 2);
  assert.equal(state.current.desiredRoute, 'old-v1');
  assert.equal(state.current.observedRoute, 'not-observed');
  assert.equal(state.current.metrics, null);
  assert.equal(state.history.length, 0);
  const promoted = promote(state);
  assert.equal(promoted.current.computeWorkers, 2);
  assert.equal(promoted.current.productionContent, 'candidate-v2');
  assert.equal(promoted.current.stagingContent, 'old-v1');
  assert.equal(promoted.current.desiredRoute, 'candidate-v2');
  assert.equal(promoted.current.observedRoute, 'not-observed');
  assert.equal(promoted.current.formerWorkers, 'recycled');
  assert.equal(promoted.current.metrics, null);
});

test('controlled pipeline is explicit supported swap, never native auto-swap', () => {
  const state = completed('healthy', 'pipeline');
  assert.equal(state.current.path, 'pipeline');
  assert.equal(state.current.outcome, 'synthetic-uninterrupted');
  assert.equal(state.current.nativeAutoSwap, false);
  assert.match(state.current.actions[1], /explicit.*pipeline/i);
});

test('native auto-swap is rejected on Linux without exposure', () => {
  const state = model.initialState();
  rejects(() => assess(state, input('healthy', 'native-auto-swap')), 'UNSUPPORTED_PATH');
  assert.equal(state.phase, 'idle');
  assert.equal(state.history.length, 0);
});

for (const [fixture, reason] of [
  ['warmup-503', 'WARMUP_STATUS'], ['config-mismatch', 'TARGET_CONFIGURATION'],
  ['overlap-deficit', 'OVERLAP_CAPACITY'],
]) {
  test(`${fixture} blocks exposure and separates old-only production from migration`, () => {
    const state = assess(model.initialState(), input(fixture));
    assert.equal(state.phase, 'aborted');
    assert.ok(state.current.gates.some((gate) => !gate.passed && gate.code === reason));
    assert.equal(state.current.desiredRoute, 'old-v1');
    rejects(() => promote(state), 'STATE_GUARD');
    const measured = measure(state);
    assert.equal(measured.current.outcome, 'safe-abort');
    assert.deepEqual(measured.current.metrics, {
      attempted: 0, successes: 0, interruptions: 0, unknowns: 0, successFraction: null,
      productionAttempted: 3, productionSuccesses: 3, productionInterruptions: 0, productionUnknowns: 0,
    });
    assert.ok(measured.current.receipts.every((receipt) => receipt.frontendVersion === 'old-v1'));
  });
}

test('HTTP 200 is insufficient when target configuration is wrong', () => {
  const state = assess(model.initialState(), input('config-mismatch'));
  assert.equal(state.current.gates.find((gate) => gate.code === 'WARMUP_STATUS').passed, true);
  assert.equal(state.current.gates.find((gate) => gate.code === 'TARGET_CONFIGURATION').passed, false);
  assert.equal(state.phase, 'aborted');
});

test('three fixed complete journeys satisfy the original synthetic budget', () => {
  const state = completed();
  assert.equal(state.current.outcome, 'synthetic-uninterrupted');
  assert.equal(state.current.metrics.attempted, 3);
  assert.equal(state.current.metrics.successes, 3);
  assert.equal(state.current.metrics.interruptions, 0);
  assert.equal(state.current.metrics.unknowns, 0);
  assert.equal(state.current.metrics.successFraction, 1);
  assert.equal(state.current.observedRoute, 'candidate-v2');
  for (const receipt of state.current.receipts) {
    assert.equal(receipt.frontendVersion, 'candidate-v2');
    assert.equal(receipt.apiVersion, 'candidate-v2');
    assert.equal(receipt.authenticationPreserved, true);
    assert.equal(receipt.statePreserved, true);
    assert.equal(receipt.correct, true);
    assert.equal(receipt.effects, receipt.expectedEffects);
    assert.ok(receipt.latencyMs <= 250);
    assert.equal(receipt.outcome, 'success');
  }
  assert.equal(state.current.receipts[2].admittedVersion, 'old-v1');
  assert.equal(state.current.receipts[2].continuation, 'durable-fictional-receipt');
});

test('a tighter original budget records slow HTTP 200 as interruption', () => {
  const state = completed('healthy', 'manual', 150);
  assert.equal(state.current.metrics.successes, 1);
  assert.equal(state.current.metrics.interruptions, 2);
  assert.equal(state.current.metrics.unknowns, 0);
  assert.equal(state.current.outcome, 'interrupted');
  assert.ok(state.current.receipts.slice(1).every((receipt) => receipt.reason === 'ORIGINAL_BUDGET_EXCEEDED'));
});

test('former-worker recycling loses work despite retained slot and rollback retains failures', () => {
  const state = completed('recycle-loss');
  assert.equal(state.current.metrics.attempted, 3);
  assert.equal(state.current.metrics.successes, 2);
  assert.equal(state.current.metrics.interruptions, 1);
  assert.equal(state.current.receipts[2].reason, 'FORMER_WORKER_RECYCLED');
  assert.equal(state.current.outcome, 'interrupted');
  const recovered = model.apply(state, { type: 'rollback' });
  assert.equal(recovered.phase, 'recovery-requested');
  assert.equal(recovered.current.desiredRoute, 'old-v1');
  assert.equal(recovered.current.observedRoute, 'not-observed-after-recovery');
  assert.deepEqual(recovered.current.metrics, state.current.metrics);
  assert.deepEqual(recovered.history[0].metrics, state.history[0].metrics);
  assert.equal(recovered.history[0].outcome, 'interrupted');
  assert.equal(recovered.history[0].recoveryRequested, true);
  rejects(() => model.apply(recovered, { type: 'rollback' }), 'STATE_GUARD');
});

test('missing receipt and missing destination evidence remain unknown in all attempted transitions', () => {
  const state = completed('missing-observation');
  assert.equal(state.current.metrics.attempted, 3);
  assert.equal(state.current.metrics.successes, 1);
  assert.equal(state.current.metrics.interruptions, 0);
  assert.equal(state.current.metrics.unknowns, 2);
  assert.equal(state.current.metrics.successFraction, 1 / 3);
  assert.equal(state.current.outcome, 'unverified');
  assert.equal(state.current.observedRoute, 'partially-observed');
  assert.deepEqual(state.current.receipts.map((receipt) => receipt.outcome), ['success', 'unknown', 'unknown']);
});

test('reset retains failed and unknown run history and default state does not counterfeit success', () => {
  let state = completed('recycle-loss');
  state = reset(state);
  assert.equal(state.phase, 'idle');
  assert.equal(state.current, null);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].metrics.interruptions, 1);
  state = measure(promote(assess(state, input('missing-observation'))));
  state = reset(state);
  assert.equal(state.history.length, 2);
  assert.equal(state.history[1].metrics.unknowns, 2);
  state = measure(promote(assess(state)));
  assert.equal(state.history.length, 3);
  assert.equal(state.history[0].metrics.interruptions, 1);
  assert.equal(state.history[1].metrics.unknowns, 2);
});

test('reset archives an exposed unfinished run as cancelled with all three unknown transitions', () => {
  const state = reset(promote(assess()));
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].outcome, 'cancelled');
  assert.equal(state.history[0].metrics.attempted, 3);
  assert.equal(state.history[0].metrics.successes, 0);
  assert.equal(state.history[0].metrics.unknowns, 3);
  assert.equal(state.history[0].metrics.successFraction, 0);
});

test('reset archives an unexposed unfinished assessment with zero transition sample', () => {
  const state = reset(assess());
  assert.equal(state.history[0].outcome, 'cancelled');
  assert.equal(state.history[0].metrics.attempted, 0);
  assert.equal(state.history[0].metrics.successFraction, null);
});

test('six archived runs bound the lesson without history deletion or duplicate reset records', () => {
  let state = model.initialState();
  for (let index = 0; index < model.MAX_RUNS; index += 1) {
    state = reset(measure(promote(assess(state))));
  }
  assert.equal(state.history.length, 6);
  state = reset(state);
  assert.equal(state.history.length, 6);
  rejects(() => assess(state), 'RUN_LIMIT');
});

for (const [name, value] of [
  ['numeric string', '250'], ['boolean', true], ['null', null], ['NaN', NaN],
  ['infinity', Infinity], ['fraction', 250.5], ['below bound', 99], ['above bound', 501],
]) {
  test(`strict numeric input rejects ${name} without mutation`, () => {
    const state = model.initialState();
    rejects(() => assess(state, input('healthy', 'manual', value)), 'INPUT_GUARD');
    assert.equal(state.phase, 'idle');
    assert.equal(state.history.length, 0);
  });
}

test('budget endpoints are allowed but the immutable fixed requests are unchanged', () => {
  assert.equal(completed('healthy', 'manual', 100).current.metrics.interruptions, 3);
  assert.equal(completed('healthy', 'manual', 500).current.metrics.successes, 3);
  assert.deepEqual(completed().current.receipts.map((receipt) => receipt.latencyMs), [120, 180, 220]);
});

test('strict shape rejects missing, extra, inherited and unknown inputs', () => {
  for (const options of [
    {}, { path: 'manual', fixture: 'healthy' }, { ...input(), target: 'staging' },
    Object.assign(Object.create({ inherited: true }), input()), [],
    input('unknown'), input('healthy', true),
  ]) {
    rejects(() => assess(model.initialState(), options), 'INPUT_GUARD');
  }
});

test('strict commands reject extra fields, nonobjects and unrecognized actions', () => {
  for (const command of [
    null, [], 'promote', {}, { type: 'unknown' }, { type: 'reset', input: {} },
    { type: 'assess', input: input(), force: true }, { type: 'promote', target: 'staging' },
  ]) {
    rejects(() => model.apply(model.initialState(), command), 'COMMAND_GUARD');
  }
});

test('accessors, symbols and nonenumerable extras are rejected before executing getters', () => {
  let invoked = false;
  const accessor = { fixture: 'healthy', budgetMs: 250 };
  Object.defineProperty(accessor, 'path', { enumerable: true, get() { invoked = true; return 'manual'; } });
  rejects(() => assess(model.initialState(), accessor), 'INPUT_GUARD');
  const command = {};
  Object.defineProperty(command, 'type', { enumerable: true, get() { invoked = true; return 'reset'; } });
  rejects(() => model.apply(model.initialState(), command), 'COMMAND_GUARD');
  assert.equal(invoked, false);
  const hidden = input();
  Object.defineProperty(hidden, 'force', { value: true });
  rejects(() => assess(model.initialState(), hidden), 'INPUT_GUARD');
  rejects(() => assess(model.initialState(), { ...input(), [Symbol('force')]: true }), 'INPUT_GUARD');
});

test('issued state and recursively frozen outputs reject forged state or mutation', () => {
  const state = completed();
  rejects(() => model.apply(JSON.parse(JSON.stringify(state)), { type: 'reset' }), 'STATE_GUARD');
  rejects(() => model.apply({ phase: 'ready', current: {} }, { type: 'promote' }), 'STATE_GUARD');
  rejects(() => model.apply(null, { type: 'reset' }), 'STATE_GUARD');
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.current));
  assert.ok(Object.isFrozen(state.current.receipts[0]));
  assert.ok(Object.isFrozen(state.history[0].metrics));
  assert.throws(() => { state.current.metrics.successes = 99; }, TypeError);
  assert.throws(() => { state.history.push({}); }, TypeError);
  assert.throws(() => { model.FIXTURES.healthy = 'native'; }, TypeError);
});

test('premature and repeated actions cannot bypass the state machine', () => {
  for (const type of ['promote', 'measure', 'rollback']) {
    rejects(() => model.apply(model.initialState(), { type }), 'STATE_GUARD');
  }
  const ready = assess();
  rejects(() => assess(ready), 'STATE_GUARD');
  rejects(() => measure(ready), 'STATE_GUARD');
  const promoted = promote(ready);
  rejects(() => promote(promoted), 'STATE_GUARD');
  const measured = measure(promoted);
  rejects(() => measure(measured), 'STATE_GUARD');
  rejects(() => model.apply(measured, { type: 'rollback' }), 'STATE_GUARD');
});

test('all fixture runs are deterministic with disjoint immutable state and history', () => {
  for (const fixture of Object.keys(model.FIXTURES)) {
    assert.deepEqual(completed(fixture), completed(fixture));
  }
  const first = completed('recycle-loss');
  const second = completed();
  assert.equal(first.history[0].metrics.interruptions, 1);
  assert.equal(second.history[0].metrics.interruptions, 0);
  assert.notEqual(first.history, second.history);
});
