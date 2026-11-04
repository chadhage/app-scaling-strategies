'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLesson, parseControls, FIXTURE, OPTIONS, MAX_RUNS, MAX_HISTORY } = require('..\\model.js');

const settings = Object.freeze({
  maxUnavailable: 0,
  maxSurge: 1,
  probe: 'readiness-startup',
  headroom: 'available',
  graceSeconds: 20,
  observation: 'complete',
});

test('observed gates and sufficient grace preserve two transitions in one synthetic step', () => {
  const lesson = createLesson();
  lesson.dispatch({ type: 'configure', settings });
  lesson.dispatch({ type: 'observe' });
  lesson.dispatch({ type: 'rollout' });
  const state = lesson.dispatch({ type: 'drain' });
  assert.equal(state.result.successfulTransitions, 2);
  assert.equal(state.result.interruptedTransitions, 0);
  assert.equal(state.result.unknownTransitions, 0);
  assert.equal(state.phase, 'done');
  assert.equal(state.result.readyFloor, 3);
  assert.equal(state.result.peakPods, 4);
  assert.equal(state.result.drain.availableSeconds, 16);
  assert.equal(state.result.drain.succeeded, 2);
  assert.equal(state.result.verification, 'pass');
  assert.equal(state.result.nativeQualified, false);
});

function run(overrides = {}) {
  const lesson = createLesson();
  lesson.dispatch({ type: 'configure', settings: { ...settings, ...overrides } });
  lesson.dispatch({ type: 'observe' });
  lesson.dispatch({ type: 'rollout' });
  if (lesson.snapshot().phase === 'rolling') lesson.dispatch({ type: 'drain' });
  return lesson;
}

function rejectUnchanged(lesson, action, code) {
  const before = lesson.snapshot();
  assert.throws(() => lesson.dispatch(action), (error) => error.code === code);
  assert.strictEqual(lesson.snapshot(), before);
}

test('fixed node reservations establish headroom without inventing capacity', () => {
  const lesson = run();
  const observed = lesson.snapshot().observation;
  assert.equal(observed.nodes.length, 3);
  assert.equal(observed.pods.length, 4);
  assert.equal(observed.nodes.reduce((sum, node) => sum + node.podSlots - node.oldSlots - node.otherReservedSlots, 0), 1);
  assert.equal(observed.availableSlots, 1);
  assert.equal(observed.candidateReady, true);
  assert.equal(observed.observedReadyBefore, 3);
  assert.equal(FIXTURE.mode, 'fixed fictional teaching DATA ONLY');
});

for (const maxSurge of [0, 1]) {
  test(`maxUnavailable 1 / maxSurge ${maxSurge} interrupts a transition despite PDB minimum 2`, () => {
    const result = run({ maxUnavailable: 1, maxSurge }).snapshot().result;
    assert.equal(result.readyFloor, 2);
    assert.equal(FIXTURE.pdbMinAvailable, 2);
    assert.equal(result.successfulTransitions, 1);
    assert.equal(result.interruptedTransitions, 1);
    assert.equal(result.journeys[1].http, 503);
    assert.equal(result.verification, 'fail');
    assert.equal(result.transition, 'interrupted');
    assert.match(result.scope, /PDB is not a rollout guard/);
  });
}

test('short grace spends PreStop on the same clock and retains both old-work interruptions', () => {
  const result = run({ graceSeconds: 10 }).snapshot().result;
  assert.equal(result.drain.availableSeconds, 6);
  assert.equal(result.drain.preStopSeconds, 4);
  assert.deepEqual(result.drain.requests.map((request) => request.remainingSeconds), [8, 14]);
  assert.equal(result.drain.interrupted, 2);
  assert.equal(result.drain.succeeded, 0);
  assert.equal(result.successfulTransitions, 2);
  assert.equal(result.transition, 'interrupted');
  assert.equal(result.verification, 'fail');
  assert.equal(result.cleanup, 'synthetic-interrupted-drain');
});

for (const [name, overrides] of [
  ['full headroom', { headroom: 'full' }],
  ['failed candidate readiness', { observation: 'readiness-failed' }],
]) {
  test(`${name} safely aborts before candidate exposure, not a successful migration`, () => {
    const lesson = run(overrides);
    const state = lesson.snapshot();
    assert.equal(state.phase, 'held');
    assert.equal(state.result.transition, 'safe-abort-before-exposure');
    assert.equal(state.result.verification, 'pass');
    assert.equal(state.result.attemptedTransitions, 0);
    assert.equal(state.result.successfulTransitions, 0);
    assert.equal(state.result.oldOnly.succeeded, 2);
    assert.equal(state.result.drain.attempted, 0);
    assert.equal(state.result.peakPods, 3);
    rejectUnchanged(lesson, { type: 'drain' }, 'ERR_STATE');
  });
}

for (const [name, overrides] of [
  ['unknown headroom', { headroom: 'unknown' }],
  ['missing readiness', { observation: 'readiness-unknown' }],
  ['startup-only probe', { probe: 'startup-only' }],
  ['desired-only observation', { observation: 'desired-only' }],
]) {
  test(`${name} remains unverified without manufactured ready capacity`, () => {
    const state = run(overrides).snapshot();
    assert.equal(state.phase, 'held');
    assert.equal(state.result.verification, 'unverified');
    assert.equal(state.result.transition, 'unknown');
    assert.equal(state.result.successfulTransitions, 0);
    assert.equal(state.result.attemptedTransitions, 0);
    assert.ok(state.result.unknowns.length > 0);
  });
}

test('desired 3 is distinct from observed ready 1 and missing readiness 1', () => {
  const result = run({ observation: 'desired-only' }).snapshot().result;
  assert.equal(result.desiredReplicas, 3);
  assert.equal(result.observedReadyBefore, 1);
  assert.equal(result.unknownOldReadiness, 1);
  assert.equal(result.readyFloor, 1);
  assert.equal(result.verification, 'unverified');
});

test('startup succeeds but does not become readiness evidence', () => {
  const state = run({ probe: 'startup-only' }).snapshot();
  assert.equal(state.observation.pods.every((pod) => pod.startup === true && pod.ready === null), true);
  assert.equal(state.result.observedReadyBefore, 0);
  assert.equal(state.result.unknownOldReadiness, 3);
  assert.equal(state.result.verification, 'unverified');
});

test('ready probes and HTTP 200 do not hide incompatible business-state interruptions', () => {
  const result = run({ observation: 'state-failed' }).snapshot().result;
  assert.equal(result.journeys.every((journey) => journey.http === 200), true);
  assert.equal(result.observedReadyBefore, 3);
  assert.equal(result.successfulTransitions, 0);
  assert.equal(result.interruptedTransitions, 2);
  assert.equal(result.drain.succeeded, 2);
  assert.equal(result.verification, 'fail');
});

test('missing business-state outcomes retain both unknown transitions', () => {
  const result = run({ observation: 'state-unknown' }).snapshot().result;
  assert.equal(result.attemptedTransitions, 2);
  assert.equal(result.successfulTransitions, 0);
  assert.equal(result.interruptedTransitions, 0);
  assert.equal(result.unknownTransitions, 2);
  assert.equal(result.drain.succeeded, 2);
  assert.equal(result.verification, 'unverified');
  assert.equal(result.transition, 'unknown');
});

test('known capacity interruption and unknown state can coexist without greenwashing', () => {
  const result = run({ observation: 'state-unknown', maxUnavailable: 1 }).snapshot().result;
  assert.equal(result.interruptedTransitions, 1);
  assert.equal(result.unknownTransitions, 1);
  assert.equal(result.successfulTransitions, 0);
  assert.equal(result.verification, 'fail');
});

test('no-surge replacement does not require spare slots, but still loses ready capacity', () => {
  const result = run({ maxUnavailable: 1, maxSurge: 0, headroom: 'unknown' }).snapshot().result;
  assert.equal(result.held, false);
  assert.equal(result.peakPods, 3);
  assert.equal(result.readyFloor, 2);
  assert.equal(result.verification, 'fail');
});

for (const [kind, after, allowed, applies, outcome] of [
  ['eviction-one', 2, true, true, 'insufficient-surviving-capacity'],
  ['eviction-two', 3, false, true, 'blocked-voluntary-eviction'],
  ['node-loss', 2, null, false, 'insufficient-surviving-capacity'],
  ['zone-loss', 2, null, false, 'insufficient-surviving-capacity'],
  ['region-loss', 0, null, false, 'insufficient-surviving-capacity'],
  ['unrecorded', null, null, false, 'unknown'],
]) {
  test(`${kind} comparison does not certify universal failure protection or rewrite rollout`, () => {
    const lesson = run();
    const before = lesson.snapshot();
    const state = lesson.dispatch({ type: 'disrupt', kind });
    const result = state.disruption;
    assert.equal(result.observedReadyAfter, after);
    assert.equal(result.evictionAllowed, allowed);
    assert.equal(result.pdbApplies, applies);
    assert.equal(result.outcome, outcome);
    assert.equal(result.universalProtection, false);
    assert.equal(result.nativeQualified, false);
    assert.strictEqual(state.result, before.result);
    assert.strictEqual(state.results, before.results);
    assert.equal(result.unknown, kind === 'unrecorded' ? 2 : 0);
    assert.equal(result.interrupted, outcome === 'insufficient-surviving-capacity' ? 2 : 0);
    assert.equal(result.attemptedJourneys, kind === 'eviction-two' ? 0 : 2);
    rejectUnchanged(lesson, { type: 'disrupt', kind }, 'ERR_STATE');
  });
}

test('voluntary budget cannot be established from missing old readiness', () => {
  const lesson = run({ observation: 'desired-only' });
  const state = lesson.dispatch({ type: 'disrupt', kind: 'eviction-one' });
  assert.equal(state.disruption.evictionAllowed, null);
  assert.equal(state.disruption.observedReadyAfter, null);
  assert.equal(state.disruption.verification, 'unverified');
});

test('typed settings reject coercion, impossible allowances, extra fields and prototype records', () => {
  const invalid = [
    { ...settings, maxUnavailable: '0' }, { ...settings, maxUnavailable: false },
    { ...settings, maxSurge: true }, { ...settings, maxSurge: -1 },
    { ...settings, graceSeconds: '20' }, { ...settings, graceSeconds: NaN },
    { ...settings, graceSeconds: Infinity }, { ...settings, graceSeconds: 20.1 },
    { ...settings, graceSeconds: null }, { ...settings, graceSeconds: 30 },
    { ...settings, observation: [] }, { ...settings, headroom: ' available' },
    { ...settings, maxUnavailable: 0, maxSurge: 0 }, { ...settings, extra: true },
    Object.assign(Object.create(null), settings), Object.create(settings),
  ];
  for (const input of invalid) rejectUnchanged(createLesson(), { type: 'configure', settings: input }, 'ERR_INPUT');
});

test('strict canonical control text rejects decimal, whitespace, exponent and coercible inputs', () => {
  const controls = Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, String(value)]));
  assert.deepEqual(parseControls(controls), settings);
  for (const value of ['', ' 20', '20 ', '+20', '20.0', '2e1', '020', 'NaN', 'Infinity', 'true', 20, true, null]) {
    assert.throws(() => parseControls({ ...controls, graceSeconds: value }), (error) => error.code === 'ERR_INPUT');
  }
  assert.throws(() => parseControls({ ...controls, extra: 'x' }), /requires exactly/);
});

test('actions reject unknown keys, names, symbols and accessors without invoking getters', () => {
  for (const action of [null, [], 'reset', { type: 'constructor' }, { type: '__proto__' }, { type: 'reset', extra: true }, { type: 'observe', [Symbol('x')]: 1 }, { type: 'disrupt', kind: 'live-fault' }]) {
    rejectUnchanged(createLesson(), action, 'ERR_INPUT');
  }
  let reads = 0;
  const action = Object.defineProperty({}, 'type', { get() { reads++; return 'reset'; }, enumerable: true });
  rejectUnchanged(createLesson(), action, 'ERR_INPUT');
  const input = { ...settings };
  Object.defineProperty(input, 'graceSeconds', { get() { reads++; return 20; }, enumerable: true });
  rejectUnchanged(createLesson(), { type: 'configure', settings: input }, 'ERR_INPUT');
  assert.equal(reads, 0);
});

test('stage guards reject reordered actions at every lifecycle boundary without mutation', () => {
  const lesson = createLesson();
  for (const type of ['observe', 'rollout', 'drain']) rejectUnchanged(lesson, { type }, 'ERR_STATE');
  rejectUnchanged(lesson, { type: 'disrupt', kind: 'node-loss' }, 'ERR_STATE');
  lesson.dispatch({ type: 'configure', settings });
  rejectUnchanged(lesson, { type: 'configure', settings }, 'ERR_STATE');
  rejectUnchanged(lesson, { type: 'rollout' }, 'ERR_STATE');
  lesson.dispatch({ type: 'observe' });
  rejectUnchanged(lesson, { type: 'observe' }, 'ERR_STATE');
  rejectUnchanged(lesson, { type: 'drain' }, 'ERR_STATE');
  lesson.dispatch({ type: 'rollout' });
  rejectUnchanged(lesson, { type: 'rollout' }, 'ERR_STATE');
  rejectUnchanged(lesson, { type: 'disrupt', kind: 'node-loss' }, 'ERR_STATE');
  lesson.dispatch({ type: 'drain' });
  rejectUnchanged(lesson, { type: 'drain' }, 'ERR_STATE');
});

test('private immutable state and fixtures cannot be injected, forged or mutated', () => {
  assert.throws(() => createLesson({ phase: 'done' }), /no injected/);
  const lesson = run();
  assert.throws(() => { lesson.snapshot().phase = 'idle'; }, TypeError);
  assert.throws(() => { lesson.snapshot().result.successfulTransitions = 900; }, TypeError);
  assert.throws(() => { lesson.snapshot().history.push({}); }, TypeError);
  assert.throws(() => { FIXTURE.nodes[0].podSlots = 900; }, TypeError);
  assert.throws(() => { OPTIONS.maxSurge.push(900); }, TypeError);
  assert.throws(() => { lesson.dispatch = () => ({}); }, TypeError);
  rejectUnchanged(lesson, { type: 'reset', state: { phase: 'idle' } }, 'ERR_INPUT');
  assert.equal(lesson.dispatch.call({ phase: 'idle' }, { type: 'reset' }).phase, 'idle');
});

test('reset and later positive runs retain negative, unknown and disruption evidence', () => {
  const lesson = run({ graceSeconds: 10 });
  lesson.dispatch({ type: 'disrupt', kind: 'region-loss' });
  const before = lesson.snapshot();
  lesson.dispatch({ type: 'reset' });
  assert.equal(lesson.snapshot().result, null);
  assert.equal(lesson.snapshot().plan, null);
  assert.strictEqual(lesson.snapshot().results, before.results);
  assert.strictEqual(lesson.snapshot().disruptions, before.disruptions);
  for (const observation of ['state-unknown', 'complete']) {
    lesson.dispatch({ type: 'configure', settings: { ...settings, observation } });
    lesson.dispatch({ type: 'observe' });
    lesson.dispatch({ type: 'rollout' });
    lesson.dispatch({ type: 'drain' });
    lesson.dispatch({ type: 'reset' });
  }
  assert.deepEqual(lesson.snapshot().results.map((result) => result.verification), ['fail', 'unverified', 'pass']);
  assert.equal(lesson.snapshot().results[0].drain.interrupted, 2);
  assert.equal(lesson.snapshot().results[1].unknownTransitions, 2);
  assert.equal(lesson.snapshot().disruptions[0].observedReadyAfter, 0);
});

test('eight-run/history bounds prevent unbounded operation without silently erasing proof', () => {
  const lesson = createLesson();
  const initial = lesson.snapshot();
  assert.strictEqual(lesson.dispatch({ type: 'reset' }), initial);
  for (let index = 0; index < MAX_RUNS; index++) {
    lesson.dispatch({ type: 'configure', settings });
    lesson.dispatch({ type: 'observe' });
    lesson.dispatch({ type: 'rollout' });
    lesson.dispatch({ type: 'drain' });
    lesson.dispatch({ type: 'disrupt', kind: 'unrecorded' });
    lesson.dispatch({ type: 'reset' });
  }
  const state = lesson.snapshot();
  assert.equal(state.runsUsed, 8);
  assert.equal(state.results.length, 8);
  assert.equal(state.history.length, 48);
  assert.ok(state.history.length <= MAX_HISTORY);
  assert.equal(state.history.every((event, index) => event.sequence === index + 1), true);
  rejectUnchanged(lesson, { type: 'configure', settings }, 'ERR_LIMIT');
  assert.strictEqual(lesson.dispatch({ type: 'reset' }), state);
});

test('every bounded settings combination conserves attributed transition and drain outcomes', () => {
  for (const maxUnavailable of OPTIONS.maxUnavailable) {
    for (const maxSurge of OPTIONS.maxSurge) {
      if (maxUnavailable === 0 && maxSurge === 0) continue;
      for (const probe of OPTIONS.probe) for (const headroom of OPTIONS.headroom) {
        for (const graceSeconds of OPTIONS.graceSeconds) for (const observation of OPTIONS.observation) {
          const result = run({ maxUnavailable, maxSurge, probe, headroom, graceSeconds, observation }).snapshot().result;
          assert.equal(result.attemptedTransitions, result.successfulTransitions + result.interruptedTransitions + result.unknownTransitions);
          assert.equal(result.drain.attempted, result.drain.succeeded + result.drain.interrupted + result.drain.unknown);
          assert.equal(result.nativeQualified, false);
          if (result.verification === 'pass' && !result.held) {
            assert.equal(result.interruptedTransitions + result.unknownTransitions + result.drain.interrupted, 0);
            assert.equal(result.readyFloor >= FIXTURE.requiredReady, true);
          }
        }
      }
    }
  }
});
