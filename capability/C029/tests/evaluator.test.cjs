'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const evaluator = require('..\\evaluator.js');
const decoder = require('..\\..\\C034\\trace.js');
const driver = require('..\\..\\C033\\journey.js');
const ledger = require('..\\..\\C023\\ledger.js');
const { terminalAt, copy, deeplyFrozen } = require('./helpers.cjs');

test('exact saved originals evaluate 2 PASS / 2 FAIL / 3 UNKNOWN; no healthy-200 denominator', () => {
  const report = evaluator.evaluateSaved('closed-history');
  assert.equal(report.valid, true);
  assert.equal(report.decision, 'FAIL');
  assert.equal(report.sourceConsistentHistorical, true);
  assert.deepEqual(report.counts, { originals: 7, pass: 2, fail: 2, unknown: 3 });
  assert.deepEqual(report.originals.map((row) => row.attemptId),
    Array.from({ length: 7 }, (_, index) => `synthetic-C033-attempt-${index + 1}`));
  assert.deepEqual(report.originals.map((row) => row.verdict), ['PASS', 'PASS', 'FAIL', 'FAIL', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN']);
  assert.equal(report.successFraction.denominator, 7);
  assert.equal(report.successFraction.numerator, 2);
});

test('actual original slow budget, held time, failed 404, unknowns and summary-only replacement stay exact', () => {
  const report = evaluator.evaluateSaved('closed-history');
  const slow = report.originals[2];
  assert.equal(slow.startedAt, 2310.2000000476837);
  assert.equal(slow.deadline, 3310.2000000476837);
  assert.equal(slow.endedAt, 3429.100000143051);
  assert.equal(slow.elapsedMs, 1118.9000000953674);
  assert.equal(slow.pausedMs, 1077.9000000953674);
  assert.equal(slow.budgetMs, 1000);
  assert.equal(slow.latencyVerdict, 'FAIL');
  assert.equal(slow.stateVerdict, 'PASS');
  assert.equal(report.originals[3].originalCode, 'FAILED_HTTP_REPLY_404');
  for (const row of report.originals.slice(4)) assert.equal(row.verdict, 'UNKNOWN');
  const summary = report.originals[6];
  assert.equal(summary.summaryOnly, true);
  for (const field of ['startedAt', 'deadline', 'endedAt', 'elapsedMs', 'requests', 'responses']) assert.equal(summary[field], null);
  assert.deepEqual(summary.observedVersions, []);
  assert.equal(summary.summaryObservation.originalInterruptedId, 'synthetic-C033-attempt-6');
});

test('historical exact IDs, ordered actions, selected business state, contract and version observations are preserved', () => {
  const saved = decoder.getSavedTrace('closed-history');
  const report = evaluator.evaluateSaved('closed-history');
  assert.deepEqual(report.events, saved.snapshot.events);
  for (const [index, original] of saved.snapshot.history.entries()) {
    const row = report.originals[index];
    assert.deepEqual(row.original, original.original);
    assert.deepEqual(row.acknowledgements, original.acknowledgements);
    assert.equal(row.pausedMs, original.pausedMs);
    assert.deepEqual(row.observedVersions.map((version) => version.implementationVersion),
      original.acknowledgements.map((reply) => reply.stamp.implementationVersion));
    assert.ok(row.observedVersions.every((version) => version.apiContract === 'getProfile/1'));
  }
});

test('earlier actual partial remains UNKNOWN/HOLD with no invented v2, terminal, end or later starts', () => {
  const report = evaluator.evaluateSaved('held-snapshot');
  assert.equal(report.decision, 'HOLD');
  assert.deepEqual(report.counts, { originals: 2, pass: 1, fail: 0, unknown: 1 });
  const partial = report.originals[1];
  assert.equal(partial.verdict, 'UNKNOWN');
  assert.equal(partial.stateVerdict, 'UNKNOWN');
  assert.equal(partial.terminalVerdict, 'UNKNOWN');
  assert.equal(partial.endedAt, null);
  assert.equal(partial.requests, 1);
  assert.equal(partial.responses, 1);
  assert.deepEqual(partial.observedVersions.map((version) => version.implementationVersion), ['1.0.0']);
  assert.equal(report.events.some((event) => event.attemptId === partial.attemptId && event.implementation === 'v2'), false);
});

for (const budget of driver.budgets) {
  for (const [delta, expected] of [[-0.25, 'PASS'], [0, 'FAIL'], [0.25, 'FAIL']]) {
    test(`actual C033 budget ${budget}: terminal ${delta < 0 ? 'below' : delta === 0 ? 'at' : 'above'} deadline is ${expected}`, async () => {
      const snapshot = await terminalAt(budget, delta, 100.1);
      const report = evaluator.evaluateSnapshot(snapshot);
      assert.equal(report.valid, true);
      assert.equal(report.originals[0].deadline, snapshot.history[0].deadline);
      assert.equal(report.originals[0].latencyVerdict, expected);
      assert.equal(report.originals[0].verdict, expected);
      assert.equal(report.sourceConsistentHistorical, false);
      assert.equal(report.eligibleForLiveRun, false);
    });
  }
}

test('positive retry cannot repair original FAIL; both original clocks and denominators remain', async () => {
  const comparison = await evaluator.compareRetry();
  assert.equal(comparison.valid, true);
  assert.equal(comparison.before.decision, 'FAIL');
  assert.equal(comparison.after.decision, 'FAIL');
  assert.equal(comparison.before.counts.originals, 1);
  assert.equal(comparison.after.counts.originals, 2);
  assert.deepEqual(comparison.before.originals[0], comparison.after.originals[0]);
  assert.equal(comparison.after.originals[0].elapsedMs, 1000.25);
  assert.equal(comparison.after.originals[1].elapsedMs, 0.25);
  assert.equal(comparison.after.originals[1].verdict, 'PASS');
  assert.equal(comparison.after.successFraction.denominator, 2);
});

test('started interrupted original remains UNKNOWN after a healthy retry and remains in the denominator', async () => {
  const report = await evaluator.evaluateControl('control-unknown-retry');
  assert.equal(report.valid, true);
  assert.equal(report.decision, 'HOLD');
  assert.deepEqual(report.counts, { originals: 2, pass: 1, fail: 0, unknown: 1 });
  assert.equal(report.originals[0].verdict, 'UNKNOWN');
  assert.equal(report.originals[0].originalCode, 'INTERRUPTED_BY_STOP');
  assert.equal(report.originals[0].requests, 0);
  assert.equal(report.originals[1].verdict, 'PASS');
});

for (const [id, requests, versions] of [
  ['control-held-before', 0, []], ['control-held-between', 1, ['1.0.0']]
]) {
  test(`${id}: original 1000 ms continues while held; missing state and terminal stay UNKNOWN`, async () => {
    const report = await evaluator.evaluateControl(id);
    const row = report.originals[0];
    assert.equal(report.valid, true);
    assert.equal(row.latencyVerdict, 'FAIL');
    assert.equal(row.stateVerdict, 'UNKNOWN');
    assert.equal(row.terminalVerdict, 'UNKNOWN');
    assert.equal(row.endedAt, null);
    assert.equal(row.elapsedMs, 1000.25);
    assert.equal(row.requests, requests);
    assert.equal(row.responses, requests);
    assert.deepEqual(row.observedVersions.map((version) => version.implementationVersion), versions);
    assert.equal(report.provenance.actualHttpRequests, 0);
  });
}

test('C023 pure model original incomplete state FAIL survives resume despite later three known applications', () => {
  const report = evaluator.evaluateModel('model-resume');
  assert.equal(report.valid, true);
  assert.equal(report.decision, 'FAIL');
  assert.deepEqual(report.originals.map((row) => row.stateVerdict), ['FAIL', 'PASS']);
  assert.deepEqual(report.originals.map((row) => row.verdict), ['FAIL', 'UNKNOWN']);
  assert.equal(report.originals[0].modelStateAtOriginalTerminal.counters.committedEffects, 1);
  assert.equal(report.originals[0].modelStateAtOriginalTerminal.checkpointNext, 0);
  assert.equal(report.originals[1].modelStateAtOriginalTerminal.counters.committedEffects, 3);
  assert.equal(report.modelCurrent.counters.effectApplications, 3);
  assert.equal(report.modelCurrent.counters.deliveryAttempts, 4);
  assert.equal(report.modelCurrent.counters.duplicateSuppressions, 1);
  assert.deepEqual(report.originals[0].expectedState.effectKeys, report.modelPlan.effects.map((effect) => effect.key));
});

test('C023 hypothetical reconciliation is not an external receipt and does not repair the unknown original', () => {
  const unknown = evaluator.evaluateModel('model-unknown');
  const reconciled = evaluator.evaluateModel('model-reconcile');
  assert.equal(unknown.originals[0].stateVerdict, 'UNKNOWN');
  assert.equal(unknown.modelCurrent.counters.committedEffects, 0);
  assert.equal(unknown.modelCurrent.counters.unknownEffects, 1);
  assert.deepEqual(reconciled.originals[0], unknown.originals[0]);
  assert.equal(reconciled.decision, 'HOLD');
  assert.equal(reconciled.counts.originals, 2);
  assert.equal(reconciled.modelCurrent.counters.reconciliationObservations, 1);
  assert.equal(reconciled.modelCurrent.applications[0].origin, 'synthetic-reconciliation');
  assert.equal(reconciled.originals[1].stateVerdict, 'PASS');
  assert.equal(reconciled.originals[1].verdict, 'UNKNOWN');
  assert.match(reconciled.provenance.atomicPairAssumption, /No durable or external transaction/);
});

test('even clean model state PASS is overall UNKNOWN/HOLD with no invented clock or native/client mutation claim', () => {
  const report = evaluator.evaluateModel('model-clean');
  assert.equal(report.valid, true);
  assert.equal(report.decision, 'HOLD');
  assert.equal(report.originals[0].stateVerdict, 'PASS');
  assert.equal(report.originals[0].latencyVerdict, 'UNKNOWN');
  assert.equal(report.originals[0].startedAt, null);
  assert.equal(report.userJourneySuccess, false);
  assert.equal(report.actualClientMutation, false);
  assert.equal(report.actualExternalEffects, false);
  assert.equal(report.durableEffects, false);
  assert.equal(report.reliabilityCertified, false);
});

test('results and source remain detached recursively frozen, including prefixes and errors', async () => {
  const original = decoder.canonical(decoder.getSavedTrace('closed-history'));
  for (const report of [evaluator.evaluateSaved('closed-history'), evaluator.evaluateSaved('held-snapshot'),
    await evaluator.evaluateControl('control-retry'), evaluator.evaluateModel('model-reconcile'),
    evaluator.evaluateCandidate('{}', 'closed-history')]) {
    assert.equal(deeplyFrozen(report), true);
    assert.throws(() => { report.counts.originals = 0; }, TypeError);
  }
  assert.equal(decoder.canonical(decoder.getSavedTrace('closed-history')), original);
});

test('exact saved copy is inspection only, not approval, identity, live run, reliability or migration adoption', () => {
  const report = evaluator.evaluateCandidate(evaluator.savedJson('closed-history'), 'closed-history');
  assert.equal(report.valid, true);
  for (const field of ['eligibleForLiveRun', 'userJourneySuccess', 'actualClientMutation', 'actualExternalEffects',
    'actualRunCorrelation', 'nativeTransportQualified', 'productionRuntimeValidated', 'fullJourneyQualified',
    'reliabilityCertified', 'approvalAdopted']) assert.equal(report[field], false);
});

test('model input inspection does not mutate the original, and inconsistent projection cannot be adopted', () => {
  const state = ledger.create({ jobId: 'job-c029-input', workVersion: 'profile-effects/1', profileId: 'synthetic-001', implementation: 'v2' });
  const before = JSON.stringify(state);
  const invalid = copy(state);
  invalid.view.counters.committedEffects = 3;
  assert.equal(evaluator.evaluateModelSnapshot(invalid).valid, false);
  assert.equal(JSON.stringify(state), before);
  assert.equal(evaluator.evaluateModelSnapshot(state).decision, 'HOLD');
});
