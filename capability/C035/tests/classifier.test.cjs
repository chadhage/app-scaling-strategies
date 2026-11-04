'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const classifier = require('..\\classifier.js');

test('every closed source returns finite frozen original/dimension accounting and denies mutation authority', async () => {
  for (const id of classifier.ids) {
    const result = await classifier.inspect(id);
    assert.equal(result.valid, true, `${id}: ${result.code}`);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.originals));
    assert.equal(result.counts.originals, result.originals.length);
    assert.equal(result.counts.originals, result.counts.pass + result.counts.fail + result.counts.hold);
    assert.equal(result.dimensionCounts.required, result.originals.length * 6);
    for (const dimension of classifier.dimensions) {
      const count = result.dimensionCounts.byDimension[dimension];
      assert.equal(count.pass + count.fail + count.unknown, result.counts.originals);
    }
    for (const key of ['actualUserMutationSuccess', 'actualCancellationPerformed', 'actualC015Cancellation',
      'actualCleanupPerformed', 'externalUndoVerified', 'actualNoEffectsVerified', 'eligibleForLiveRun',
      'authenticatedCurrentAssociation', 'fullJourneyQualified', 'nativeTransportQualified', 'productionNode24Validated']) {
      assert.equal(result[key], false, `${id}: ${key}`);
    }
    classifier.ownData(result);
  }
});
test('historical closed originals retain 2 local-segment passes, 2 failures and 3 holds', async () => {
  const result = await classifier.inspect('closed-history');
  assert.deepEqual([result.counts.originals, result.counts.pass, result.counts.fail, result.counts.hold], [7, 2, 2, 3]);
  assert.equal(result.decision, 'FAIL');
  assert.equal(result.originals[2].dimensions.timing, 'FAIL');
  assert.equal(result.originals[2].elapsedMs, 1118.9000000953674);
  assert.equal(result.originals[2].originalBudgetMs, 1000);
  assert.equal(result.originals[3].dimensions.state, 'FAIL');
  assert.equal(result.originals[4].classification, 'INTERRUPTED');
  assert.equal(result.originals[5].classification, 'INTERRUPTED');
  assert.equal(result.originals[6].dimensions.context, 'UNKNOWN');
  assert.equal(result.originals[6].dimensions.provenance, 'UNKNOWN');
  assert.equal(result.originals[6].classification, 'UNKNOWN');
  assert.match(result.scope, /historical.*local.*not full user journey/);
});
test('earlier partial snapshot never acquires the later terminal, schema or summary originals', async () => {
  const result = await classifier.inspect('held-snapshot');
  assert.deepEqual([result.counts.originals, result.counts.pass, result.counts.hold], [2, 1, 1]);
  assert.equal(result.decision, 'HOLD');
  assert.equal(result.originals[1].endedAt, null);
  assert.equal(result.originals[1].dimensions.state, 'UNKNOWN');
  assert.equal(result.originals[1].dimensions.timing, 'UNKNOWN');
  assert.equal(result.originals[1].dimensions.terminal, 'UNKNOWN');
});
for (const dimension of classifier.dimensions) {
  test(`missing original ${dimension} cannot be success`, async () => {
    const result = await classifier.inspect(`modeled-missing-${dimension}`);
    assert.equal(result.decision, 'HOLD');
    assert.equal(result.originals[0].dimensions[dimension], 'UNKNOWN');
    assert.equal(result.originals[0].completedWorkWithinScope, false);
  });
}
test('unsupported, unknown and interrupted are explicit different non-success results', async () => {
  for (const type of ['unsupported', 'unknown', 'interrupted']) {
    const result = await classifier.inspect(`modeled-${type}`);
    assert.equal(result.originals[0].classification, type.toUpperCase());
    assert.equal(result.decision, 'HOLD');
    assert.equal(result.counts.pass, 0);
  }
});
test('cancel request without matching terminal ack is unknown, never stored/native cancellation', async () => {
  const result = await classifier.inspect('modeled-cancel-request');
  const original = result.originals[0];
  assert.equal(result.decision, 'HOLD');
  assert.equal(original.classification, 'UNKNOWN');
  assert.equal(original.reportedResultType, 'CANCEL_REQUESTED');
  assert.equal(original.cancelRequestObserved, true);
  assert.equal(original.terminalEvidence, null);
  assert.equal(original.dimensions.terminal, 'UNKNOWN');
  assert.equal(original.dimensions.provenance, 'UNKNOWN');
  assert.equal(original.cancellationEvidence, 'UNKNOWN_REQUIRED_CANCEL_TERMINAL_ACK_ABSENT');
  assert.equal(original.noEffectsEvidence, 'UNKNOWN');
  assert.equal(original.cancelledWork, 'NOT_VERIFIED');
});
test('fictional cancel ack proves only modeled cancelled work, not no effects or external undo', async () => {
  const ordinary = await classifier.inspect('modeled-cancelled');
  const noEffects = await classifier.inspect('modeled-cancelled-no-effect');
  for (const result of [ordinary, noEffects]) {
    assert.equal(result.decision, 'HOLD');
    assert.equal(result.originals[0].classification, 'CANCELLED');
    assert.equal(result.originals[0].cancelledWork, 'MODELED_ONLY');
    assert.equal(result.originals[0].dimensions.terminal, 'PASS');
    assert.equal(result.originals[0].completedWorkWithinScope, false);
    assert.equal(result.originals[0].externalUndoVerified, false);
    assert.match(result.scope, /MODELED fictional/);
    assert.match(result.originals[0].terminalEvidence.context.runId, /^MODELED-/);
  }
  assert.equal(ordinary.originals[0].noEffectsEvidence, 'UNKNOWN');
  assert.equal(noEffects.originals[0].noEffectsEvidence, 'MODELED_ZERO_EFFECT_RECEIPT_ONLY');
});
for (const id of ['modeled-failed-unsupported', 'modeled-failed-unknown', 'modeled-failed-cancel']) {
  test(`known original FAIL dominates ${id}`, async () => {
    const result = await classifier.inspect(id);
    assert.equal(result.decision, 'FAIL');
    assert.equal(result.originals[0].classification, 'FAILED');
    assert.equal(result.originals[0].dimensions.timing, 'FAIL');
    assert.equal(result.counts.fail, 1);
    assert.equal(result.counts.pass, 0);
  });
}
test('strict original deadline equality fails, positive retry cannot replace the first original', async () => {
  for (const [id, expected] of [['control-below', 'PASS'], ['control-at', 'FAIL'], ['control-above', 'FAIL']]) {
    assert.equal((await classifier.inspect(id)).decision, expected);
  }
  const comparison = await classifier.compare('retry');
  assert.equal(comparison.before.counts.fail, 1);
  assert.deepEqual([comparison.after.counts.originals, comparison.after.counts.pass, comparison.after.counts.fail], [2, 1, 1]);
  assert.deepEqual(comparison.before.originals[0], comparison.after.originals[0]);
  assert.equal(comparison.decision, 'FAIL');
});
test('expired partial evidence preserves confirmed budget failure with missing state and terminal', async () => {
  for (const id of ['control-held-before', 'control-held-between']) {
    const result = await classifier.inspect(id);
    assert.equal(result.decision, 'FAIL');
    assert.equal(result.originals[0].dimensions.timing, 'FAIL');
    assert.equal(result.originals[0].dimensions.state, 'UNKNOWN');
    assert.equal(result.originals[0].dimensions.terminal, 'UNKNOWN');
    assert.ok(result.originals[0].missingDimensions.length);
  }
});
test('mathematical model state pass does not manufacture latency or actual effects', async () => {
  const clean = await classifier.inspect('model-clean');
  assert.equal(clean.decision, 'HOLD');
  assert.equal(clean.originals[0].dimensions.state, 'PASS');
  assert.equal(clean.originals[0].dimensions.timing, 'UNKNOWN');
  const resume = await classifier.inspect('model-resume');
  assert.equal(resume.originals[0].resultType, 'INTERRUPTED');
  assert.equal(resume.originals[0].decision, 'FAIL');
  assert.equal(resume.originals[1].decision, 'HOLD');
  assert.equal(resume.decision, 'FAIL');
  const comparison = await classifier.compare('model-reconciliation');
  assert.equal(comparison.before.originals[0].classification, 'UNKNOWN');
  assert.deepEqual(comparison.before.originals[0], comparison.after.originals[0]);
  assert.equal(comparison.after.originals[1].decision, 'HOLD');
  assert.equal(comparison.decision, 'HOLD');
});
test('comparing independent fictional cancel controls never means actual lifecycle progress', async () => {
  const result = await classifier.compare('cancellation');
  assert.equal(result.before.originals[0].classification, 'UNKNOWN');
  assert.equal(result.after.originals[0].classification, 'CANCELLED');
  assert.equal(result.decision, 'HOLD');
  assert.match(result.boundary, /Independent MODELED fictional controls/);
  assert.equal(result.actualCancellationPerformed, false);
});
