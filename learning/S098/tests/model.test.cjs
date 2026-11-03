'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('..\\fixtures.js');
const model = require('..\\model.js');

const committed = () => {
  const state = model.create();
  return model.applyNewWrites(state, state.runId);
};
const recover = (state, plan = 'compatible-rollback', observation = 'complete') =>
  model.recover(state, { expectedRunId: state.runId, plan, observation });

test('fixed v2 writes append exactly once; baseline and earlier state stay immutable', () => {
  const baseline = model.create();
  const state = model.applyNewWrites(baseline, baseline.runId);
  assert.equal(state.phase, 'WRITES_COMMITTED');
  assert.equal(state.servingVersion, 'v2');
  assert.deepEqual(state.ledger, fixture.committed);
  assert.deepEqual(baseline.ledger, fixture.baseline);
  assert.equal(state.ledger.length, 3);
  assert.throws(() => model.applyNewWrites(state, state.runId), { code: 'ERR_STATE' });
});

for (const [plan, destination] of [['compatible-rollback', 'v1-compatible'], ['forward-recovery', 'v2.1']]) {
  test(`${plan} retains and individually interprets every committed effect`, () => {
    const before = committed();
    const state = recover(before, plan);
    assert.equal(state.decision.outcome, 'SUCCESS');
    assert.equal(state.servingVersion, destination);
    assert.deepEqual(state.ledger, before.ledger);
    assert.deepEqual(state.decision.interpretedEffects, fixture.expectedEffects);
    assert.equal(state.decision.retainedEffects, 3);
    assert.equal(state.decision.observedTotal, 8);
    assert.equal(state.decision.expectedTotal, 8);
    assert.equal(state.decision.observedReadMs, 7);
    assert.equal(state.decision.readBudgetMs, 10);
    assert.deepEqual(model.summary(state), {
      decisions: 1, attempted: 1, success: 1, failure: 0, unknown: 0, rejected: 0, remaining: 11,
    });
  });
}

for (const plan of ['baseline-only', 'discard-new-writes']) {
  test(`${plan} is rejected, not a successful stale-snapshot reversal`, () => {
    const before = committed();
    const state = recover(before, plan);
    assert.equal(state.decision.outcome, 'REJECTED');
    assert.equal(state.phase, 'DECIDED');
    assert.equal(state.servingVersion, 'v2');
    assert.deepEqual(state.ledger, fixture.committed);
    assert.equal(state.decision.retainedEffects, 3);
    assert.equal(state.decision.observedTotal, null);
    assert.equal(state.decision.oldSnapshotTotal, 6);
    assert.match(state.decision.explanation, /6|discard/);
    assert.equal(model.summary(state).attempted, 0);
    assert.equal(model.summary(state).rejected, 1);
  });
}

for (const plan of ['compatible-rollback', 'forward-recovery']) {
  for (const [observation, outcome, total, effects] of [
    ['missing', 'FAILURE', 9, 2], ['corrupt', 'FAILURE', 10, 3], ['unknown', 'UNKNOWN', null, 0],
  ]) {
    test(`${plan} ${observation} observation stays ${outcome} with no unverified routing`, () => {
      const before = committed();
      const state = recover(before, plan, observation);
      assert.equal(state.decision.outcome, outcome);
      assert.equal(state.servingVersion, 'v2');
      assert.equal(state.decision.observedTotal, total);
      assert.equal(state.decision.interpretedEffects.length, effects);
      assert.equal(state.decision.retainedEffects, 3);
      assert.deepEqual(state.ledger, before.ledger);
      assert.equal(model.summary(state).attempted, 1);
      assert.equal(model.summary(state).success, 0);
      assert.equal(state.history.length, 1);
    });
  }
}

test('learner PASS remains separate from failed recovery and wrong prediction remains FAIL', () => {
  const failure = recover(committed(), 'compatible-rollback', 'corrupt');
  const answered = model.checkPrediction(failure, { expectedRunId: failure.runId, prediction: 'FAILURE' });
  assert.equal(answered.learningVerdict, 'PASS');
  assert.equal(answered.decision.outcome, 'FAILURE');
  assert.equal(answered.history[0].learningVerdict, 'PASS');
  const wrong = model.checkPrediction(failure, { expectedRunId: failure.runId, prediction: 'SUCCESS' });
  assert.equal(wrong.learningVerdict, 'FAIL');
  assert.equal(wrong.decision.outcome, 'FAILURE');
  assert.throws(() => model.checkPrediction(answered, { expectedRunId: answered.runId, prediction: 'FAILURE' }), { code: 'ERR_STATE' });
});

test('strict choices, types, keys and phase errors cannot mutate state', () => {
  const before = committed();
  const raw = JSON.stringify(before);
  for (const input of [
    null, [], 'compatible-rollback', { expectedRunId: before.runId, plan: 'invalid', observation: 'complete' },
    { expectedRunId: before.runId, plan: 'compatible-rollback', observation: 'invalid' },
    { expectedRunId: String(before.runId), plan: 'compatible-rollback', observation: 'complete' },
    { expectedRunId: before.runId, plan: 'compatible-rollback', observation: 'complete', extra: true },
    { plan: 'compatible-rollback', observation: 'complete' },
  ]) assert.throws(() => model.recover(before, input), { code: 'ERR_INPUT' });
  assert.throws(() => recover(model.create()), { code: 'ERR_STATE' });
  assert.equal(JSON.stringify(before), raw);
});

test('stale run token and fabricated state are rejected atomically', () => {
  const before = committed();
  const reset = model.reset(before);
  const next = model.applyNewWrites(reset, reset.runId);
  assert.throws(() => model.recover(next, {
    expectedRunId: before.runId, plan: 'compatible-rollback', observation: 'complete',
  }), { code: 'ERR_STALE' });
  assert.throws(() => model.applyNewWrites(next, 0), { code: 'ERR_INPUT' });
  assert.throws(() => model.reset(JSON.parse(JSON.stringify(next))), { code: 'ERR_STATE' });
  assert.equal(next.history.length, 0);
});

test('reset restores baseline only; successful, failed, unknown and rejected decisions remain counted', () => {
  let state = model.create();
  for (const [plan, observation] of [
    ['compatible-rollback', 'complete'], ['forward-recovery', 'missing'],
    ['compatible-rollback', 'unknown'], ['discard-new-writes', 'complete'],
  ]) {
    state = model.applyNewWrites(state, state.runId);
    state = model.reset(recover(state, plan, observation));
  }
  assert.equal(state.phase, 'BASELINE');
  assert.equal(state.servingVersion, 'v1');
  assert.deepEqual(state.ledger, fixture.baseline);
  assert.equal(state.decision, null);
  assert.equal(state.learningVerdict, 'NOT_CHECKED');
  assert.equal(state.history.length, 4);
  assert.deepEqual(model.summary(state), {
    decisions: 4, attempted: 3, success: 1, failure: 1, unknown: 1, rejected: 1, remaining: 8,
  });
  assert.equal(model.summary(model.create()).decisions, 0);
});

test('nested ledger, history and API are frozen; independent runs do not share mutable state', () => {
  const state = recover(committed());
  assert.ok(Object.isFrozen(model));
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.ledger[1].payload));
  assert.ok(Object.isFrozen(state.history[0]));
  assert.throws(() => { state.ledger[1].payload.quantity = 99; }, TypeError);
  assert.throws(() => state.history.push({}), TypeError);
  assert.deepEqual(committed().ledger, fixture.committed);
});

test('twelve-decision bound includes rejections and survives reset', () => {
  let state = model.create();
  for (let i = 0; i < fixture.maxDecisions; i += 1) {
    state = model.applyNewWrites(state, state.runId);
    state = model.reset(recover(state, 'baseline-only'));
  }
  assert.equal(state.history.length, 12);
  assert.equal(model.summary(state).remaining, 0);
  assert.equal(model.summary(state).rejected, 12);
  assert.throws(() => model.applyNewWrites(state, state.runId), { code: 'ERR_CAPACITY' });
  assert.equal(state.history.length, 12);
});
