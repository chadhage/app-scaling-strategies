'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const lesson = require('../model.js');

function compare(state, policy = 'retain', sample = 'immediate', coverage = 'complete') {
  let next = lesson.transition(state, { type: 'switch', runId: state.runId, policy });
  assert.equal(next.phase, 'switched');
  next = lesson.transition(next, { type: 'compare', runId: next.runId, sample, coverage });
  assert.equal(next.phase, 'compared');
  return next;
}
const clone = (value) => JSON.parse(JSON.stringify(value));

test('baseline declares the exact synthetic banner, fixed data, and empty bounded history', () => {
  const state = lesson.createState();
  assert.equal(lesson.BANNER, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.deepEqual(state, { schema: 1, runId: 1, phase: 'ready', policy: null, current: null, history: [] });
  assert.equal(lesson.FIXTURE.oldAnswer, '192.0.2.10');
  assert.equal(lesson.FIXTURE.newAnswer, '192.0.2.20');
  assert.equal(lesson.FIXTURE.requiredOverlapEndSeconds, 180);
  assert.equal(lesson.FIXTURE.latencyBudgetMs, 10);
  assert.equal(lesson.LIMITS.comparisons, 12);
  assert.ok(Object.isFrozen(state) && Object.isFrozen(state.history) && Object.isFrozen(lesson.FIXTURE));
  assert.deepEqual(lesson.summary(state), { runs: 0, attempted: 0, successful: 0, interruptions: 0, unknown: 0 });
});

test('retained destinations preserve three journeys despite immediate fresh/cached disagreement', () => {
  const state = compare(lesson.createState());
  assert.deepEqual(state.current.rows.map((row) => row.answer), ['192.0.2.20', '192.0.2.10', '192.0.2.10']);
  assert.deepEqual(state.current.rows.map((row) => row.remainingSeconds), [0, 90, 150]);
  assert.deepEqual(state.current.rows.map((row) => row.latencyMs), [7, 8, 9]);
  assert.equal(state.current.atSeconds, 30);
  assert.equal(state.current.answersAgree, false);
  assert.equal(state.current.convergence, 'not-established');
  assert.equal(state.current.outcome, 'success');
  assert.deepEqual(state.current.totals, { attempted: 3, successful: 3, interruptions: 0, unknown: 0 });
});

test('first expiry leaves cached B on the usable old destination', () => {
  const state = compare(lesson.createState(), 'retain', 'first-expiry');
  assert.deepEqual(state.current.rows.map((row) => row.answer), ['192.0.2.20', '192.0.2.20', '192.0.2.10']);
  assert.deepEqual(state.current.rows.map((row) => row.remainingSeconds), [0, 0, 60]);
  assert.equal(state.current.atSeconds, 120);
  assert.equal(state.current.outcome, 'success');
  assert.equal(state.current.answersAgree, false);
});

test('overlap-end agreement is only sampled agreement, never universal convergence', () => {
  const state = compare(lesson.createState(), 'retain', 'overlap-end');
  assert.equal(state.current.atSeconds, 180);
  assert.ok(state.current.rows.every((row) => row.answer === lesson.FIXTURE.newAnswer));
  assert.equal(state.current.answersAgree, true);
  assert.equal(state.current.convergence, 'not-established');
  assert.equal(state.current.outcome, 'success');
});

test('early retirement interrupts two cached journeys even when the fresh sample succeeds', () => {
  const state = compare(lesson.createState(), 'retire-now');
  assert.equal(state.current.outcome, 'failure');
  assert.deepEqual(state.current.rows.map((row) => row.usable), [true, false, false]);
  assert.deepEqual(state.current.rows.map((row) => row.outcome), ['success', 'failure', 'failure']);
  assert.deepEqual(state.current.totals, { attempted: 3, successful: 1, interruptions: 2, unknown: 0 });
  const later = compare(lesson.createState(), 'retire-now', 'first-expiry');
  assert.deepEqual(later.current.totals, { attempted: 3, successful: 2, interruptions: 1, unknown: 0 });
});

test('missing cached evidence remains unknown with no fabricated answer, route or latency', () => {
  const state = compare(lesson.createState(), 'retain', 'immediate', 'missing-b');
  assert.equal(state.current.outcome, 'unknown');
  assert.equal(state.current.answersAgree, null);
  assert.deepEqual(state.current.totals, { attempted: 3, successful: 2, interruptions: 0, unknown: 1 });
  const missing = state.current.rows[2];
  for (const key of ['answer', 'destination', 'remainingSeconds', 'usable', 'latencyMs']) assert.equal(missing[key], null);
  assert.equal(missing.outcome, 'unknown');
  const mixed = compare(lesson.createState(), 'retire-now', 'immediate', 'missing-b');
  assert.equal(mixed.current.outcome, 'failure');
  assert.deepEqual(mixed.current.totals, { attempted: 3, successful: 1, interruptions: 1, unknown: 1 });
});

test('interpretation pass/fail is separate from measured negative and unknown outcomes', () => {
  for (const [policy, coverage, outcome] of [['retire-now', 'complete', 'failure'], ['retain', 'missing-b', 'unknown']]) {
    const state = compare(lesson.createState(), policy, 'immediate', coverage);
    const correct = lesson.transition(state, {
      type: 'explain', runId: state.runId, outcome, reason: 'retain-overlap-not-universal'
    });
    assert.equal(correct.phase, 'checked');
    assert.equal(correct.current.explanation.verdict, 'pass');
    assert.equal(correct.current.outcome, outcome);
    assert.deepEqual(lesson.summary(correct), lesson.summary(state));
    for (const reason of ['fresh-proves-all', 'ttl-proves-all']) {
      const wrong = lesson.transition(state, { type: 'explain', runId: state.runId, outcome, reason });
      assert.equal(wrong.current.explanation.verdict, 'fail');
      assert.equal(wrong.current.outcome, outcome);
    }
    assert.throws(() => lesson.transition(correct, {
      type: 'explain', runId: correct.runId, outcome, reason: 'retain-overlap-not-universal'
    }), /phase/i);
  }
});

test('reset retains failed and unknown history, restores baseline, and rejects old run tokens', () => {
  const failed = compare(lesson.createState(), 'retire-now');
  const before = clone(failed);
  let state = lesson.transition(failed, { type: 'reset', runId: failed.runId });
  assert.equal(state.phase, 'ready');
  assert.equal(state.policy, null);
  assert.equal(state.current, null);
  assert.equal(state.runId, 2);
  assert.deepEqual(state.history, before.history);
  assert.throws(() => lesson.transition(state, { type: 'switch', runId: 1, policy: 'retain' }), /stale/i);
  state = compare(state, 'retain', 'immediate', 'missing-b');
  assert.deepEqual(lesson.summary(state), { runs: 2, attempted: 6, successful: 3, interruptions: 2, unknown: 1 });
  assert.deepEqual(failed, before);
  assert.ok(Object.isFrozen(state.current.rows[0]) && Object.isFrozen(state.history));
});

test('strict command types, exact fields and phase guards reject invalid inputs without mutation', () => {
  const state = lesson.createState();
  const before = clone(state);
  const bad = [
    null, [], false, 'switch', {}, { type: 'bogus', runId: 1 },
    { type: 'switch', runId: '1', policy: 'retain' },
    { type: 'switch', runId: 1.1, policy: 'retain' },
    { type: 'switch', runId: 1, policy: true },
    { type: 'switch', runId: 1, policy: 'retain', endpoint: 'arbitrary' },
    { type: 'switch', runId: 1, policy: 'RETAIN' },
    { type: 'compare', runId: 1, sample: 'immediate', coverage: 'complete' },
    { type: 'explain', runId: 1, outcome: 'success', reason: 'retain-overlap-not-universal' },
    Object.assign(Object.create({ inherited: true }), { type: 'switch', runId: 1, policy: 'retain' })
  ];
  for (const command of bad) assert.throws(() => lesson.transition(state, command), /invalid|phase|stale/i);
  const switched = lesson.transition(state, { type: 'switch', runId: 1, policy: 'retain' });
  for (const [sample, coverage] of [[30, 'complete'], ['30', 'complete'], ['immediate', 1], ['immediate', 'unknown']]) {
    assert.throws(() => lesson.transition(switched, { type: 'compare', runId: 1, sample, coverage }), /invalid/i);
  }
  assert.deepEqual(state, before);
});

test('corrupted typed state, impossible history and fabricated result fields fail atomically', () => {
  const valid = compare(lesson.createState());
  const mutations = [
    (s) => { s.schema = '1'; },
    (s) => { s.runId = 0; },
    (s) => { s.phase = 'ready'; },
    (s) => { s.policy = 'retire-now'; },
    (s) => { s.extra = true; },
    (s) => { s.history[0].totals.successful = 999; },
    (s) => { s.history[0].rows[1].answer = '192.0.2.20'; },
    (s) => { s.current.outcome = 'unknown'; },
    (s) => { s.history.push(clone(s.history[0])); },
    (s) => { s.history[0].rows[2].usable = 'true'; },
    (s) => { s.current.convergence = 'certified'; }
  ];
  for (const mutate of mutations) {
    const corrupted = clone(valid);
    mutate(corrupted);
    const before = clone(corrupted);
    assert.throws(() => lesson.transition(corrupted, { type: 'reset', runId: corrupted.runId }), /invalid state/i);
    assert.deepEqual(corrupted, before);
  }
  assert.throws(() => lesson.summary(null), /invalid state/i);
});

test('twelve comparisons are bounded; reset remains available but cannot start a thirteenth', () => {
  let state = lesson.createState();
  for (let n = 0; n < 12; n += 1) {
    state = compare(state, n % 2 ? 'retire-now' : 'retain');
    state = lesson.transition(state, { type: 'reset', runId: state.runId });
  }
  assert.deepEqual(lesson.summary(state), { runs: 12, attempted: 36, successful: 24, interruptions: 12, unknown: 0 });
  assert.equal(state.phase, 'ready');
  assert.throws(() => lesson.transition(state, { type: 'switch', runId: state.runId, policy: 'retain' }), /limit/i);
  const terminal = { ...lesson.createState(), runId: 65535 };
  assert.throws(() => lesson.transition(terminal, { type: 'reset', runId: terminal.runId }), /limit/i);
});
