'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assessObservation, createLesson } = require('..\\model.js');
const F = require('..\\fixtures.js');
const config = (health = 'healthy', delayTicks = 2) => ({ health, delayTicks });
const initialObservation = { status: 'healthy', observedAt: 0 };
const aged = (health = 'healthy', delayTicks = 2) => {
  const lesson = createLesson();
  lesson.start(config(health, delayTicks));
  lesson.advance();
  return lesson;
};
const finish = (lesson, prediction = 'FAILURE') => {
  lesson.promote();
  return lesson.check({ prediction });
};

test('loadable fixture declares a finite synthetic exercise', () => {
  assert.equal(F.lifetimeTicks, 2);
  assert.equal(F.health.length * (F.maximumDelay - F.minimumDelay + 1), 12);
  assert.ok(Object.isFrozen(F));
});

test('age less than the lifetime is fresh, including age zero', () => {
  for (const tick of [0, 1]) {
    assert.equal(assessObservation(initialObservation, tick).outcome, 'SUCCESS');
  }
});

test('age exactly at the lifetime and later is expired', () => {
  for (const tick of [2, 3, 10]) {
    const result = assessObservation(initialObservation, tick);
    assert.equal(result.outcome, 'FAILURE');
    assert.equal(result.reason, 'EXPIRED');
    assert.equal(result.route, 'blue-v1');
    assert.equal(result.age, tick);
  }
});

test('fresh unhealthy is FAILURE and missing is UNKNOWN, never old green', () => {
  assert.equal(assessObservation({ status: 'unhealthy', observedAt: 2 }, 2).outcome, 'FAILURE');
  const missing = assessObservation({ status: 'missing', observedAt: null }, 2);
  assert.equal(missing.reason, 'MISSING');
  assert.equal(missing.outcome, 'UNKNOWN');
  assert.equal(missing.age, null);
});

test('assessment rejects malformed, future and coerced observations', () => {
  for (const value of [
    null, [], {}, { ...initialObservation, extra: true },
    { status: 'green', observedAt: 0 }, { status: 'missing', observedAt: 0 },
    { status: 'healthy', observedAt: null }, { status: 'healthy', observedAt: -1 },
    { status: 'healthy', observedAt: 3 },
    Object.create(initialObservation),
    Object.defineProperty({ observedAt: 0 }, 'status', { get() { throw new Error('must not execute'); }, enumerable: true }),
  ]) {
    assert.throws(() => assessObservation(value, 2), { name: 'RangeError' });
  }
  for (const tick of [-1, 0.5, '2', NaN, Infinity, 11]) {
    assert.throws(() => assessObservation(initialObservation, tick), { name: 'RangeError' });
  }
});

test('start records original green but requires the expiration step', () => {
  const lesson = createLesson();
  const state = lesson.start(config());
  assert.equal(state.phase, 'active');
  assert.equal(state.current.clock, 0);
  assert.deepEqual(state.current.observations[0], {
    id: 1, status: 'healthy', observedAt: 0, attemptedAt: 0,
  });
  const before = lesson.snapshot();
  assert.throws(() => lesson.promote(), { name: 'RangeError' });
  assert.deepEqual(lesson.snapshot(), before);
});

test('expired green is blocked and preserves the old route', () => {
  const lesson = aged();
  const state = lesson.promote();
  assert.equal(state.phase, 'active');
  assert.equal(state.current.decisions[0].outcome, 'FAILURE');
  assert.equal(state.current.decisions[0].reason, 'EXPIRED');
  assert.equal(state.current.decisions[0].age, 2);
  assert.equal(state.current.route, 'blue-v1');
  assert.equal(state.current.observations[0].status, 'healthy');
});

test('fresh revalidation promotes, preserving earlier blocked evidence', () => {
  const lesson = aged();
  lesson.promote();
  lesson.revalidate();
  const state = lesson.promote();
  assert.equal(state.phase, 'active');
  assert.equal(state.current.decisions.length, 2);
  assert.deepEqual(state.current.decisions.map((d) => d.outcome), ['FAILURE', 'SUCCESS']);
  assert.equal(state.current.decisions[1].age, 0);
  assert.equal(state.current.decisions[1].observationId, 2);
  assert.equal(state.current.route, 'green-v2');
  assert.equal(state.current.terminal, true);
  assert.equal(state.current.decisions[1].userImpact, 'UNVERIFIED - no live user journeys');
  assert.equal(state.current.decisions[1].cleanup, 'N/A - no resources');
  assert.equal(state.current.decisions[1].verifier, 'PASS - freshness gate enforced');
});

test('unhealthy revalidation cannot reuse initial green', () => {
  const lesson = aged('unhealthy');
  lesson.revalidate();
  const state = lesson.promote();
  assert.equal(state.phase, 'active');
  assert.equal(state.current.decisions[0].outcome, 'FAILURE');
  assert.equal(state.current.decisions[0].reason, 'UNHEALTHY');
  assert.equal(state.current.observations[0].status, 'healthy');
  assert.equal(state.current.observations[1].status, 'unhealthy');
  assert.equal(state.current.route, 'blue-v1');
});

test('missing revalidation is UNKNOWN with no fabricated timestamp', () => {
  const lesson = aged('missing');
  lesson.revalidate();
  const state = lesson.promote();
  assert.equal(state.phase, 'active');
  assert.equal(state.current.decisions[0].outcome, 'UNKNOWN');
  assert.equal(state.current.decisions[0].reason, 'MISSING');
  assert.equal(state.current.observations[1].observedAt, null);
  assert.equal(state.current.route, 'blue-v1');
});

test('fresh revalidation expires again if time advances before promotion', () => {
  const lesson = aged();
  lesson.revalidate();
  lesson.advance();
  const state = lesson.promote();
  assert.equal(state.phase, 'active');
  assert.equal(state.current.clock, 4);
  assert.equal(state.current.decisions[0].outcome, 'FAILURE');
  assert.equal(state.current.decisions[0].reason, 'EXPIRED');
  assert.equal(state.current.decisions[0].requiresRevalidation, true);
  assert.equal(state.current.route, 'blue-v1');
});

test('all twelve fixtures remain deterministic with bounded complete traces', () => {
  for (const health of F.health) {
    for (let delay = F.minimumDelay; delay <= F.maximumDelay; delay += 1) {
      const lesson = aged(health, delay);
      lesson.promote();
      lesson.revalidate();
      const state = lesson.promote();
      assert.equal(state.phase, 'active');
      assert.equal(state.current.decisions[1].outcome, {
        healthy: 'SUCCESS', unhealthy: 'FAILURE', missing: 'UNKNOWN',
      }[health]);
      assert.ok(state.current.trace.length <= F.maxTraceEvents);
      assert.equal(state.current.clock, delay);
      assert.equal(state.current.decisions[0].age, delay);
      assert.deepEqual(lesson.snapshot(), state);
    }
  }
});

test('config is exact, plain and uncoerced; rejection is atomic', () => {
  const lesson = createLesson();
  for (const input of [
    null, [], {}, config('green'), config('healthy', 1), config('healthy', 6),
    config('healthy', 2.5), config('healthy', '2'), config('healthy', NaN),
    { ...config(), extra: true }, Object.create(config()),
    Object.defineProperty({ delayTicks: 2 }, 'health', { get() { throw new Error('must not execute'); }, enumerable: true }),
  ]) {
    const before = lesson.snapshot();
    assert.throws(() => lesson.start(input), { name: 'RangeError' });
    assert.deepEqual(lesson.snapshot(), before);
  }
});

test('state guards reject repeats and out-of-order actions atomically', () => {
  const lesson = createLesson();
  const rejects = (action) => {
    const before = lesson.snapshot();
    assert.throws(action, { name: 'RangeError' });
    assert.deepEqual(lesson.snapshot(), before);
  };
  rejects(() => lesson.advance());
  rejects(() => lesson.revalidate());
  rejects(() => lesson.promote());
  rejects(() => lesson.check({ prediction: 'FAILURE' }));
  rejects(() => lesson.newAttempt());
  lesson.start(config());
  rejects(() => lesson.start(config()));
  rejects(() => lesson.revalidate());
  lesson.advance();
  rejects(() => lesson.advance());
  lesson.promote();
  rejects(() => lesson.promote());
  rejects(() => lesson.check({ prediction: 'PASS' }));
  rejects(() => lesson.check({ prediction: 'FAILURE', extra: true }));
  lesson.revalidate();
  rejects(() => lesson.revalidate());
  rejects(() => lesson.check({ prediction: 'FAILURE' }));
  lesson.promote();
  rejects(() => lesson.advance());
  rejects(() => lesson.promote());
  lesson.check({ prediction: 'SUCCESS' });
  rejects(() => lesson.check({ prediction: 'SUCCESS' }));
  rejects(() => lesson.promote());
});

test('predictions, final attempts and all promotion decisions stay separate', () => {
  const lesson = aged();
  lesson.promote();
  lesson.revalidate();
  lesson.promote();
  const first = lesson.check({ prediction: 'SUCCESS' });
  assert.equal(first.phase, 'checked');
  assert.equal(first.history[0].correct, true);
  assert.deepEqual(first.totals, {
    attempts: 1, correct: 1, decisions: 2, SUCCESS: 1, FAILURE: 1, UNKNOWN: 0,
  });
  lesson.newAttempt();
  lesson.start(config('missing'));
  lesson.advance();
  lesson.revalidate();
  lesson.promote();
  const second = lesson.check({ prediction: 'SUCCESS' });
  assert.equal(second.history[1].correct, false);
  assert.equal(second.history[1].outcome, 'UNKNOWN');
  assert.deepEqual(second.totals, {
    attempts: 2, correct: 1, decisions: 3, SUCCESS: 1, FAILURE: 1, UNKNOWN: 1,
  });
  assert.deepEqual(second.history[0], first.history[0]);
});

test('six checked attempts are retained without eviction', () => {
  const lesson = createLesson();
  for (let n = 0; n < F.historyLimit; n += 1) {
    lesson.start(config());
    lesson.advance();
    finish(lesson);
    if (n < F.historyLimit - 1) lesson.newAttempt();
  }
  const state = lesson.snapshot();
  assert.equal(state.phase, 'checked');
  assert.equal(state.history.length, 6);
  assert.deepEqual(state.history.map((h) => h.id), [1, 2, 3, 4, 5, 6]);
  assert.equal(state.totals.FAILURE, 6);
  assert.throws(() => lesson.newAttempt(), { name: 'RangeError' });
  assert.throws(() => lesson.start(config()), { name: 'RangeError' });
  assert.deepEqual(lesson.snapshot(), state);
});

test('returned snapshots cannot mutate current or retained evidence', () => {
  const lesson = aged();
  const state = finish(lesson);
  assert.equal(state.phase, 'checked');
  const before = lesson.snapshot();
  state.current.clock = 999;
  state.current.observations[0].status = 'missing';
  state.history[0].decisions.length = 0;
  state.totals.FAILURE = 0;
  assert.deepEqual(lesson.snapshot(), before);
  lesson.newAttempt();
  assert.deepEqual(lesson.snapshot().history, before.history);
});

test('reset erases state, all history and all denominators', () => {
  const lesson = aged();
  const state = finish(lesson);
  assert.equal(state.phase, 'checked');
  assert.deepEqual(lesson.reset(), createLesson().snapshot());
  assert.equal(lesson.snapshot().totals.attempts, 0);
  assert.equal(lesson.snapshot().current, null);
  assert.deepEqual(lesson.snapshot().history, []);
});
