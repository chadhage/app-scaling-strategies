'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLesson } = require('..\\model.js');

const policies = ['reconcile', 'unsafe-replay'];
const evidence = ['complete', 'missing-effect-receipt', 'missing-user-outcome', 'recorded-user-failure'];
const config = (policy = 'reconcile', receipt = 'complete') => ({ policy, evidence: receipt });

function resumed(policy, receipt) {
  const lesson = createLesson();
  lesson.stage(config(policy, receipt));
  lesson.restart();
  return lesson;
}

function rejectedWithoutMutation(lesson, action, code) {
  const before = lesson.getState();
  assert.throws(action, (error) => error.code === code);
  assert.deepEqual(lesson.getState(), before);
}

test('BDD safe restart reconciles a receipt instead of repeating destructive work', () => {
  const lesson = createLesson();
  assert.equal(lesson.getState().result, null, 'empty sample is not a success');
  const crashed = lesson.stage(config());
  assert.equal(crashed.phase, 'crashed');
  const state = lesson.restart();
  assert.equal(state.result.metrics.destructiveExecutions, 1, 'a completed destructive transition must not execute twice');
  assert.equal(state.result.metrics.duplicateDestructiveActions, 0);
  assert.equal(state.result.checkpoint, 'COMPLETE');
  assert.equal(state.result.consoleAvailable, true);
  assert.equal(state.result.outcome, 'SUCCESS');
  assert.deepEqual(state.result.metrics, {
    destructiveExecutions: 1, duplicateDestructiveActions: 0,
    userAttempted: 3, userSucceeded: 3, userFailed: 0, userUnknown: 0
  });
  assert.equal(state.trace.filter((event) => event.kind === 'DESTRUCTIVE_DATA').length, 1);
});

test('BDD unsafe replay visibly duplicates the same destructive identity and fails', () => {
  const state = resumed('unsafe-replay', 'complete').getState();
  const effects = state.trace.filter((event) => event.kind === 'DESTRUCTIVE_DATA');
  assert.equal(effects.length, 2);
  assert.equal(effects[0].effectId, effects[1].effectId);
  assert.equal(state.result.metrics.duplicateDestructiveActions, 1);
  assert.equal(state.result.metrics.userSucceeded, 3);
  assert.equal(state.result.outcome, 'FAILURE', 'console and user success cannot hide duplicate destructive work');
});

test('BDD missing effect receipt blocks guessing at an uncertain boundary', () => {
  const { result, trace } = resumed('reconcile', 'missing-effect-receipt').getState();
  assert.equal(result.outcome, 'UNKNOWN');
  assert.equal(result.checkpoint, 'RECONCILE_REQUIRED');
  assert.equal(result.metrics.destructiveExecutions, 1);
  assert.equal(result.metrics.duplicateDestructiveActions, 0);
  assert.equal(result.metrics.userUnknown, 1);
  assert.equal(trace.filter((event) => event.kind === 'DESTRUCTIVE_DATA').length, 1);
});

test('BDD missing durable user outcome remains in the attempted denominator', () => {
  const { result } = resumed('reconcile', 'missing-user-outcome').getState();
  assert.equal(result.checkpoint, 'COMPLETE');
  assert.equal(result.outcome, 'UNKNOWN');
  assert.deepEqual(result.userOutcomes, [
    { id: 'journey-A', outcome: 'SUCCESS' },
    { id: 'journey-B', outcome: 'UNKNOWN' },
    { id: 'journey-C', outcome: 'SUCCESS' }
  ]);
  assert.equal(result.metrics.userAttempted, 3);
  assert.equal(result.metrics.userSucceeded, 2);
  assert.equal(result.metrics.userUnknown, 1);
});

test('BDD pre-crash failures survive both policies', () => {
  for (const policy of policies) {
    const { result } = resumed(policy, 'recorded-user-failure').getState();
    assert.equal(result.metrics.userFailed, 1);
    assert.equal(result.userOutcomes[1].outcome, 'FAILURE');
    assert.equal(result.outcome, 'FAILURE');
  }
});

test('all eight fixed combinations conserve the denominator and classify honestly', () => {
  for (const policy of policies) {
    for (const receipt of evidence) {
      const { result, trace } = resumed(policy, receipt).getState();
      const expected = policy === 'unsafe-replay' || receipt === 'recorded-user-failure'
        ? 'FAILURE' : receipt === 'complete' ? 'SUCCESS' : 'UNKNOWN';
      assert.equal(result.outcome, expected, `${policy}/${receipt}`);
      const m = result.metrics;
      assert.equal(m.userSucceeded + m.userFailed + m.userUnknown, m.userAttempted);
      assert.equal(m.userAttempted, 3);
      assert.equal(m.destructiveExecutions, policy === 'unsafe-replay' ? 2 : 1);
      assert.equal(m.duplicateDestructiveActions, policy === 'unsafe-replay' ? 1 : 0);
      assert.equal(result.consoleAvailable, true);
      assert.ok(trace.length <= 16);
      assert.deepEqual(trace.map((event) => event.seq), trace.map((_, index) => index + 1));
      for (const event of trace.filter((event) => event.kind === 'DESTRUCTIVE_DATA')) {
        assert.match(event.detail, /DATA ONLY/);
      }
    }
  }
});

test('BDD prediction correctness is not the measured outcome; history retains complete evidence', () => {
  const lesson = resumed('unsafe-replay', 'complete');
  const prior = lesson.getState();
  lesson.check('SUCCESS');
  const checked = lesson.getState();
  assert.equal(checked.phase, 'checked');
  assert.equal(checked.history[0].correct, false);
  assert.equal(checked.history[0].result.outcome, 'FAILURE');
  assert.deepEqual(checked.history[0].trace, prior.trace);
  assert.deepEqual(checked.history[0].result, prior.result);
  assert.deepEqual(checked.history[0].config, prior.config);
  lesson.newAttempt();
  assert.deepEqual(lesson.getState().history, checked.history);
  lesson.stage(config());
  lesson.restart();
  lesson.check('SUCCESS');
  assert.equal(lesson.getState().history.length, 2);
  assert.equal(lesson.getState().history[0].result.outcome, 'FAILURE');
});

test('BDD phase guards reject out-of-order and duplicate actions atomically', () => {
  const lesson = createLesson();
  rejectedWithoutMutation(lesson, () => lesson.restart(), 'STATE');
  rejectedWithoutMutation(lesson, () => lesson.check('SUCCESS'), 'STATE');
  rejectedWithoutMutation(lesson, () => lesson.newAttempt(), 'STATE');
  lesson.stage(config());
  rejectedWithoutMutation(lesson, () => lesson.stage(config()), 'STATE');
  rejectedWithoutMutation(lesson, () => lesson.newAttempt(), 'STATE');
  lesson.restart();
  rejectedWithoutMutation(lesson, () => lesson.restart(), 'STATE');
  rejectedWithoutMutation(lesson, () => lesson.stage(config()), 'STATE');
  lesson.check('SUCCESS');
  rejectedWithoutMutation(lesson, () => lesson.check('SUCCESS'), 'STATE');
  rejectedWithoutMutation(lesson, () => lesson.restart(), 'STATE');
});

test('BDD exact configuration guards reject unsupported shapes without coercion', () => {
  const invalid = [
    null, undefined, [], true, 1, 'reconcile', {}, { policy: 'reconcile' },
    { evidence: 'complete' }, { ...config(), extra: true },
    config('RECONCILE'), config(' reconcile'), config('reconcile', 'unknown'),
    config('reconcile', null), config(false), Object.create(config())
  ];
  for (const value of invalid) {
    const lesson = createLesson();
    rejectedWithoutMutation(lesson, () => lesson.stage(value), 'INPUT');
  }
  const withSymbol = { ...config(), [Symbol('extra')]: true };
  const symbolLesson = createLesson();
  rejectedWithoutMutation(symbolLesson, () => symbolLesson.stage(withSymbol), 'INPUT');
  const withGetter = { evidence: 'complete', get policy() { throw new Error('getter must not execute'); } };
  const lesson = createLesson();
  rejectedWithoutMutation(lesson, () => lesson.stage(withGetter), 'INPUT');
});

test('prediction is an exact enum and cannot mutate a resumed trace on rejection', () => {
  const lesson = resumed('reconcile', 'complete');
  for (const value of ['', undefined, null, 'success', 'SUCCESS ', {}, 1]) {
    rejectedWithoutMutation(lesson, () => lesson.check(value), 'INPUT');
  }
});

test('BDD six full attempts are retained; history is never silently evicted', () => {
  const lesson = createLesson();
  for (let index = 0; index < 6; index += 1) {
    lesson.stage(config(index % 2 ? 'unsafe-replay' : 'reconcile'));
    lesson.restart();
    lesson.check(index % 2 ? 'FAILURE' : 'SUCCESS');
    if (index < 5) lesson.newAttempt();
  }
  assert.equal(lesson.getState().history.length, 6);
  assert.equal(lesson.getState().history[0].result.outcome, 'SUCCESS');
  rejectedWithoutMutation(lesson, () => lesson.newAttempt(), 'LIMIT');
  lesson.reset();
  lesson.stage(config());
  assert.equal(lesson.getState().history.length, 0);
});

test('snapshots and caller inputs cannot mutate active or retained state', () => {
  const lesson = createLesson();
  const input = config();
  lesson.stage(input);
  input.policy = 'unsafe-replay';
  const snapshot = lesson.getState();
  try { snapshot.config.policy = 'unsafe-replay'; } catch (error) { assert.ok(error instanceof TypeError); }
  try { snapshot.trace.length = 0; } catch (error) { assert.ok(error instanceof TypeError); }
  assert.equal(lesson.getState().config.policy, 'reconcile');
  assert.ok(lesson.getState().trace.length > 0);
  lesson.restart();
  lesson.check('SUCCESS');
  const history = lesson.getState().history;
  try { history[0].result.outcome = 'FAILURE'; } catch (error) { assert.ok(error instanceof TypeError); }
  assert.equal(lesson.getState().history[0].result.outcome, 'SUCCESS');
});

test('BDD explicit reset works from every phase and clears all in-memory data', () => {
  for (const phase of ['idle', 'crashed', 'resumed', 'checked']) {
    const lesson = createLesson();
    if (phase !== 'idle') lesson.stage(config());
    if (['resumed', 'checked'].includes(phase)) lesson.restart();
    if (phase === 'checked') lesson.check('SUCCESS');
    lesson.reset();
    assert.deepEqual(lesson.getState(), createLesson().getState());
    assert.equal(lesson.getState().history.length, 0);
    assert.equal(lesson.getState().result, null);
  }
});
