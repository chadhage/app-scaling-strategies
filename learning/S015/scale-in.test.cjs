'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, createRehearsal, transition } = require('.\\scale-in.js');
const act = (state, action, payload) => transition(state, action, payload);
const start = (overrides = {}) => act(createRehearsal(), 'start', { ...DEFAULTS, ...overrides });
const advance = (state, count) => {
  for (let n = 0; n < count; n++) state = act(state, 'advance');
  return state;
};
const close = (state = start()) => act(act(state, 'close-admission'), 'probe');
const drain = (overrides = {}) => {
  let state = advance(close(start(overrides)), 4);
  state = act(act(state, 'retire'), 'probe');
  return act(state, 'verify');
};

test('loadable baseline has no attempted work and no claimed native success', () => {
  const state = createRehearsal();
  assert.equal(state.phase, 'IDLE');
  assert.equal(state.metrics.attempted, 0);
  assert.equal(state.metrics.observedSuccessRate, null);
  assert.equal(state.result.nativeOutcome, 'UNVERIFIED');
});

test('starting admits exactly one request and one job to the retiring instance', () => {
  const state = start();
  assert.equal(state.phase, 'RUNNING');
  assert.equal(state.work.length, 2);
  assert.deepEqual(state.work.map((item) => item.kind), ['request', 'job']);
  assert.ok(state.work.every((item) => item.owner === 'retiring-A' && item.admittedAt === 0 && item.deadline === 6));
  assert.equal(state.metrics.pending, 2);
});

test('a closure probe goes to retained-B without removing compute', () => {
  const state = close();
  assert.equal(state.admission, 'CLOSED');
  assert.equal(state.probes.length, 1);
  assert.equal(state.probes[0].owner, 'retained-B');
  assert.equal(state.actualCapacity, 2);
});

test('default drain completes admitted work and actually removes one synthetic instance', () => {
  const state = drain();
  assert.equal(state.result.verifier, 'PASS');
  assert.equal(state.result.workOutcome, 'SUCCESS');
  assert.equal(state.actualCapacity, 1);
  assert.equal(state.retiring, 'RETIRED');
  assert.equal(state.metrics.succeeded, 2);
  assert.equal(state.metrics.observedSuccessRate, 100);
  assert.equal(state.work[1].effects, 1);
  assert.equal(state.metrics.newToRetiring, 0);
});

test('closing admission alone and finishing work cannot stand in for retirement evidence', () => {
  const state = act(advance(close(), 4), 'verify');
  assert.equal(state.result.verifier, 'UNKNOWN');
  assert.equal(state.result.workOutcome, 'SUCCESS');
  assert.equal(state.actualCapacity, 2);
});

test('safe retirement before admitted work finishes is blocked and loses nothing', () => {
  const state = act(close(), 'retire');
  assert.equal(state.lastAction.verdict, 'BLOCKED');
  assert.equal(state.actualCapacity, 2);
  assert.equal(state.metrics.failed, 0);
  assert.equal(state.metrics.pending, 2);
});

test('retirement requires an observed post-closure admission probe', () => {
  const state = act(advance(act(start(), 'close-admission'), 4), 'retire');
  assert.equal(state.lastAction.verdict, 'BLOCKED');
  assert.match(state.lastAction.reason, /probe/i);
});

test('verified success requires a fresh probe after retirement too', () => {
  const state = act(act(advance(close(), 4), 'retire'), 'verify');
  assert.equal(state.result.verifier, 'UNKNOWN');
  assert.equal(state.actualCapacity, 1);
});

test('checkpoint continuation moves only the job with its original clock and deadline', () => {
  const before = close(start({ mechanism: 'checkpoint' }));
  const state = act(before, 'checkpoint');
  assert.equal(state.work.length, 2);
  assert.equal(state.work[0].owner, 'retiring-A');
  assert.equal(state.work[1].owner, 'retained-B');
  assert.equal(state.work[1].deadline, 6);
  assert.equal(state.work[1].dueAt, 4);
  assert.deepEqual(state.work[1].checkpoint, {
    tick: 0, progress: 0, durable: true, from: 'retiring-A', to: 'retained-B', epoch: 2
  });
});

test('a continued job finishes after retirement without duplicate business effects', () => {
  let state = act(close(start({ mechanism: 'checkpoint' })), 'checkpoint');
  state = act(advance(state, 2), 'retire');
  assert.equal(state.actualCapacity, 1);
  assert.equal(state.metrics.pending, 1);
  state = act(advance(act(state, 'probe'), 2), 'verify');
  assert.equal(state.result.verifier, 'PASS');
  assert.equal(state.work[1].effects, 1);
  assert.equal(state.work[1].completedAt, 4);
});

test('checkpoint taken later retains progress without resetting the original deadline', () => {
  const state = act(advance(close(start({ mechanism: 'checkpoint' })), 2), 'checkpoint');
  assert.equal(state.work.length, 2);
  assert.equal(state.work[1].checkpoint.progress, 2);
  assert.equal(state.work[1].dueAt, 4);
  assert.equal(state.work[1].deadline, 6);
});

test('drain-only fixtures cannot invent checkpoint support', () => {
  const state = act(close(), 'checkpoint');
  assert.equal(state.lastAction.verdict, 'BLOCKED');
  assert.equal(state.work.length, 2);
  assert.equal(state.work[1].owner, 'retiring-A');
});

test('missing checkpoint proof keeps ownership and active retirement gate intact', () => {
  const state = act(close(start({ mechanism: 'checkpoint', condition: 'checkpoint-missing' })), 'checkpoint');
  assert.equal(state.lastAction.verdict, 'UNKNOWN');
  assert.equal(state.work.length, 2);
  assert.equal(state.work[1].owner, 'retiring-A');
  assert.equal(state.work[1].checkpointProof, 'UNKNOWN');
  assert.equal(act(advance(state, 2), 'retire').lastAction.verdict, 'BLOCKED');
});

test('unknown checkpoint alone does not erase later directly observed safe drain', () => {
  let state = act(close(start({ mechanism: 'checkpoint', condition: 'checkpoint-missing' })), 'checkpoint');
  state = act(act(advance(state, 4), 'retire'), 'probe');
  assert.equal(act(state, 'verify').result.verifier, 'PASS');
});

test('unqualified opaque host never fabricates closure or actual retirement', () => {
  let state = close(start({ mechanism: 'opaque' }));
  assert.equal(state.admission, 'UNKNOWN');
  assert.equal(state.probes.length, 1);
  assert.equal(state.probes[0].owner, null);
  state = act(advance(state, 4), 'retire');
  assert.equal(state.lastAction.verdict, 'UNKNOWN');
  assert.equal(state.actualCapacity, 2);
  assert.equal(act(state, 'verify').result.verifier, 'UNKNOWN');
});

test('stale admission is a visible failure and prevents safe retirement', () => {
  const state = close(start({ condition: 'stale-routing' }));
  assert.equal(state.metrics.newToRetiring, 1);
  assert.equal(state.probes.length, 1);
  assert.equal(state.probes[0].owner, 'retiring-A');
  assert.equal(act(advance(state, 4), 'retire').lastAction.verdict, 'FAIL');
});

test('unobserved completion is unknown, stays in the denominator, and holds retirement', () => {
  const state = act(advance(close(start({ condition: 'missing-completion' })), 4), 'retire');
  assert.equal(state.lastAction.verdict, 'UNKNOWN');
  assert.equal(state.metrics.attempted, 2);
  assert.equal(state.metrics.unknown, 1);
  assert.equal(state.metrics.succeeded, 1);
  assert.equal(state.actualCapacity, 2);
});

test('missing retirement observation never converts requested capacity into actual capacity', () => {
  const state = act(act(advance(close(start({ condition: 'retirement-unobserved' })), 4), 'retire'), 'probe');
  assert.equal(state.actualCapacity, null);
  assert.equal(state.retiring, 'UNKNOWN');
  assert.equal(act(state, 'verify').result.verifier, 'UNKNOWN');
  assert.equal(state.metrics.succeeded, 2);
});

test('drain-budget failure is distinct from successful work continuity and retains capacity', () => {
  const state = act(advance(close(start({ drainBudget: 3 })), 4), 'retire');
  assert.equal(state.lastAction.verdict, 'FAIL');
  assert.equal(state.metrics.succeeded, 2);
  assert.equal(state.result.workOutcome, 'SUCCESS');
  assert.equal(state.result.verifier, 'FAIL');
  assert.equal(state.actualCapacity, 2);
});

test('completion exactly at original work and drain deadlines is allowed', () => {
  const state = drain({ workBudget: 4, drainBudget: 4 });
  assert.equal(state.result.verifier, 'PASS');
  assert.equal(state.metrics.failed, 0);
});

test('late completion is a known interruption even when retirement is otherwise safe', () => {
  const state = drain({ workBudget: 3 });
  assert.equal(state.metrics.failed, 1);
  assert.equal(state.metrics.succeeded, 1);
  assert.equal(state.result.workOutcome, 'INTERRUPTED');
  assert.equal(state.result.verifier, 'FAIL');
  assert.equal(state.metrics.observedSuccessRate, 50);
});

test('known failed work takes precedence over separate missing proof', () => {
  const state = act(advance(close(start({
    condition: 'missing-completion', requestTicks: 4, jobTicks: 2, workBudget: 1
  })), 4), 'verify');
  assert.equal(state.metrics.failed, 2);
  assert.equal(state.result.verifier, 'FAIL');
  assert.equal(state.result.workOutcome, 'INTERRUPTED');
  assert.ok(state.assertions.some((item) => item.verdict === 'UNKNOWN'));
});

test('terminate-now fault needs explicit confirmation and cannot be an accidental retirement', () => {
  const state = act(close(), 'force-retire', { confirmed: false });
  assert.equal(state.lastAction.verdict, 'INVALID');
  assert.equal(state.actualCapacity, 2);
  assert.equal(state.metrics.failed, 0);
});

test('confirmed fault records known lost work and advancing cannot repair that history', () => {
  const failed = act(close(), 'force-retire', { confirmed: true });
  assert.equal(failed.metrics.failed, 2);
  assert.equal(failed.actualCapacity, 1);
  const later = advance(failed, 5);
  assert.equal(later.metrics.failed, 2);
  assert.equal(later.result.verifier, 'FAIL');
  assert.equal(later.work[1].effects, 0);
  assert.equal(failed.events.length > 0, true);
  assert.deepEqual(later.events[failed.events.length - 1], failed.events.at(-1));
});

test('opaque-host fault does not pretend an unobserved termination happened', () => {
  const state = act(start({ mechanism: 'opaque' }), 'force-retire', { confirmed: true });
  assert.equal(state.lastAction.verdict, 'UNKNOWN');
  assert.equal(state.actualCapacity, 2);
  assert.equal(state.metrics.failed, 0);
});

test('reset restores baseline and archives the failed attempt rather than rewriting it', () => {
  const failed = act(close(), 'force-retire', { confirmed: true });
  const state = act(failed, 'reset');
  assert.equal(state.phase, 'IDLE');
  assert.equal(state.archives.length, 1);
  assert.equal(state.archives[0].result.verifier, 'FAIL');
  assert.equal(state.archives[0].metrics.failed, 2);
  assert.equal(state.work.length, 0);
  assert.equal(state.actualCapacity, 2);
  assert.deepEqual(state.archives[0].events, failed.events);
});

test('current invalid action cannot retain a previous passing verification', () => {
  const passed = drain();
  assert.equal(passed.result.verifier, 'PASS');
  const state = act(passed, 'invented-action');
  assert.equal(state.lastAction.verdict, 'INVALID');
  assert.equal(state.result.verifier, 'INVALID');
  assert.equal(state.metrics.succeeded, 2);
  assert.ok(state.events.some((event) => event.view.result.verifier === 'PASS'));
});

test('every outcome stays in the original two-work denominator', () => {
  const states = [start(), drain(), drain({ workBudget: 3 }),
    advance(close(start({ condition: 'missing-completion' })), 4)];
  assert.ok(states.every((state) => state.metrics.attempted === 2));
  for (const state of states) {
    const m = state.metrics;
    assert.equal(m.succeeded + m.failed + m.unknown + m.pending, m.attempted);
  }
});

test('branded immutable state rejects copied, fabricated, or missing state', () => {
  const state = start();
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.work), true);
  assert.throws(() => act({ ...state }, 'advance'), /state/i);
  assert.throws(() => act(null, 'advance'), /state/i);
  assert.throws(() => { state.work[0].owner = 'attacker'; }, TypeError);
});

test('transitions do not mutate a previous state or its historical snapshots', () => {
  const previous = close();
  const saved = JSON.stringify(previous);
  const current = advance(previous, 4);
  assert.notStrictEqual(current, previous);
  assert.equal(JSON.stringify(previous), saved);
  assert.equal(current.events.length, previous.events.length + 4);
  assert.deepEqual(current.events[0], previous.events[0]);
});

test('logical time and per-attempt history are bounded without deleting old evidence', () => {
  let state = start();
  for (let n = 0; n < 80; n++) state = act(state, 'advance');
  assert.equal(state.tick, 12);
  assert.equal(state.lastAction.verdict, 'LIMIT');
  assert.ok(state.events.length <= 48);
  assert.equal(state.events[0].action, 'start');
});

test('full archives refuse a destructive reset instead of silently evicting failed runs', () => {
  let state = createRehearsal();
  for (let n = 0; n < 4; n++) {
    state = act(state, 'start', DEFAULTS);
    state = act(state, 'reset');
  }
  assert.equal(state.archives.length, 4);
  state = act(state, 'start', DEFAULTS);
  const retained = JSON.stringify(state.archives);
  state = act(state, 'reset');
  assert.equal(state.lastAction.verdict, 'LIMIT');
  assert.equal(state.phase, 'RUNNING');
  assert.equal(JSON.stringify(state.archives), retained);
});

for (const [name, value] of [
  ['missing', undefined], ['null', null], ['array', []], ['extra field', { ...DEFAULTS, surprise: true }],
  ['numeric string', { ...DEFAULTS, requestTicks: '2' }],
  ['boolean', { ...DEFAULTS, requestTicks: true }],
  ['fraction', { ...DEFAULTS, requestTicks: 1.5 }],
  ['NaN', { ...DEFAULTS, jobTicks: NaN }],
  ['infinity', { ...DEFAULTS, workBudget: Infinity }],
  ['zero', { ...DEFAULTS, drainBudget: 0 }],
  ['over limit', { ...DEFAULTS, jobTicks: 9 }],
  ['unknown mechanism', { ...DEFAULTS, mechanism: 'magic-drain' }],
  ['unknown condition', { ...DEFAULTS, condition: '<img onerror=alert(1)>' }],
  ['unsupported combination', { ...DEFAULTS, condition: 'checkpoint-missing' }]
]) {
  test(`strict configuration rejects ${name} without admitting work`, () => {
    const state = act(createRehearsal(), 'start', value);
    assert.equal(state.lastAction.verdict, 'INVALID');
    assert.equal(state.phase, 'IDLE');
    assert.equal(state.work.length, 0);
    assert.equal(state.actualCapacity, 2);
  });
}

test('out-of-order commands and unexpected payloads cannot alter work or capacity', () => {
  const idle = act(createRehearsal(), 'retire');
  assert.equal(idle.lastAction.verdict, 'BLOCKED');
  const state = act(start(), 'advance', { tick: 100 });
  assert.equal(state.lastAction.verdict, 'INVALID');
  assert.equal(state.tick, 0);
});
