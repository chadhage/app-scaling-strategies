'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const detector = require('..\\detector.js');
const ledger = require('..\\..\\C023\\ledger.js');
const cases = [
  ['model-clean', 'PASS', 1, 1, 0, 0, 0, 3, 3, 0, 3],
  ['model-resume', 'HOLD', 2, 1, 0, 1, 0, 3, 4, 0, 3],
  ['model-incomplete', 'HOLD', 1, 0, 0, 1, 0, 0, 1, 0, 0],
  ['model-before-checkpoint', 'HOLD', 1, 0, 0, 1, 0, 1, 1, 0, 0],
  ['model-checkpoint', 'HOLD', 1, 0, 0, 1, 0, 1, 1, 0, 1],
  ['model-unknown', 'HOLD', 1, 0, 0, 1, 0, 0, 1, 0, 0],
  ['model-reconciled', 'HOLD', 2, 0, 0, 2, 0, 2, 4, 1, 3],
  ['model-absent-retry', 'HOLD', 2, 0, 0, 2, 0, 3, 4, 0, 3],
  ['history-closed', 'HOLD', 7, 0, 0, 7, 0, null, null, null, null],
  ['history-held', 'HOLD', 2, 0, 0, 2, 0, null, null, null, null],
  ['control-one', 'PASS', 1, 1, 0, 0, 0, 3, 3, 0, 3],
  ['control-deliveries-only', 'HOLD', 1, 0, 0, 1, 0, 0, 3, 0, 0],
  ['control-retry', 'HOLD', 2, 1, 0, 1, 0, 3, 4, 0, 3],
  ['control-missing-observation', 'HOLD', 1, 0, 0, 1, 0, 2, 3, 0, 2],
  ['control-absence', 'FAIL', 1, 0, 1, 0, 0, 2, 3, 0, 2],
  ['control-absence-retry', 'FAIL', 2, 1, 1, 0, 0, 3, 4, 0, 3],
  ['control-duplicate-application', 'FAIL', 1, 0, 1, 0, 0, 4, 4, 0, 3],
  ['control-duplicate-retry', 'FAIL', 2, 0, 2, 0, 0, 4, 5, 0, 3],
  ['control-repeated-receipt', 'PASS', 1, 1, 0, 0, 0, 3, 3, 0, 3],
  ['control-unknown-retry', 'HOLD', 2, 0, 0, 2, 0, 3, 4, 0, 3],
  ['control-unsupported', 'UNSUPPORTED', 1, 0, 0, 0, 1, 0, 0, 0, 0]
];
for (const [id, decision, originals, pass, fail, unknown, unsupported, applications, deliveries, hypothetical, checkpoint] of cases) {
  test(`closed exact counts: ${id}`, () => {
    const result = detector.inspectSource(id);
    assert.equal(result.valid, true);
    assert.equal(result.decision, decision);
    assert.deepEqual(result.counts, { originals, pass, fail, unknown, unsupported });
    assert.equal(result.successFraction.denominator, originals);
    assert.equal(result.successFraction.numerator, pass);
    assert.equal(result.currentCounts.confirmedApplications, applications);
    assert.equal(result.currentCounts.deliveryAttempts, deliveries);
    assert.equal(result.currentCounts.hypotheticalApplications, hypothetical);
    assert.equal(result.currentCounts.checkpointPosition, checkpoint);
    for (const key of ['eligibleForLiveRun', 'actualExternalEffectsObserved', 'durableQueueOrDatabase', 'externalExactlyOnce',
      'actualClientEffectAssociation', 'nativeProof', 'userJourneySuccess', 'productionNode24Validated', 'approvalAdopted']) assert.equal(result[key], false);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.originals), true);
    assert.equal(Object.isFrozen(result.originals[0]), true);
  });
}
test('all closed sources are tested exactly once', () => {
  assert.deepEqual(cases.map(([id]) => id), detector.sourceIds);
});
test('GREEN of the actual RED behavior: three deliveries without applications HOLD', () => {
  const result = detector.inspectSource('control-deliveries-only');
  assert.equal(result.decision, 'HOLD');
  assert.equal(result.currentCounts.confirmedApplications, 0);
  assert.equal(result.currentCounts.deliveryAttempts, 3);
  assert.equal(result.currentCounts.missingObservations, 3);
  assert.equal(result.currentCounts.confirmedAbsences, 0);
});
test('delivery retry, duplicate application and repeated receipt are different', () => {
  const retry = detector.inspectSource('model-resume');
  const duplicate = detector.inspectSource('control-duplicate-application');
  const repeated = detector.inspectSource('control-repeated-receipt');
  assert.equal(retry.currentCounts.duplicateSuppressions, 1);
  assert.equal(retry.currentCounts.repeatedDeliveries, 1);
  assert.equal(retry.currentCounts.extraApplications, 0);
  assert.equal(duplicate.currentCounts.duplicateApplicationKeys, 1);
  assert.equal(duplicate.currentCounts.extraApplications, 1);
  assert.equal(repeated.currentCounts.repeatedApplicationObservations, 1);
  assert.equal(repeated.currentCounts.extraApplications, 0);
  assert.match(duplicate.sourceBinding, /fictional/);
  assert.match(duplicate.evaluationScope, /NOT C023 source/);
});
for (const id of ['control-retry', 'control-absence-retry', 'control-duplicate-retry', 'control-unknown-retry',
  'model-resume', 'model-reconciled', 'model-absent-retry']) {
  test(`retry comparison retains exact first original: ${id}`, () => {
    const result = detector.compare(id);
    assert.equal(result.valid, true);
    assert.deepEqual(result.before.originals[0], result.after.originals[0]);
    assert.equal(result.before.counts.originals, 1);
    assert.equal(result.after.counts.originals, 2);
    assert.equal(result.after.successFraction.denominator, 2);
    assert.notEqual(result.decision, 'PASS');
  });
}
for (const id of ['model-reconciled', 'model-absent-retry', 'control-unknown-retry']) {
  test(`positive reconciliation/retry cannot close unknown upper bound: ${id}`, () => {
    const result = detector.inspectSource(id);
    assert.equal(result.currentCounts.unknownAcknowledgements, 1);
    for (const original of result.originals) {
      assert.equal(original.verdict, 'UNKNOWN');
      assert.equal(original.effects[0].status, 'UNKNOWN_ACK');
      assert.equal(original.effects[0].confirmedApplicationsUpperBound, null);
    }
    if (id === 'model-reconciled') {
      assert.equal(result.currentCounts.confirmedApplications, 2);
      assert.equal(result.currentCounts.hypotheticalApplications, 1);
      assert.equal(result.currentCounts.modeledApplications, 3);
      assert.equal(result.originals[1].sourceBudget.stateVerdict, 'PASS');
    }
  });
}
test('actual historical originals are never assigned modeled receipts or delivery counts', () => {
  const closed = detector.inspectSource('history-closed');
  assert.deepEqual(closed.sourceBudgetCounts, { originals: 7, pass: 2, fail: 2, unknown: 3 });
  assert.equal(closed.sourceBudgetDecision, 'FAIL');
  assert.equal(closed.expectedPlan, null);
  for (const original of closed.originals) {
    assert.equal(original.effectCounts.confirmedApplications, null);
    assert.equal(original.effectCounts.deliveryAttempts, null);
    assert.deepEqual(original.effects, []);
    assert.deepEqual(original.reasonCodes, ['NO_ACTUAL_EFFECT_RECEIPTS_OR_ASSOCIATION']);
  }
  assert.equal(closed.originals[2].sourceBudget.verdict, 'FAIL');
  assert.equal(closed.originals[2].sourceBudget.elapsedMs, 1118.9000000953674);
  assert.equal(closed.originals[5].sourceBudget.verdict, 'UNKNOWN');
  assert.equal(closed.originals[6].sourceBudget.summaryOnly, true);
});
for (const profileId of ['synthetic-001', 'synthetic-002']) {
  for (const implementation of ['v1', 'v2']) {
    for (const interruption of ['before-commit', 'after-commit', 'before-checkpoint', 'after-checkpoint']) {
      test(`accepted C023 exact cut/resume counts: ${profileId}/${implementation}/${interruption}`, () => {
        for (let effectIndex = 0; effectIndex < 3; effectIndex++) {
          let state = ledger.create({ jobId: 'job-c030-boundary', workVersion: 'profile-effects/1', profileId, implementation });
          state = ledger.apply(state, { type: 'run', interruption, effectIndex });
          const before = detector.inspectModel(state);
          const committed = effectIndex + (interruption === 'before-commit' ? 0 : 1);
          assert.equal(before.currentCounts.confirmedApplications, committed);
          assert.equal(before.currentCounts.checkpointPosition, effectIndex + (interruption === 'after-checkpoint' ? 1 : 0));
          assert.equal(before.currentCounts.deliveryAttempts, effectIndex + 1);
          assert.equal(before.currentCounts.confirmedAbsences, 0);
          assert.equal(before.currentCounts.extraApplications, 0);
          if (committed === 3) {
            assert.equal(before.originals[0].verdict, 'PASS', 'Effect counts do not depend on checkpoint position or a successful attempt.');
            assert.equal(before.originals[0].sourceBudget.stateVerdict, 'FAIL');
          }
          state = ledger.apply(state, { type: 'resume', interruption: 'none', effectIndex: null });
          const after = detector.inspectModel(state);
          assert.equal(after.currentCounts.confirmedApplications, 3);
          assert.equal(after.currentCounts.deliveryAttempts, interruption === 'after-checkpoint' ? 3 : 4);
          assert.equal(after.currentCounts.duplicateSuppressions, ['after-commit', 'before-checkpoint'].includes(interruption) ? 1 : 0);
          assert.equal(after.currentCounts.checkpointPosition, 3);
          assert.equal(after.currentCounts.extraApplications, 0);
          assert.equal(after.originals[1].verdict, 'PASS');
          assert.deepEqual(after.originals[0], before.originals[0]);
        }
      });
    }
  }
}
test('reconciliation-only latest counts do not rewrite the unknown original', () => {
  let state = ledger.create({ jobId: 'job-c030-reconcile', workVersion: 'profile-effects/1', profileId: 'synthetic-002', implementation: 'v2' });
  state = ledger.apply(state, { type: 'run', interruption: 'unknown-ack', effectIndex: 0 });
  const before = detector.inspectModel(state);
  state = ledger.apply(state, { type: 'reconcile', effectKey: state.plan.effects[0].key, observation: 'observed-committed' });
  const after = detector.inspectModel(state);
  assert.equal(after.currentCounts.hypotheticalApplications, 1);
  assert.equal(after.currentCounts.confirmedApplications, 0);
  assert.equal(after.currentCounts.modeledApplications, 1);
  assert.equal(after.latestWorkEffects[0].confirmedApplicationsUpperBound, null);
  assert.deepEqual(after.originals, before.originals);
  assert.equal(after.counts.originals, 1);
});
