'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { browserModel, evaluate, copy } = require('./support.cjs');
const routing = require('..\\routing.js');

test('nominal requested weights never become measured destinations; zero denominator HOLD', async () => {
  const { result } = await evaluate('fictional-zero');
  assert.equal(result.observed.known, 0);
  assert.equal(result.observed.started, 0);
  assert.equal(result.disposition, 'HOLD');
  assert.equal(result.zeroDenominator, true);
  assert.equal(result.observed.destinations[0].share, null);
  assert.ok(result.differences.every((item) => item.withinThreshold === null));
  assert.equal(result.currentMetricTransition, false);
});
test('separately measured fictional control can match, but never proves actual policy/lease/journey', async () => {
  const { result, model } = await evaluate('fictional-match');
  assert.equal(result.disposition, 'MATCH_CONTROL');
  assert.equal(result.observed.started, 4);
  assert.equal(result.observed.known, 4);
  assert.equal(result.currentMetrics.started, 4);
  assert.deepEqual(result.observed.destinations.map((item) => item.count), [2, 2]);
  assert.equal(result.guard.outcome, 'fixture-verified');
  assert.equal(result.contextOrigin, 'bundled-historical-C015-observation-only');
  for (const field of ['observedRequestedPolicyVerified', 'authenticatedIdentityVerified', 'leaseAuthority',
    'nativeTransportQualified', 'migrationQualified', 'fullJourneyQualified', 'productionRuntimeValidated']) assert.equal(result[field], false);
  assert.equal(result.actualCurrentAttributedRequests, 0);
  assert.equal(model.snapshot().history.length, 1);
});
test('inspect is conductable but cannot commit the private original ledger', async () => {
  const { result, model, input } = await evaluate('fictional-match', null, 'inspectText');
  assert.equal(result.observed.known, 4);
  assert.equal(result.currentMetrics.started, 0);
  assert.equal(result.currentMetricTransition, false);
  const compared = await model.compareText(JSON.stringify(input));
  assert.equal(compared.currentMetrics.started, 4);
});
test('threshold is inclusive and checked by exact integer ratios, not rounded percentages', async () => {
  const boundary = (await evaluate('fictional-threshold')).result;
  assert.equal(boundary.disposition, 'MATCH_CONTROL');
  assert.deepEqual(boundary.differences.map((item) => item.deltaBps), [-500, 500]);
  const outside = (await evaluate('fictional-threshold', (input) => { input.requested.toleranceBps = 499; })).result;
  assert.equal(outside.disposition, 'MISMATCH');
  const exact = (await evaluate('fictional-match', (input) => { input.requested.toleranceBps = 0; })).result;
  assert.equal(exact.disposition, 'MATCH_CONTROL');
});
test('finite closed weights must sum exactly; zeros are valid policy, never observations', async () => {
  for (const weights of [[4999, 5000], [5000, 5001]]) {
    const { result } = await evaluate('fictional-match', (input) => {
      input.requested.targets.forEach((item, index) => { item.weightBps = weights[index]; });
    });
    assert.equal(result.code, 'EXACT_WEIGHT_SUM_REQUIRED');
    assert.equal(result.currentMetrics.started, 0);
  }
  const { result } = await evaluate('fictional-skew', (input) => {
    input.requested.targets[0].weightBps = 10000;
    input.requested.targets[1].weightBps = 0;
  });
  assert.equal(result.disposition, 'MATCH_CONTROL');
  assert.deepEqual(result.differences.map((item) => item.observedCount), [4, 0]);
});
for (const [id, field] of [
  ['fictional-unknown', 'interrupted'], ['fictional-in-flight', 'inFlight'],
  ['fictional-missing-destination', 'missingDestination']
]) {
  test(`${id}: unknown started original stays in denominator, separately classified and HOLD`, async () => {
    const { result } = await evaluate(id);
    assert.equal(result.observed.started, 4);
    assert.equal(result.observed.known, 3);
    assert.equal(result.observed.unknown, 1);
    assert.equal(result.observed[field], 1);
    assert.deepEqual(result.observed.destinations.map((item) => item.share), [0.5, 0.25]);
    assert.equal(result.disposition, 'HOLD');
    assert.equal(result.currentMetrics.unknown, 1);
    assert.equal(result.currentMetrics.started, 4);
  });
}
test('HTTP 200 without stamp cannot supply a destination, readiness or full journey', async () => {
  const { result } = await evaluate('fictional-missing-destination');
  assert.equal(result.observed.http200Responses, 4);
  assert.equal(result.observed.known, 3);
  assert.equal(result.fullJourneyQualified, false);
  const failed = (await evaluate('fictional-errors')).result;
  assert.equal(failed.disposition, 'MATCH_CONTROL');
  assert.equal(failed.observed.failedResponses, 4);
  assert.equal(failed.fullJourneyQualified, false);
});
test('minimum samples and absent policy HOLD without inferring any policy', async () => {
  const tooSmall = (await evaluate('fictional-match', (input) => { input.requested.minimumStarted = 5; })).result;
  assert.equal(tooSmall.disposition, 'HOLD');
  assert.ok(tooSmall.missing.includes('INSUFFICIENT_STARTED_ORIGINALS'));
  for (const edit of [(input) => { input.requested = null; }, (input) => { delete input.requested; }]) {
    const { result } = await evaluate('fictional-match', edit);
    assert.equal(result.disposition, 'HOLD');
    assert.equal(result.requested, null);
    assert.ok(result.differences.every((item) => item.requestedWeightBps === null));
    assert.equal(result.observed.known, 4);
  }
});
test('duplicate deliveries count delivery duplication, never another original', async () => {
  const exactDuplicate = (await evaluate('fictional-duplicates')).result;
  assert.equal(exactDuplicate.disposition, 'MATCH_CONTROL');
  assert.equal(exactDuplicate.observed.started, 4);
  assert.equal(exactDuplicate.observed.known, 4);
  assert.equal(exactDuplicate.observed.duplicateDeliveries, 1);
  const distinctDelivery = (await evaluate('fictional-duplicates', (input) => { input.observations.at(-1).eventId += '-again'; })).result;
  assert.equal(distinctDelivery.observed.duplicateDeliveries, 1);
  assert.equal(distinctDelivery.currentMetrics.started, 4);
});
test('conflicting duplicate or interrupted replacement cannot overwrite the original', async () => {
  const conflict = (await evaluate('fictional-duplicates', (input) => {
    input.observations.at(-1).destination = 'v1';
    input.observations.at(-1).stamp = copy(input.attribution.observations[1].stamp);
  })).result;
  assert.equal(conflict.code, 'CONFLICTING_DELIVERY');
  assert.equal(conflict.currentMetrics.started, 0);
  const replaced = (await evaluate('fictional-unknown', (input) => {
    const event = copy(input.observations[1]);
    Object.assign(event, { ordinal: 9, observedTick: 104, eventId: input.observations.at(-1).eventId + '-retry',
      originalRequestId: input.observations.at(-1).originalRequestId });
    input.observations.push(event);
  })).result;
  assert.equal(replaced.code, 'CONFLICTING_ORIGINAL_OUTCOME');
});
test('historical closed originals are measured actual observations, never current attribution or 50/50 policy', async () => {
  const { result } = await evaluate('historical-closed');
  assert.equal(result.disposition, 'HOLD');
  assert.equal(result.sourceClassification, 'actual-historical-local-HTTP-destination-observations');
  assert.equal(result.requested, null);
  assert.equal(result.policyClassification, 'UNOBSERVED');
  assert.equal(result.observed.started, 8);
  assert.equal(result.observed.known, 7);
  assert.equal(result.observed.missingDestination, 1);
  assert.equal(result.observed.failedResponses, 1);
  assert.deepEqual(result.observed.destinations.map((item) => [item.count, item.share]), [[4, 0.5], [3, 0.375]]);
  assert.equal(result.observed.http200Responses, 0, 'No explicit status is inferred from response stamps.');
  assert.equal(result.currentMetrics.started, 0);
  assert.equal(result.originals.length, 6);
  assert.equal(result.originals[2].classification, 'original-budget-exceeded');
  assert.equal(result.originals[3].classification, 'failed');
  assert.equal(result.originals[4].requests, 0);
});
test('held historical partial and a declared hypothetical policy cannot establish current association', async () => {
  const { result } = await evaluate('historical-held', (input) => {
    input.requested = { policyId: 'fictional-C037-requested-001', origin: 'declared-fictional-policy',
      targets: [{ destination: 'v1', weightBps: 5000 }, { destination: 'v2', weightBps: 5000 }], toleranceBps: 10000, minimumStarted: 1 };
  });
  assert.equal(result.observed.started, 3);
  assert.equal(result.observed.complete, false);
  assert.equal(result.originals[1].classification, 'partial-unknown');
  assert.equal(result.disposition, 'HOLD');
  assert.equal(result.currentMetrics.started, 0);
  assert.match(result.policyClassification, /declared/);
});
for (const [id, code] of [
  ['wrong-run', 'RUN_MISMATCH'], ['wrong-user', 'USER_MISMATCH'], ['wrong-lease', 'LEASE_MISMATCH'],
  ['wrong-context', 'CONTEXT_MISMATCH'], ['old-epoch', 'EPOCH_MISMATCH_OR_STALE'],
  ['stale', 'STALE_OBSERVATION'], ['wrong-tier', 'TIER_MISMATCH'], ['wrong-stamp', 'TIER_STAMP_MISMATCH']
]) {
  test(`${id}: unchanged C036 guard rejects before current metric transition`, async () => {
    const { result } = await evaluate(id);
    assert.equal(result.code, code);
    assert.equal(result.outcome, 'rejected');
    assert.equal(result.currentMetrics.started, 0);
    assert.equal(result.currentMetricTransition, false);
  });
}
test('missing complete attribution, observations or route correlation HOLD, not invented identity', async () => {
  for (const edit of [
    (input) => { input.attribution = null; },
    (input) => { delete input.attribution.observations[0].leaseId; },
    (input) => { input.observations = null; },
    (input) => { delete input.observations; },
    (input) => { delete input.observations[0].correlation.userId; }
  ]) {
    const { result } = await evaluate('fictional-match', edit);
    assert.equal(result.outcome, 'held');
    assert.equal(result.currentMetrics.started, 0);
    assert.equal(result.currentMetricTransition, false);
  }
});
test('absent response destination, stamp or status stays unknown/HOLD in the original denominator', async () => {
  for (const key of ['destination', 'stamp', 'httpStatus']) {
    const { result } = await evaluate('fictional-match', (input) => { delete input.observations[1][key]; });
    assert.equal(result.outcome, 'held');
    assert.equal(result.observed.started, 4);
    assert.equal(result.observed.known, 3);
    assert.equal(result.observed.missingDestination, 1);
    assert.equal(result.currentMetrics.unknown, 1);
  }
  const { result } = await evaluate('fictional-match', (input) => { delete input.observations[0].correlation; });
  assert.equal(result.outcome, 'held');
  assert.equal(result.currentMetrics.started, 0);
});
test('all route event correlation fields are owner-owned, including namespace/version/digest and request', async () => {
  for (const key of ['fixtureScope', 'fixtureNamespace', 'runId', 'userId', 'leaseId', 'contextId', 'epoch',
    'epochVersion', 'stateSha256', 'attemptId', 'requestId']) {
    const { result } = await evaluate('fictional-match', (input) => {
      const link = input.observations[0].correlation;
      link[key] = typeof link[key] === 'number' ? link[key] + 1 : `${link[key]}-wrong`;
    });
    assert.equal(result.code, 'ROUTING_CORRELATION_MISMATCH', key);
    assert.equal(result.currentMetrics.started, 0);
  }
});
test('typed, finite, closed, bounded policy and event fields reject without coercion', async () => {
  const edits = [
    (input) => { input.schemaVersion = '1'; },
    (input) => { input.requested.targets[0].weightBps = '5000'; },
    (input) => { input.requested.targets[0].weightBps = 5000.5; },
    (input) => { input.requested.minimumStarted = 0; },
    (input) => { input.requested.toleranceBps = 10001; },
    (input) => { input.requested.targets.reverse(); },
    (input) => { input.requested.targets[0].destination = 'v3'; },
    (input) => { input.requested.targets.push(copy(input.requested.targets[0])); },
    (input) => { input.requested.origin = 'observed-actual-policy'; },
    (input) => { input.approved = true; },
    (input) => { input.observations[1].httpStatus = '200'; },
    (input) => { input.observations[1].destination = 'v3'; },
    (input) => { input.observations[0].kind = 'ready'; },
    (input) => { input.observations[1].stamp.implementationVersion = 'healthy'; },
    (input) => { input.observations[0].correlation.epoch = '3'; },
    (input) => { input.observations = Array(129).fill(input.observations[0]); }
  ];
  for (const edit of edits) {
    const { result } = await evaluate('fictional-match', edit);
    assert.equal(result.outcome, 'rejected');
    assert.equal(result.currentMetrics.started, 0);
  }
});
test('request-before-response, exact ordinal order, stale/future ticks and duplicate starts are enforced', async () => {
  for (const edit of [
    (input) => { input.observations[0].ordinal = 2; },
    (input) => { const event = input.observations.shift(); input.observations[0].ordinal = 1; input.observations.push(event); },
    (input) => { input.observations[0].observedTick = 99; },
    (input) => { input.observations[0].observedTick = 108; },
    (input) => { input.observations[2].observedTick = 100; },
    (input) => { input.observations[2].originalRequestId = input.observations[0].originalRequestId; }
  ]) {
    const { result } = await evaluate('fictional-match', edit);
    assert.equal(result.outcome, 'rejected');
    assert.equal(result.currentMetrics.started, 0);
  }
});
test('duplicate JSON keys, escaped keys, unsafe numeric literals, UTF-8 and bounds are not normalized into success', async () => {
  for (const [input, code] of [
    ['{"schemaVersion":1,"schemaVersion":1}', 'DUPLICATE_FIELD'],
    ['{"schemaVersion":1,"schema\\u0056ersion":1}', 'DUPLICATE_FIELD'],
    ['{"n":-0}', 'UNSAFE_NUMBER_LITERAL'], ['{"n":9007199254740993}', 'UNSAFE_NUMBER_LITERAL'],
    ['{"n":1e309}', 'UNSAFE_NUMBER_LITERAL'], ['{"n":0.100000000000000005}', 'UNSAFE_NUMBER_LITERAL'],
    ['{', 'INVALID_JSON'], [' '.repeat(65537), 'EVIDENCE_OVERSIZE']
  ]) {
    const model = await browserModel();
    assert.equal((await model.compareText(input)).code, code);
  }
  const model = await browserModel();
  assert.equal((await model.compareBytes(new Uint8Array([0xc3, 0x28]))).code, 'INVALID_UTF8');
  assert.equal((await model.compareBytes('text')).code, 'EVIDENCE_BYTES_REQUIRED');
  assert.equal((await model.compareText({})).code, 'JSON_TEXT_REQUIRED');
  assert.equal((await model.compareText('{}', { approved: true })).code, 'NO_CALLER_CONTEXT_OR_VERDICT');
  await assert.rejects(() => routing.open({ expected: true }), { code: 'NO_CALLER_CONTEXT_OR_GUARD' });
});
test('actual source, source classification, immutable return values and input copies cannot be forged', async () => {
  for (const edit of [
    (input) => { input.savedTrace.source.savedDom.rawSha256 = '0'.repeat(64); },
    (input) => { input.savedTrace.snapshot.events.pop(); },
    (input) => { input.observations = []; },
    (input) => { input.attribution = null; input.savedTrace.context.receipt.state.epoch = 1; },
    (input) => { input.evidenceKind = 'closed-fictional-routing/1'; }
  ]) {
    const { result } = await evaluate('historical-closed', edit);
    assert.equal(result.outcome, 'rejected');
    assert.equal(result.currentMetrics.started, 0);
  }
  const { model, result } = await evaluate('fictional-match');
  const snapshot = model.snapshot();
  assert.ok(Object.isFrozen(snapshot));
  assert.throws(() => { snapshot.currentMetrics.started = 999; }, TypeError);
  assert.throws(() => { snapshot.currentExpectedContext.epoch = 1; }, TypeError);
  const input = model.getFixture('fictional-zero');
  input.requested.targets[0].weightBps = 123;
  assert.equal(model.getFixture('fictional-zero').requested.targets[0].weightBps, 5000);
  assert.equal(result.currentMetrics.started, 4);
});
test('replay, healthy aggregate and presentation resets cannot erase a known mismatch or unknown original', async () => {
  const model = await browserModel();
  const skew = model.getFixture('fictional-skew');
  assert.equal((await model.compareText(JSON.stringify(skew))).disposition, 'MISMATCH');
  assert.equal((await model.compareText(JSON.stringify(model.getFixture('fictional-match')))).disposition, 'FAILURE_RETAINED');
  assert.equal((await model.compareText(JSON.stringify(skew))).code, 'REPLAYED_ORIGINAL_REQUEST');
  assert.equal(model.snapshot().currentMetrics.started, 8);
  assert.equal(model.snapshot().sessionDisposition, 'FAILURE_RETAINED');
  assert.equal(typeof model.reset, 'undefined');
  const held = await browserModel();
  await held.compareText(JSON.stringify(held.getFixture('fictional-unknown')));
  await held.compareText(JSON.stringify(held.getFixture('fictional-match')));
  assert.equal(held.snapshot().currentMetrics.started, 8);
  assert.equal(held.snapshot().currentMetrics.unknown, 1);
  assert.equal(held.snapshot().sessionDisposition, 'FAILURE_RETAINED');
});
test('unknown observations cannot become a passing session through loose thresholds or a healthier subsequent aggregate', async () => {
  const model = await browserModel();
  const unknown = model.getFixture('fictional-unknown');
  unknown.requested.toleranceBps = 10000;
  assert.equal((await model.compareText(JSON.stringify(unknown))).disposition, 'HOLD');
  const healthy = await model.compareText(JSON.stringify(model.getFixture('fictional-match')));
  assert.equal(healthy.sampleDisposition, 'MATCH_CONTROL');
  assert.equal(healthy.disposition, 'HOLD_RETAINED');
  assert.equal(healthy.sessionDisposition, 'HOLD_RETAINED');
  assert.equal(healthy.currentMetrics.unknown, 1);
  assert.equal(healthy.currentMetrics.started, 8);
});
test('bounded history refuses work rather than evict failures; no unknown ID defaults', async () => {
  const model = await browserModel();
  assert.throws(() => model.getFixture(''), { code: 'UNKNOWN_SAMPLE_ID' });
  assert.throws(() => model.getFixture('http://example.invalid'), { code: 'UNKNOWN_SAMPLE_ID' });
  for (let index = 0; index < 16; index++) await model.inspectText('{');
  assert.equal(model.snapshot().history.length, 16);
  assert.equal((await model.compareText(JSON.stringify(model.getFixture('fictional-match')))).code, 'HISTORY_LIMIT');
  assert.equal(model.snapshot().history.length, 16);
  assert.equal(model.snapshot().currentMetrics.started, 0);
});
test('actual Node reader checks current independently accepted C036 and read-only C015 context', async () => {
  const { checkImports, readState } = require('..\\pins.cjs');
  assert.equal(checkImports().length, 23);
  const state = readState();
  assert.equal(state.prerequisites.find((entry) => entry.id === 'C036').publication.commit, 'df7a4e1f4f07d834f17edd8f816bb2b5d166ae6e');
  const model = await routing.open();
  const result = await model.inspectText(JSON.stringify(model.getFixture('fictional-match')));
  assert.equal(result.contextOrigin, 'actual-C015-public-restore-read-only');
  assert.equal(result.guard.outcome, 'fixture-verified');
  assert.equal(result.currentMetrics.started, 0);
  const context = model.snapshot().currentExpectedContext;
  assert.equal(context.runId, 'synthetic-run-001');
  assert.match(context.stateSha256, /^[0-9a-f]{64}$/);
  assert.equal(result.actualCurrentAttributedRequests, 0);
});
