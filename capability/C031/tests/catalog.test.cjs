'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const evaluator = require('..\\evaluator.js');
const source = require('..\\source.cjs');
const saved = require('..\\saved.js');
const f = require('.\\fixtures.cjs');

const catalog = source.catalog();
const bundle = source.readC034Bundle();
const clone = (value) => JSON.parse(JSON.stringify(value));
const summary = (report) => report.clients.map((row) => [row.clientId, row.classification, row.failureKind, row.reasonCodes[0], row.eligible]);

test('the catalog lists the two saved C034 traces, the baseline fleet and the five negatives, all described', () => {
  assert.deepEqual(catalog.ids, ['c034-closed-history', 'c034-held-snapshot', 'fleet-baseline', 'negative-unchanged-flood',
    'negative-replayed-v2-request', 'negative-duplicated-trace', 'negative-stale-cached-ack', 'negative-out-of-order']);
  assert.deepEqual(catalog.ids.map((id) => catalog.describe(id).group), ['historical', 'historical', 'baseline', 'negative', 'negative', 'negative', 'negative', 'negative']);
  assert.equal(catalog.describe('negative-out-of-order').baselineId, 'fleet-baseline');
  assert.equal(catalog.describe('fleet-baseline').baselineId, null);
  assert.equal(catalog.describe('nope'), null);
  assert.equal(catalog.describe(7), null);
  assert.equal(catalog.describe('constructor'), null);
  assert.ok(Object.isFrozen(catalog) && Object.isFrozen(catalog.ids) && Object.isFrozen(catalog.describe('fleet-baseline')));
});

test('a catalog only lists what its sources really are: nothing, only synthetic or only historical', () => {
  assert.deepEqual(evaluator.create().ids, []);
  assert.deepEqual(evaluator.create({}).ids, []);
  assert.deepEqual(evaluator.create({ saved: { bundleVersion: 2, cardId: 'C031', fleets: [] }, c034: { bundleVersion: 1, cardId: 'C031', traces: [] } }).ids, []);
  assert.deepEqual(evaluator.create({ saved: { bundleVersion: 1, cardId: 'C031', fleets: 'x' }, c034: { bundleVersion: 1, cardId: 'C034', traces: 'x' } }).ids, []);
  assert.equal(evaluator.create({ saved }).ids.length, 6);
  assert.equal(evaluator.create({ c034: bundle }).ids.length, 2);
});

const exact = [
  ['fleet-baseline', [3, 8, '37.50%'], { unchanged: 2, failed: 1, unknown: 1, notTransitionedYet: 3, clients: 10 }],
  ['negative-unchanged-flood', [3, 8, '37.50%'], { unchanged: 42, failed: 1, unknown: 1, notTransitionedYet: 3, clients: 50 }],
  ['negative-replayed-v2-request', [3, 10, '30.00%'], { unchanged: 2, failed: 1, unknown: 3, notTransitionedYet: 3, clients: 12 }],
  ['negative-duplicated-trace', [3, 9, '33.33%'], { unchanged: 2, failed: 1, unknown: 3, notTransitionedYet: 2, clients: 11, duplicateCopiesCollapsed: 1 }],
  ['negative-stale-cached-ack', [3, 9, '33.33%'], { unchanged: 2, failed: 1, unknown: 2, notTransitionedYet: 3, clients: 11 }],
  ['negative-out-of-order', [3, 11, '27.27%'], { unchanged: 2, failed: 1, unknown: 4, notTransitionedYet: 3, clients: 13 }]
];
for (const [id, [numerator, denominator, percent], counts] of exact) {
  test(`the saved set ${id} has the exact numbers ${numerator} of ${denominator}`, () => {
    const report = catalog.evaluateSaved(id);
    assert.equal(report.valid, true);
    assert.deepEqual([report.successRate.numerator, report.successRate.denominator, report.successRate.percent], [numerator, denominator, percent]);
    assert.deepEqual(Object.fromEntries(Object.keys(counts).map((key) => [key, report.counts[key]])), counts);
    assert.equal(report.savedId, id);
    assert.equal(report.fleetId, id);
    assert.equal(report.provenance.kind, 'saved-synthetic-fleet');
    assert.equal(report.provenance.fictional, true);
    assert.equal(report.group, catalog.describe(id).group);
  });
}

const comparisons = [
  ['negative-unchanged-flood', 40, 'UNCHANGED_NEW_VERSION_ONLY', 'added'],
  ['negative-replayed-v2-request', 2, 'UNACKNOWLEDGED_NEW_VERSION_REQUEST', 'added'],
  ['negative-duplicated-trace', 3, 'CONFLICTING_DUPLICATE_TRACES', 'changed'],
  ['negative-stale-cached-ack', 1, 'STALE_ACKNOWLEDGMENT', 'added'],
  ['negative-out-of-order', 3, 'ACK_BEFORE_REQUEST', 'added']
];
for (const [id, changed, code, change] of comparisons) {
  test(`${id} does not raise the success rate or the numerator and shows its exact reason codes`, () => {
    const result = catalog.compare(id);
    assert.equal(result.valid, true);
    assert.equal(result.decision, 'NOT_RAISED');
    assert.deepEqual([result.rateRaised, result.numeratorIncreased], [false, false]);
    assert.equal(result.before.savedId, 'fleet-baseline');
    assert.deepEqual([result.before.numerator, result.before.denominator], [3, 8]);
    assert.equal(result.after.savedId, id);
    assert.ok(result.after.numerator <= result.before.numerator);
    assert.ok(result.after.numerator * result.before.denominator <= result.before.numerator * result.after.denominator);
    assert.equal(result.changedClients.length, changed);
    assert.ok(result.changedClients.some((row) => row.reasonCodes[0] === code && row.change === change), code);
    assert.equal(result.liveAzureResult, false);
  });
}

test('the duplicated-trace comparison names each effect: collapsed copy, conflicting copies, duplicated acknowledgment', () => {
  const result = catalog.compare('negative-duplicated-trace');
  assert.deepEqual(result.changedClients.map((row) => [row.clientId, row.change, row.classification, row.reasonCodes[0], row.traceCopies]), [
    ['client-001', 'changed', 'ACTUAL_TRANSITION', 'TRANSITION_EVIDENCE_COMPLETE', 2],
    ['client-004', 'changed', 'FAILED_OR_UNKNOWN', 'CONFLICTING_DUPLICATE_TRACES', 2],
    ['duplicate-001', 'added', 'FAILED_OR_UNKNOWN', 'DUPLICATE_ACK', 1]
  ]);
});

test('the other three negatives name every reason code', () => {
  assert.deepEqual(catalog.compare('negative-replayed-v2-request').changedClients.map((row) => row.reasonCodes[0]),
    ['UNACKNOWLEDGED_NEW_VERSION_REQUEST', 'STATE_BEFORE_ACKNOWLEDGMENT']);
  assert.deepEqual(catalog.compare('negative-stale-cached-ack').changedClients.map((row) => row.reasonCodes[0]), ['STALE_ACKNOWLEDGMENT']);
  assert.deepEqual(catalog.compare('negative-out-of-order').changedClients.map((row) => row.reasonCodes[0]),
    ['ACK_BEFORE_REQUEST', 'NON_MONOTONIC_TIME', 'OUT_OF_ORDER_SEQUENCE']);
  const flood = catalog.compare('negative-unchanged-flood').changedClients;
  assert.ok(flood.every((row) => row.classification === 'UNCHANGED' && row.eligible === false));
});

test('the comparison itself detects inflation, so NOT_RAISED is a measurement and not a constant', () => {
  const fakeSaved = (clients) => ({ bundleVersion: 1, cardId: 'C031', fleets: [
    { id: 'base', role: 'baseline', negativeOf: null, label: 'b', fleet: f.fleet('base', [f.transitioned('a'), f.stillOld('b')]) },
    { id: 'better', role: 'negative', negativeOf: 'base', label: 'n', fleet: f.fleet('better', clients) }] });
  const raised = evaluator.create({ saved: fakeSaved([f.transitioned('a'), f.stillOld('b'), f.transitioned('c')]) }).compare('better');
  assert.deepEqual([raised.rateRaised, raised.numeratorIncreased, raised.decision], [true, true, 'RAISED']);
  const sameRate = evaluator.create({ saved: fakeSaved([f.transitioned('a'), f.stillOld('b'), f.transitioned('c'), f.stillOld('d')]) }).compare('better');
  assert.deepEqual([sameRate.rateRaised, sameRate.numeratorIncreased, sameRate.decision], [false, true, 'RAISED']);
  const lower = evaluator.create({ saved: fakeSaved([f.transitioned('a'), f.stillOld('b'), f.stillOld('c')]) }).compare('better');
  assert.deepEqual([lower.rateRaised, lower.numeratorIncreased, lower.decision], [false, false, 'NOT_RAISED']);
});

test('the comparison refuses what is not a negative set, an unknown set or an invalid source', () => {
  assert.deepEqual([catalog.compare('fleet-baseline').code, catalog.compare('c034-closed-history').code], ['COMPARISON_REQUIRES_NEGATIVE_FLEET', 'COMPARISON_REQUIRES_NEGATIVE_FLEET']);
  assert.deepEqual([catalog.compare('nope').code, catalog.compare(5).code, catalog.compare().code],
    ['UNKNOWN_SAVED_ID', 'UNKNOWN_SAVED_ID', 'NO_COMPARISON_OVERRIDES']);
  assert.equal(catalog.compare('x', 'y').code, 'NO_COMPARISON_OVERRIDES');
  const refused = catalog.compare('fleet-baseline');
  assert.deepEqual([refused.valid, refused.decision, refused.savedId], [false, 'HOLD', 'fleet-baseline']);
  assert.equal(catalog.compare(5).savedId, null);
  const orphan = evaluator.create({ saved: { bundleVersion: 1, cardId: 'C031', fleets: [
    { id: 'lonely', role: 'negative', negativeOf: 'missing', label: 'x', fleet: f.fleet('lonely', []) }] } });
  assert.equal(orphan.compare('lonely').code, 'COMPARISON_SOURCE_INVALID');
});

test('saved evaluation rejects unknown ids, overrides and invalid saved fleets without a success rate', () => {
  for (const [args, code, savedId] of [[['nope'], 'UNKNOWN_SAVED_ID', 'nope'], [[7], 'UNKNOWN_SAVED_ID', null], [[], 'NO_SAVED_OVERRIDES', null],
    [['fleet-baseline', {}], 'NO_SAVED_OVERRIDES', 'fleet-baseline'], [['constructor'], 'UNKNOWN_SAVED_ID', 'constructor']]) {
    const report = catalog.evaluateSaved(...args);
    assert.deepEqual([report.valid, report.code, report.savedId, report.successRate.percent, report.clients.length], [false, code, savedId, null, 0]);
  }
  const broken = evaluator.create({ saved: { bundleVersion: 1, cardId: 'C031', fleets: [
    { id: 'bad-fleet', role: 'baseline', negativeOf: null, label: 'x', fleet: { schema: 'C031-fleet/9', id: 'bad-fleet', clients: [] } },
    { id: 'throws', role: 'baseline', negativeOf: null, label: 'x', get fleet() { throw new TypeError('boom'); } }] } });
  assert.equal(broken.evaluateSaved('bad-fleet').code, 'FLEET_SCHEMA');
  const thrown = broken.evaluateSaved('throws');
  assert.deepEqual([thrown.code, thrown.valid], ['SAVED_SOURCE_UNAVAILABLE', false]);
});

test('the saved closed history is 3 of 7 with failed, interrupted and summary-only originals kept visible', () => {
  const report = catalog.evaluateSaved('c034-closed-history');
  assert.deepEqual(summary(report), [
    ['synthetic-C033-attempt-1', 'ACTUAL_TRANSITION', null, 'TRANSITION_EVIDENCE_COMPLETE', true],
    ['synthetic-C033-attempt-2', 'ACTUAL_TRANSITION', null, 'TRANSITION_EVIDENCE_COMPLETE', true],
    ['synthetic-C033-attempt-3', 'ACTUAL_TRANSITION', null, 'TRANSITION_EVIDENCE_COMPLETE', true],
    ['synthetic-C033-attempt-4', 'FAILED_OR_UNKNOWN', 'FAILED', 'FAILED_REPLY', true],
    ['synthetic-C033-attempt-5', 'FAILED_OR_UNKNOWN', 'UNKNOWN', 'NO_VERSION_OBSERVED', true],
    ['synthetic-C033-attempt-6', 'FAILED_OR_UNKNOWN', 'UNKNOWN', 'INTERRUPTED_BEFORE_TERMINAL_OUTCOME', true],
    ['synthetic-C033-attempt-7', 'FAILED_OR_UNKNOWN', 'UNKNOWN', 'SUMMARY_ONLY_NO_TRACE', true]]);
  assert.deepEqual([report.successRate.numerator, report.successRate.denominator, report.successRate.percent], [3, 7, '42.86%']);
  assert.deepEqual([report.counts.failed, report.counts.unknown, report.counts.unchanged, report.counts.notTransitionedYet], [1, 3, 0, 0]);
  const [first, , third, failed, interrupted, reset, replacement] = report.clients;
  assert.deepEqual(first.evidence.requestAtOldVersion, { seq: 3, at: 1174.2000000476837, action: 'REQUEST', version: '1.0.0', requestId: 'synthetic-C033-attempt-1/read-1' });
  assert.equal(first.evidence.newVersionAcknowledged.deploymentStamp, 'C020-loopback-v2-r1');
  assert.equal(first.evidence.newVersionAcknowledged.issuedAt, null);
  assert.deepEqual(first.evidence.laterRequestOrState, { seq: 7, at: 1205.2000000476837, action: 'STATE', version: '2.0.0' });
  assert.deepEqual(third.notes, ['ISSUE_TIME_NOT_SAVED', 'ORIGINAL_BUDGET_EXCEEDED_SEPARATE_VERDICT']);
  assert.deepEqual(third.annotations, { originalBudgetExceeded: true });
  assert.deepEqual([failed.detail, interrupted.detail, reset.detail, replacement.eventCount], ['UNKNOWN_PROFILE', 'INTERRUPTED_BY_STOP', 'INTERRUPTED_BY_RESET', 0]);
  assert.deepEqual([interrupted.startVersion, replacement.startVersion, interrupted.eligibility], [null, null, 'START_VERSION_UNPROVEN_COUNTED_ELIGIBLE']);
  assert.equal(report.provenance.kind, 'c034-saved-trace-adapted-read-only');
  assert.equal(report.provenance.c034TraceId, 'closed-history');
  assert.equal(report.provenance.migrationAttested, false);
  assert.ok(report.provenance.missingObservationFields.includes('requestToken'));
  assert.equal(report.provenance.acceptedC033.commit, 'dd0870986cfcdd6b5069e5b1da9ff74e9ad3819c');
});

test('the saved held snapshot is 1 of 2 and the held original is not transitioned yet', () => {
  const report = catalog.evaluateSaved('c034-held-snapshot');
  assert.deepEqual(summary(report), [
    ['synthetic-C033-attempt-1', 'ACTUAL_TRANSITION', null, 'TRANSITION_EVIDENCE_COMPLETE', true],
    ['synthetic-C033-attempt-2', 'NOT_TRANSITIONED_YET', null, 'STILL_ON_OLD_VERSION', true]]);
  assert.deepEqual(report.clients[1].notes, ['ISSUE_TIME_NOT_SAVED', 'HELD_AT_BOUNDARY']);
  assert.deepEqual([report.successRate.numerator, report.successRate.denominator, report.successRate.percent], [1, 2, '50.00%']);
});

test('no request token, header, issue time or correlation is invented for the saved traces', () => {
  for (const id of ['c034-closed-history', 'c034-held-snapshot']) {
    for (const row of catalog.evaluateSaved(id).clients) {
      for (const event of row.events) {
        assert.ok(!Object.hasOwn(event, 'requestToken') && !Object.hasOwn(event, 'headers'), id);
        if (event.action === 'ACK') assert.equal(event.issuedAt, null);
      }
    }
  }
});

test('altering a saved C034 trace changes its class: a moved acknowledgment, a wrong stamp or a missing reply never counts', () => {
  const closed = () => clone(bundle.traces.find((trace) => trace.id === 'closed-history'));
  const evaluateTrace = (trace) => evaluator.create({ c034: { ...clone(bundle), traces: [trace] } }).evaluateSaved('c034-closed-history');
  const moved = closed();
  const events = moved.snapshot.events;
  const ack = events.findIndex((event) => event.attemptId === 'synthetic-C033-attempt-1' && event.code === 'ACTUAL_READ_ACKNOWLEDGED');
  [events[ack - 1], events[ack]] = [events[ack], events[ack - 1]];
  const movedRow = evaluateTrace(moved).clients[0];
  assert.deepEqual([movedRow.classification, movedRow.reasonCodes[0]], ['FAILED_OR_UNKNOWN', 'ACK_BEFORE_REQUEST']);
  const stamp = closed();
  stamp.snapshot.history[0].acknowledgements[1].stamp.deploymentStamp = 'C020-loopback-v1-r1';
  assert.equal(evaluateTrace(stamp).clients[0].reasonCodes[0], 'STAMP_MISMATCH');
  const version = closed();
  version.snapshot.history[0].acknowledgements[1].stamp.implementationVersion = '1.0.0';
  assert.equal(evaluateTrace(version).clients[0].reasonCodes[0], 'ACK_VERSION_MISMATCH');
  const missing = closed();
  missing.snapshot.history[0].acknowledgements.pop();
  const missingRow = evaluateTrace(missing).clients[0];
  assert.deepEqual([missingRow.reasonCodes[0], missingRow.detail], ['MALFORMED_TRACE', 'events[5].version']);
  const claimed = closed();
  claimed.snapshot.history[3].outcome = 'observed';
  assert.equal(evaluateTrace(claimed).clients[3].classification, 'FAILED_OR_UNKNOWN');
});

const adapterShapes = [
  ['not an object', null], ['a text', 'x'], ['a wrong format', { traceFormat: 'x', snapshot: { events: [], history: [] } }],
  ['no snapshot', { traceFormat: 'C034-saved-client-trace/1' }],
  ['no events', { traceFormat: 'C034-saved-client-trace/1', snapshot: { events: {}, history: [] } }],
  ['no history', { traceFormat: 'C034-saved-client-trace/1', snapshot: { events: [], history: null } }]
];
for (const [name, trace] of adapterShapes) {
  test(`the C034 adapter refuses a trace that is ${name}`, () => {
    assert.throws(() => evaluator.fromC034Trace(trace), { code: 'C034_TRACE_SHAPE' });
  });
}

test('the C034 adapter maps saved actions one to one, skips non-traffic actions and invents nothing', () => {
  const trace = {
    traceFormat: 'C034-saved-client-trace/1', id: 'held-snapshot',
    snapshot: {
      attemptId: 'a-2', budgetExceeded: false,
      acknowledgements: [{ stamp: { implementationVersion: '1.0.0', deploymentStamp: 'C020-loopback-v1-r1' } }],
      history: [{ attemptId: 'a-1', budgetExceeded: true, acknowledgements: [
        { stamp: { implementationVersion: '1.0.0', deploymentStamp: 'C020-loopback-v1-r1' } },
        { stamp: { implementationVersion: '2.0.0', deploymentStamp: 'C020-loopback-v2-r1' } }] }],
      events: [
        { attemptId: 'a-1', code: 'ORIGINAL_ATTEMPT_STARTED', at: 1 }, { attemptId: 'a-1', code: 'BOUNDARY_HELD', at: 2 },
        { attemptId: 'a-1', code: 'RESUME_ORIGINAL_ATTEMPT', at: 3 },
        { attemptId: 'a-1', code: 'ACTUAL_READ_STARTED', at: 4, implementation: 'v1', ordinal: 1 },
        { attemptId: 'a-1', code: 'ACTUAL_READ_ACKNOWLEDGED', at: 5, implementation: 'v1', ordinal: 1 },
        { attemptId: 'a-1', code: 'ACTUAL_READ_STARTED', at: 6, implementation: 'v2', ordinal: 2 },
        { attemptId: 'a-1', code: 'ACTUAL_READ_ACKNOWLEDGED', at: 7, implementation: 'v2', ordinal: 2 },
        { attemptId: 'a-1', code: 'TWO_READ_LOCAL_SEGMENT_OBSERVED', at: 8 }, { attemptId: 'a-1', code: 'RESET_VIEW_HISTORY_RETAINED', at: 9 },
        { attemptId: 'a-2', code: 'ORIGINAL_ATTEMPT_STARTED', at: 10 },
        { attemptId: 'a-2', code: 'ACTUAL_READ_STARTED', at: 11, implementation: 'v1', ordinal: 1 },
        { attemptId: 'a-2', code: 'ACTUAL_READ_ACKNOWLEDGED', at: 12, implementation: 'v1', ordinal: 1 },
        { attemptId: 'a-2', code: 'SOMETHING_NEW', at: 13 }]
    },
    replacementSummary: { replacementId: 'a-3' }
  };
  const adapted = evaluator.fromC034Trace(trace);
  assert.deepEqual(adapted.options, { issueTimeSaved: false, summaryOnly: [] });
  assert.equal(adapted.fleet.id, 'c034-held-snapshot');
  assert.deepEqual(adapted.fleet.clients.map((client) => client.clientId), ['a-1', 'a-2']);
  assert.deepEqual(adapted.fleet.clients[0].events.map((event) => [event.seq, event.at, event.action, event.version ?? null]), [
    [1, 2, 'HOLD', null], [2, 3, 'RESUME', null], [3, 4, 'REQUEST', '1.0.0'], [4, 5, 'ACK', '1.0.0'], [5, 6, 'REQUEST', '2.0.0'],
    [6, 7, 'ACK', '2.0.0'], [7, 8, 'STATE', '2.0.0']]);
  assert.deepEqual(adapted.fleet.clients.map((client) => client.annotations), [{ originalBudgetExceeded: true }, { originalBudgetExceeded: false }]);
  assert.equal(adapted.fleet.clients[0].events[3].requestId, 'a-1/read-1');
  assert.equal(adapted.fleet.clients[0].events[3].issuedAt, null);
  const withSummary = evaluator.fromC034Trace({ ...clone(trace), id: 'closed-history' });
  assert.deepEqual(withSummary.options.summaryOnly, ['a-3']);
  assert.deepEqual(withSummary.fleet.clients.at(-1), { clientId: 'a-3', events: [], annotations: { originalBudgetExceeded: null } });
  assert.deepEqual(evaluator.fromC034Trace({ ...clone(trace), id: 'closed-history', replacementSummary: { replacementId: 'a-2' } }).options.summaryOnly, []);
  assert.deepEqual(evaluator.fromC034Trace({ ...clone(trace), id: 'closed-history', replacementSummary: null }).options.summaryOnly, []);
  assert.throws(() => evaluator.fromC034Trace(trace, {}), { code: 'NO_ADAPTER_OVERRIDES' });
});

test('the C034 adapter leaves absent facts absent: no reply, a non-object reply, an unknown implementation or a failed read without a request', () => {
  const base = (events, extra = {}) => ({ traceFormat: 'C034-saved-client-trace/1', id: 'x', snapshot: { attemptId: null, history: [], events, ...extra } });
  const missingReply = evaluator.fromC034Trace(base([
    { attemptId: 'a-1', code: 'ACTUAL_READ_STARTED', at: 1, implementation: 'v1', ordinal: 1 },
    { attemptId: 'a-1', code: 'ACTUAL_READ_ACKNOWLEDGED', at: 2, implementation: 'v1', ordinal: 1 },
    { attemptId: 'a-1', code: 'TWO_READ_LOCAL_SEGMENT_OBSERVED', at: 3 }]));
  assert.deepEqual(missingReply.fleet.clients[0].events.map((event) => event.version), ['1.0.0', null, null]);
  assert.equal(missingReply.fleet.clients[0].events[1].deploymentStamp, null);
  const junk = evaluator.fromC034Trace(base([
    { attemptId: 'a-2', code: 'ACTUAL_READ_STARTED', at: 1, implementation: 'constructor', ordinal: 1 },
    { attemptId: 'a-2', code: 'ACTUAL_READ_ACKNOWLEDGED', at: 2, implementation: 'v1', ordinal: 1 }],
  { attemptId: 'a-2', acknowledgements: [7] }));
  assert.deepEqual(junk.fleet.clients[0].events.map((event) => event.version), [null, null]);
  assert.deepEqual(junk.fleet.clients[0].annotations, { originalBudgetExceeded: null });
  const noStamp = evaluator.fromC034Trace(base([{ attemptId: 'a-3', code: 'ACTUAL_READ_ACKNOWLEDGED', at: 1, implementation: 'v1', ordinal: 1 }],
    { attemptId: 'a-3', acknowledgements: [{ stamp: 7 }] }));
  assert.equal(noStamp.fleet.clients[0].events[0].version, null);
  const orphanFailure = evaluator.fromC034Trace(base([{ attemptId: 'a-4', code: 'FAILED_HTTP_REPLY_404', at: 1, replyCode: 'UNKNOWN_PROFILE' }]));
  assert.equal(orphanFailure.fleet.clients[0].events[0].requestId, null);
  const report = evaluator.create({ c034: { bundleVersion: 1, cardId: 'C034', traces: [{ ...base([]), id: 'x', source: fakeSource }] } });
  assert.equal(report.evaluateSaved('c034-x').valid, true);
  assert.equal(report.evaluateSaved('c034-x').counts.clients, 0);
});

const fakeSource = { acceptedC033: { commit: 'c', tag: 't' }, clock: 'synthetic', missingObservationFields: ['requestToken'] };

test('a trace source without provenance cannot be evaluated and a malformed saved row never becomes a success', () => {
  const noSource = evaluator.create({ c034: { bundleVersion: 1, cardId: 'C034', traces: [{ id: 'z', traceFormat: 'C034-saved-client-trace/1', snapshot: { events: [], history: [] } }] } });
  assert.equal(noSource.evaluateSaved('c034-z').code, 'SAVED_SOURCE_UNAVAILABLE');
  const emptySource = evaluator.create({ c034: { bundleVersion: 1, cardId: 'C034', traces: [{ id: 'v', source: {}, traceFormat: 'C034-saved-client-trace/1', snapshot: { events: [], history: [] } }] } });
  assert.equal(emptySource.evaluateSaved('c034-v').code, 'FINITE_OWN_JSON_REQUIRED');
  const bad = evaluator.create({ c034: { bundleVersion: 1, cardId: 'C034', traces: [{ id: 'y', source: fakeSource, traceFormat: 'C034-saved-client-trace/1',
    snapshot: { attemptId: null, history: [], events: [{ code: 'ACTUAL_READ_STARTED', at: 1, implementation: 'v1', ordinal: 1 }] } }] } });
  const rejected = bad.evaluateSaved('c034-y');
  assert.deepEqual([rejected.valid, rejected.code, rejected.successRate.percent], [false, 'FINITE_OWN_JSON_REQUIRED', null]);
  const unnamed = evaluator.create({ c034: { bundleVersion: 1, cardId: 'C034', traces: [{ id: 'w', source: fakeSource, traceFormat: 'C034-saved-client-trace/1',
    snapshot: { attemptId: null, history: [], events: [{ attemptId: '../x', code: 'BOUNDARY_HELD', at: 1 }] } }] } });
  const row = unnamed.evaluateSaved('c034-w').clients[0];
  assert.deepEqual([row.clientId, row.reasonCodes[0]], ['invalid-client-1', 'MALFORMED_TRACE']);
});

test('evaluating a saved trace never freezes or changes the caller-owned bundle', () => {
  const mutable = { bundleVersion: 1, cardId: 'C034', traces: [{ id: 'm', source: { ...fakeSource, acceptedC033: { commit: 'c', tag: 't' } },
    traceFormat: 'C034-saved-client-trace/1', snapshot: { attemptId: null, history: [], events: [] } }] };
  const report = evaluator.create({ c034: mutable }).evaluateSaved('c034-m');
  assert.equal(report.valid, true);
  assert.equal(Object.isFrozen(mutable.traces[0].source.acceptedC033), false);
  assert.notEqual(report.provenance.acceptedC033, mutable.traces[0].source.acceptedC033);
  assert.deepEqual(report.provenance.acceptedC033, { commit: 'c', tag: 't' });
});
