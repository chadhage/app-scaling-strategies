'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const evaluator = require('..\\evaluator.js');
const f = require('.\\fixtures.cjs');

const run = (clients, id = 'unit') => evaluator.evaluateFleet(f.fleet(id, clients));
const rowOf = (report, clientId) => report.clients.find((row) => row.clientId === clientId);
const one = (client) => run([client]).clients[0];

test('the version table is the closed, stamped C020 pair of one contract', () => {
  assert.equal(evaluator.versions.apiContract, 'getProfile/1');
  assert.deepEqual(evaluator.versions.old, { label: 'v1', implementationVersion: '1.0.0', deploymentStamp: 'C020-loopback-v1-r1' });
  assert.deepEqual(evaluator.versions.new, { label: 'v2', implementationVersion: '2.0.0', deploymentStamp: 'C020-loopback-v2-r1' });
  assert.ok(Object.isFrozen(evaluator.versions) && Object.isFrozen(evaluator.versions.old));
  assert.deepEqual(evaluator.classes, ['ACTUAL_TRANSITION', 'UNCHANGED', 'NOT_TRANSITIONED_YET', 'FAILED_OR_UNKNOWN']);
  assert.equal(evaluator.banner, 'Training rehearsal - synthetic data - not a live Azure result');
});

const classification = [
  ['transitioned', f.transitioned, 'ACTUAL_TRANSITION', null, 'TRANSITION_EVIDENCE_COMPLETE', true],
  ['transitioned after a hold', f.transitionedWithHold, 'ACTUAL_TRANSITION', null, 'TRANSITION_EVIDENCE_COMPLETE', true],
  ['still on the old version', f.stillOld, 'NOT_TRANSITIONED_YET', null, 'STILL_ON_OLD_VERSION', true],
  ['old request still in flight', f.inFlightOld, 'NOT_TRANSITIONED_YET', null, 'STILL_ON_OLD_VERSION', true],
  ['new version acknowledged but not used', f.acknowledgedNotUsed, 'NOT_TRANSITIONED_YET', null, 'NEW_VERSION_ACKNOWLEDGED_NOT_USED', true],
  ['failed reply', f.failedOld, 'FAILED_OR_UNKNOWN', 'FAILED', 'FAILED_REPLY', true],
  ['interrupted', f.interruptedOld, 'FAILED_OR_UNKNOWN', 'UNKNOWN', 'INTERRUPTED_BEFORE_TERMINAL_OUTCOME', true],
  ['unchanged new-version client', f.unchanged, 'UNCHANGED', null, 'UNCHANGED_NEW_VERSION_ONLY', false],
  ['unchanged busy new-version client', f.unchangedBusy, 'UNCHANGED', null, 'UNCHANGED_NEW_VERSION_ONLY', false],
  ['replayed new-version request', f.replayedV2Request, 'FAILED_OR_UNKNOWN', 'UNKNOWN', 'UNACKNOWLEDGED_NEW_VERSION_REQUEST', true],
  ['state without acknowledgment', f.stateWithoutAcknowledgment, 'FAILED_OR_UNKNOWN', 'UNKNOWN', 'STATE_BEFORE_ACKNOWLEDGMENT', true],
  ['stale cached acknowledgment', f.staleCachedAcknowledgment, 'FAILED_OR_UNKNOWN', 'UNKNOWN', 'STALE_ACKNOWLEDGMENT', true],
  ['duplicated acknowledgment', f.duplicatedAcknowledgment, 'FAILED_OR_UNKNOWN', 'UNKNOWN', 'DUPLICATE_ACK', true],
  ['acknowledgment before request', f.acknowledgmentBeforeRequest, 'FAILED_OR_UNKNOWN', 'UNKNOWN', 'ACK_BEFORE_REQUEST', true],
  ['non-monotonic time', f.nonMonotonicTime, 'FAILED_OR_UNKNOWN', 'UNKNOWN', 'NON_MONOTONIC_TIME', true],
  ['reordered sequence', f.reorderedSequence, 'FAILED_OR_UNKNOWN', 'UNKNOWN', 'OUT_OF_ORDER_SEQUENCE', true]
];
for (const [name, build, expectedClass, kind, code, eligible] of classification) {
  test(`each client is exactly one class recomputed from its actions: ${name}`, () => {
    const row = one(build('c-1'));
    assert.deepEqual([row.classification, row.failureKind, row.reasonCodes, row.eligible],
      [expectedClass, kind, [code], eligible]);
    assert.ok(evaluator.classes.includes(row.classification));
    assert.equal(row.reasonMeaning, evaluator.reasonCodes[code].meaning);
    assert.equal(row.countsInNumerator, expectedClass === 'ACTUAL_TRANSITION');
    assert.equal(row.countsInDenominator, eligible);
  });
}

test('an actual transition shows the required evidence order: old request, acknowledged new version, later request or state', () => {
  const stateEnded = one(f.transitioned('a'));
  assert.deepEqual(stateEnded.evidence, {
    requestAtOldVersion: { seq: 1, at: 10, action: 'REQUEST', version: '1.0.0', requestId: 'r1' },
    newVersionAcknowledged: { seq: 4, at: 24, action: 'ACK', version: '2.0.0', requestId: 'r2', deploymentStamp: 'C020-loopback-v2-r1', issuedAt: 22 },
    laterRequestOrState: { seq: 5, at: 30, action: 'STATE', version: '2.0.0' }
  });
  const requestEnded = one(f.transitionedWithHold('b'));
  assert.deepEqual(requestEnded.evidence.laterRequestOrState, { seq: 7, at: 70, action: 'REQUEST', version: '2.0.0' });
  assert.equal(requestEnded.evidence.newVersionAcknowledged.seq, 6);
  assert.equal(one(f.stillOld('c')).evidence, null);
  assert.equal(stateEnded.startVersion, '1.0.0');
  assert.equal(stateEnded.endVersion, '2.0.0');
  assert.equal(stateEnded.eligibility, 'STARTED_ON_OLD_VERSION');
});

test('transition evidence without any request at the old version is not a complete transition', () => {
  const missing = one(f.client('m-1', [f.state(1, 5, f.OLD), f.request(2, 10, 'r2', f.NEW), f.ack(3, 14, 'r2', f.V2, 12), f.state(4, 20, f.NEW)]));
  assert.deepEqual([missing.classification, missing.failureKind, missing.reasonCodes[0], missing.eligible, missing.startVersion, missing.countsInNumerator],
    ['FAILED_OR_UNKNOWN', 'UNKNOWN', 'OLD_VERSION_REQUEST_MISSING', true, '1.0.0', false]);
  const stateOnly = one(f.client('m-2', [f.state(1, 5, f.OLD)]));
  assert.deepEqual([stateOnly.classification, stateOnly.reasonCodes[0]], ['NOT_TRANSITIONED_YET', 'STILL_ON_OLD_VERSION']);
});

test('a new-version request alone, its acknowledgment alone or a state alone is not a complete transition', () => {
  assert.equal(one(f.acknowledgedNotUsed('a')).classification, 'NOT_TRANSITIONED_YET');
  assert.equal(one(f.replayedV2Request('b')).classification, 'FAILED_OR_UNKNOWN');
  const stateAfterOldAck = f.client('c', [f.request(1, 10, 'r1', f.OLD), f.ack(2, 14, 'r1', f.V1, 12), f.state(3, 20, f.OLD)]);
  assert.equal(one(stateAfterOldAck).classification, 'NOT_TRANSITIONED_YET');
});

test('the migration success rate counts only actual transitions over eligible clients and spells both out', () => {
  const report = run(f.baselineClients(), 'baseline');
  assert.equal(report.valid, true);
  assert.deepEqual(report.counts, {
    clients: 10, eligible: 8, notEligible: 2, actualTransition: 3, unchanged: 2, notTransitionedYet: 3,
    failedOrUnknown: 2, failed: 1, unknown: 1, duplicateCopiesCollapsed: 0
  });
  assert.deepEqual([report.successRate.numerator, report.successRate.denominator, report.successRate.fraction, report.successRate.percent],
    [3, 8, '3/8', '37.50%']);
  assert.match(report.successRate.statement, /^3 of 8 eligible clients made an actual acknowledged transition\./);
  assert.equal(report.counts.actualTransition + report.counts.unchanged + report.counts.notTransitionedYet + report.counts.failedOrUnknown, report.counts.clients);
  assert.equal(report.counts.failed + report.counts.unknown, report.counts.failedOrUnknown);
  assert.equal(report.counts.eligible, report.clients.filter((row) => row.eligible).length);
  assert.ok(report.clients.filter((row) => row.countsInNumerator).every((row) => row.eligible));
});

test('rounding is exact basis points and an empty or all-unchanged set is never 100 percent', () => {
  const percent = (transitions, others) => run([...Array.from({ length: transitions }, (_, index) => f.transitioned(`t-${index}`)),
    ...Array.from({ length: others }, (_, index) => f.stillOld(`o-${index}`))]).successRate.percent;
  assert.equal(percent(1, 2), '33.33%');
  assert.equal(percent(2, 1), '66.67%');
  assert.equal(percent(0, 3), '0.00%');
  assert.equal(percent(3, 0), '100.00%');
  for (const clients of [[], [f.unchanged('u-1'), f.unchangedBusy('u-2')]]) {
    const report = run(clients);
    assert.deepEqual([report.successRate.numerator, report.successRate.denominator, report.successRate.percent], [0, 0, null]);
    assert.equal(report.successRate.statement, 'No eligible client: there is no success rate. An empty set is never 100 percent.');
  }
});

test('qualifications are all false: no live Azure result, migration attestation, approval or reliability claim', () => {
  const report = run([f.transitioned('a')]);
  for (const name of ['liveAzureResult', 'productionRuntimeValidated', 'userJourneySuccess', 'actualClientMutation', 'migrationAttested',
    'approvalAdopted', 'reliabilityCertified']) assert.equal(report[name], false, name);
  assert.equal(report.trainingBanner, evaluator.banner);
  assert.equal(report.schema, 'C031-evaluation/1');
});

test('a flood of unchanged new-version clients adds nothing to the numerator or the eligible denominator', () => {
  const baseline = run(f.baselineClients());
  const flooded = run([...f.baselineClients(), ...f.floodClients(40)]);
  assert.deepEqual([flooded.successRate.numerator, flooded.successRate.denominator], [3, 8]);
  assert.equal(flooded.successRate.percent, baseline.successRate.percent);
  assert.equal(flooded.counts.unchanged, 42);
  assert.equal(flooded.counts.notEligible, 42);
  assert.equal(flooded.counts.failed, baseline.counts.failed);
  assert.equal(flooded.counts.unknown, baseline.counts.unknown);
  const naive = (report) => report.clients.filter((row) => row.events.some((event) => event.version === '2.0.0')).length / report.counts.clients;
  assert.ok(naive(flooded) > 0.9, 'A naive any-version-2-traffic count would report over 90 percent here.');
  assert.ok(naive(baseline) < naive(flooded));
});

test('a replayed new-version request or a state without an acknowledged version is not a transition and lowers the rate', () => {
  const baseline = run(f.baselineClients());
  const replayed = run([...f.baselineClients(), f.replayedV2Request('rp-1', 3000), f.stateWithoutAcknowledgment('rp-2', 3100)]);
  assert.equal(replayed.successRate.numerator, baseline.successRate.numerator);
  assert.equal(replayed.successRate.denominator, baseline.successRate.denominator + 2);
  assert.deepEqual([rowOf(replayed, 'rp-1').reasonCodes[0], rowOf(replayed, 'rp-2').reasonCodes[0]],
    ['UNACKNOWLEDGED_NEW_VERSION_REQUEST', 'STATE_BEFORE_ACKNOWLEDGMENT']);
  assert.equal(replayed.successRate.fraction, '3/10');
});

test('an exact duplicate trace is collapsed and counted once, never twice', () => {
  const baseline = run(f.baselineClients());
  const copy = JSON.parse(JSON.stringify(f.baselineClients()[0]));
  const reordered = { events: copy.events.map((event) => Object.fromEntries(Object.entries(event).reverse())), clientId: copy.clientId };
  const duplicated = run([...f.baselineClients(), copy, reordered]);
  assert.deepEqual(duplicated.successRate, baseline.successRate);
  const row = rowOf(duplicated, 'client-001');
  assert.equal(row.traceCopies, 3);
  assert.deepEqual(row.notes, ['DUPLICATE_TRACE_COLLAPSED']);
  assert.equal(row.classification, 'ACTUAL_TRANSITION');
  assert.equal(duplicated.counts.clients, baseline.counts.clients);
  assert.equal(duplicated.counts.duplicateCopiesCollapsed, 2);
});

test('conflicting traces for one client are unknown, eligible as unproven, and cannot launder a failure into a success', () => {
  const baseline = run(f.baselineClients());
  const conflicted = run([...f.baselineClients(), f.transitioned('client-004', 400)]);
  const row = rowOf(conflicted, 'client-004');
  assert.deepEqual([row.classification, row.failureKind, row.reasonCodes, row.traceCopies, row.eligibility, row.eligible],
    ['FAILED_OR_UNKNOWN', 'UNKNOWN', ['CONFLICTING_DUPLICATE_TRACES'], 2, 'START_VERSION_UNPROVEN_COUNTED_ELIGIBLE', true]);
  assert.equal(row.countsInNumerator, false);
  assert.equal(conflicted.successRate.numerator, baseline.successRate.numerator);
  assert.equal(conflicted.successRate.denominator, baseline.successRate.denominator);
  assert.equal(conflicted.counts.notTransitionedYet, baseline.counts.notTransitionedYet - 1);
  assert.equal(conflicted.counts.unknown, baseline.counts.unknown + 1);
});

test('identical malformed duplicates stay one unknown row with the collapse note', () => {
  const bad = { clientId: 'dup-bad', events: 'nope' };
  const report = run([bad, JSON.parse(JSON.stringify(bad))]);
  assert.equal(report.clients.length, 1);
  assert.deepEqual([report.clients[0].reasonCodes, report.clients[0].traceCopies, report.clients[0].notes],
    [['MALFORMED_TRACE'], 2, ['DUPLICATE_TRACE_COLLAPSED']]);
});

const ordering = [
  ['a gap in the saved sequence', [f.request(1, 10, 'r1', f.OLD), f.ack(3, 14, 'r1', f.V1, 12)], 'SEQUENCE_GAP', { eventIndex: 1, seq: 3 }],
  ['a first event that is not sequence 1', [f.request(2, 10, 'r1', f.OLD)], 'SEQUENCE_GAP', { eventIndex: 0, seq: 2 }],
  ['the same sequence number twice', [f.request(1, 10, 'r1', f.OLD), f.request(1, 11, 'r2', f.OLD)], 'DUPLICATE_EVENT', { eventIndex: 1, seq: 1 }],
  ['a sequence number that goes backwards', [f.request(1, 10, 'r1', f.OLD), f.ack(2, 14, 'r1', f.V1, 12), f.request(3, 20, 'r2', f.OLD),
    f.request(2, 21, 'r3', f.OLD)], 'OUT_OF_ORDER_SEQUENCE', { eventIndex: 3, seq: 2 }],
  ['an action after a failed terminal', [f.request(1, 10, 'r1', f.OLD), f.failedReply(2, 14, 'r1', 'UNKNOWN_PROFILE'), f.request(3, 20, 'r2', f.OLD)],
    'ACTION_AFTER_TERMINAL', { eventIndex: 2, seq: 3 }],
  ['an action after an interruption', [f.request(1, 10, 'r1', f.OLD), f.interrupted(2, 14, 'INTERRUPTED_BY_STOP'), f.hold(3, 20)],
    'ACTION_AFTER_TERMINAL', { eventIndex: 2, seq: 3 }],
  ['one request identifier sent twice', [f.request(1, 10, 'r1', f.OLD), f.request(2, 11, 'r1', f.OLD)], 'DUPLICATE_REQUEST_ID', { eventIndex: 1, seq: 2 }],
  ['a failed reply for an unknown request', [f.request(1, 10, 'r1', f.OLD), f.failedReply(2, 14, 'zz', 'UNKNOWN_PROFILE')], 'ACK_BEFORE_REQUEST', { eventIndex: 1, seq: 2 }],
  ['a failed reply for an acknowledged request', [f.request(1, 10, 'r1', f.OLD), f.ack(2, 14, 'r1', f.V1, 12), f.failedReply(3, 15, 'r1', 'UNKNOWN_PROFILE')],
    'DUPLICATE_ACK', { eventIndex: 2, seq: 3 }],
  ['an acknowledgment with another version than its request', [f.request(1, 10, 'r1', f.NEW), f.ack(2, 14, 'r1', f.V1, 12)], 'ACK_VERSION_MISMATCH', { eventIndex: 1, seq: 2 }],
  ['an acknowledgment with a stamp of the other version', [f.request(1, 10, 'r1', f.OLD),
    f.ack(2, 14, 'r1', { version: f.OLD, deploymentStamp: f.V2.deploymentStamp }, 12)], 'STAMP_MISMATCH', { eventIndex: 1, seq: 2 }],
  ['an acknowledgment issued after it was received', [f.request(1, 10, 'r1', f.OLD), f.ack(2, 14, 'r1', f.V1, 15)], 'ACK_ISSUED_AFTER_RECEIPT', { eventIndex: 1, seq: 2 }],
  ['old-version traffic after the new version was acknowledged', [...f.transitioned('x').events, f.request(6, 40, 'r9', f.OLD)],
    'VERSION_REGRESSION', { eventIndex: 5, seq: 6 }],
  ['an old-version acknowledgment after the new version was acknowledged', [f.request(1, 10, 'r1', f.OLD), f.request(2, 11, 'r7', f.OLD),
    f.ack(3, 14, 'r1', f.V1, 12), f.request(4, 20, 'r2', f.NEW), f.ack(5, 24, 'r2', f.V2, 22), f.ack(6, 30, 'r7', f.V1, 25)],
  'VERSION_REGRESSION', { eventIndex: 5, seq: 6 }],
  ['old-version state after the new version was acknowledged', [...f.transitioned('x').events, f.state(6, 40, f.OLD)],
    'VERSION_REGRESSION', { eventIndex: 5, seq: 6 }],
  ['a client that started on the new version asking the old one', [f.request(1, 10, 'r1', f.NEW), f.ack(2, 14, 'r1', f.V2, 12), f.request(3, 20, 'r2', f.OLD)],
    'VERSION_REGRESSION', { eventIndex: 2, seq: 3 }]
];
for (const [name, events, code, position] of ordering) {
  test(`the first violated ordering rule is reported with its position: ${name}`, () => {
    const row = one(f.client('o-1', events));
    assert.deepEqual([row.classification, row.failureKind, row.reasonCodes[0], row.position], ['FAILED_OR_UNKNOWN', 'UNKNOWN', code, position]);
    assert.equal(row.detail, `event ${position.eventIndex + 1} (seq ${position.seq})`);
    assert.equal(row.countsInNumerator, false);
  });
}

test('an acknowledged-then-held-back old request that is acknowledged after the new version is a regression too', () => {
  const row = one(f.client('o-2', [f.request(1, 10, 'r1', f.OLD), f.request(2, 11, 'r7', f.OLD), f.ack(3, 14, 'r1', f.V1, 12),
    f.request(4, 20, 'r2', f.NEW), f.ack(5, 24, 'r2', f.V2, 22), f.state(6, 26, f.NEW), f.ack(7, 30, 'r7', f.V1, 25)]));
  assert.equal(row.reasonCodes[0], 'VERSION_REGRESSION');
  assert.deepEqual(row.position, { eventIndex: 6, seq: 7 });
  assert.equal(row.countsInNumerator, false);
});

test('a client that started on the new version is outside the rate even when its trace is defective, but stays visible', () => {
  const defective = f.client('new-bad', [f.request(1, 10, 'r1', f.NEW), f.ack(2, 14, 'r1', f.V2, 12), f.ack(3, 15, 'r1', f.V2, 12)]);
  const report = run([...f.baselineClients(), defective]);
  const row = rowOf(report, 'new-bad');
  assert.deepEqual([row.classification, row.reasonCodes[0], row.eligible, row.eligibility, row.countsInDenominator],
    ['FAILED_OR_UNKNOWN', 'DUPLICATE_ACK', false, 'STARTED_ON_NEW_VERSION_NOT_ELIGIBLE', false]);
  assert.equal(report.successRate.denominator, 8);
  assert.equal(report.counts.unknown, 2);
  assert.equal(report.counts.notEligible, 3);
});

test('failed and interrupted terminals of clients that started on the new version stay visible but are not eligible', () => {
  const failed = f.client('n-failed', [f.request(1, 10, 'r1', f.NEW), f.failedReply(2, 14, 'r1', 'UNKNOWN_PROFILE')]);
  const stopped = f.client('n-stopped', [f.request(1, 10, 'r1', f.NEW), f.ack(2, 14, 'r1', f.V2, 12), f.interrupted(3, 20, 'INTERRUPTED_BY_STOP')]);
  const report = run([failed, stopped, f.transitioned('t-1')]);
  assert.deepEqual([rowOf(report, 'n-failed').failureKind, rowOf(report, 'n-failed').eligible], ['FAILED', false]);
  assert.deepEqual([rowOf(report, 'n-stopped').failureKind, rowOf(report, 'n-stopped').eligible], ['UNKNOWN', false]);
  assert.deepEqual([report.counts.failed, report.counts.unknown, report.successRate.fraction], [1, 1, '1/1']);
});

test('an unproven start version is counted as eligible, never excluded from the denominator', () => {
  const noVersion = f.client('p-none', [f.hold(1, 5), f.interrupted(2, 9, 'INTERRUPTED_BY_STOP')]);
  const empty = f.client('p-empty', []);
  const report = run([f.transitioned('t-1'), noVersion, empty, { clientId: 'p-bad', events: 7 }]);
  assert.deepEqual([rowOf(report, 'p-none').reasonCodes[0], rowOf(report, 'p-none').detail], ['NO_VERSION_OBSERVED', 'INTERRUPTED_BY_STOP']);
  assert.equal(rowOf(report, 'p-empty').reasonCodes[0], 'NO_EVENTS');
  assert.equal(rowOf(report, 'p-bad').reasonCodes[0], 'MALFORMED_TRACE');
  for (const id of ['p-none', 'p-empty', 'p-bad']) {
    assert.deepEqual([rowOf(report, id).eligible, rowOf(report, id).eligibility, rowOf(report, id).startVersion],
      [true, 'START_VERSION_UNPROVEN_COUNTED_ELIGIBLE', null]);
  }
  assert.deepEqual([report.successRate.numerator, report.successRate.denominator], [1, 4]);
});

test('a terminal event after complete transition evidence is kept as a note and the evidence stands', () => {
  const stopped = f.client('t-stop', [...f.transitioned('x').events, f.interrupted(6, 40, 'INTERRUPTED_BY_RESET')]);
  const failed = f.client('t-fail', [...f.transitioned('x').events, f.request(6, 40, 'r3', f.NEW), f.failedReply(7, 44, 'r3', 'UNKNOWN_PROFILE')]);
  for (const client of [stopped, failed]) {
    const row = one(client);
    assert.deepEqual([row.classification, row.notes], ['ACTUAL_TRANSITION', ['TERMINAL_AFTER_TRANSITION_EVIDENCE']]);
    assert.ok(row.terminal);
  }
});

test('an acknowledged new version that is never used and then fails or is interrupted is failed or unknown, not not-yet', () => {
  const base = f.acknowledgedNotUsed('x').events;
  const interrupted = one(f.client('a-int', [...base, f.interrupted(5, 30, 'INTERRUPTED_BY_STOP')]));
  const failed = one(f.client('a-fail', [f.request(1, 10, 'r1', f.OLD), f.request(2, 11, 'r9', f.OLD), f.ack(3, 14, 'r1', f.V1, 12),
    f.request(4, 20, 'r2', f.NEW), f.ack(5, 24, 'r2', f.V2, 22), f.failedReply(6, 30, 'r9', 'UNKNOWN_PROFILE')]));
  assert.deepEqual([interrupted.failureKind, interrupted.reasonCodes[0]], ['UNKNOWN', 'INTERRUPTED_BEFORE_TERMINAL_OUTCOME']);
  assert.deepEqual([failed.failureKind, failed.reasonCodes[0], failed.detail], ['FAILED', 'FAILED_REPLY', 'UNKNOWN_PROFILE']);
});

test('a failed new-version request is a failure, and an unacknowledged one that is then interrupted stays unacknowledged', () => {
  const failedNew = one(f.client('u-fail', [f.request(1, 10, 'r1', f.OLD), f.ack(2, 14, 'r1', f.V1, 12),
    f.request(3, 20, 'r2', f.NEW), f.failedReply(4, 24, 'r2', 'UNKNOWN_PROFILE')]));
  assert.deepEqual([failedNew.failureKind, failedNew.reasonCodes[0]], ['FAILED', 'FAILED_REPLY']);
  const unacknowledged = one(f.client('u-int', [f.request(1, 10, 'r1', f.OLD), f.request(2, 12, 'r2', f.NEW), f.interrupted(3, 20, 'INTERRUPTED_BY_STOP')]));
  assert.deepEqual([unacknowledged.failureKind, unacknowledged.reasonCodes[0]], ['UNKNOWN', 'UNACKNOWLEDGED_NEW_VERSION_REQUEST']);
});

test('a held client keeps its hold visible only while it is held', () => {
  const held = one(f.client('h-1', [f.request(1, 10, 'r1', f.OLD), f.ack(2, 14, 'r1', f.V1, 12), f.hold(3, 15)]));
  assert.deepEqual([held.classification, held.notes], ['NOT_TRANSITIONED_YET', ['HELD_AT_BOUNDARY']]);
  const resumed = one(f.client('h-2', [f.request(1, 10, 'r1', f.OLD), f.ack(2, 14, 'r1', f.V1, 12), f.hold(3, 15), f.resume(4, 20)]));
  assert.deepEqual([resumed.classification, resumed.notes], ['NOT_TRANSITIONED_YET', []]);
});

test('annotations are copied for display and never change the class; a saved budget miss is only noted on a transition', () => {
  const noted = { ...f.transitioned('a-1'), annotations: { originalBudgetExceeded: true } };
  const clean = { ...f.transitioned('a-2'), annotations: { originalBudgetExceeded: false } };
  const unknown = { ...f.transitioned('a-3'), annotations: { originalBudgetExceeded: null } };
  const stillOld = { ...f.stillOld('a-4'), annotations: { originalBudgetExceeded: true } };
  const report = run([noted, clean, unknown, stillOld]);
  assert.deepEqual(rowOf(report, 'a-1').notes, ['ORIGINAL_BUDGET_EXCEEDED_SEPARATE_VERDICT']);
  assert.deepEqual([rowOf(report, 'a-2').notes, rowOf(report, 'a-3').notes, rowOf(report, 'a-4').notes], [[], [], []]);
  assert.deepEqual(rowOf(report, 'a-1').annotations, { originalBudgetExceeded: true });
  assert.equal(report.successRate.fraction, '3/4');
});

test('a null issue time is rejected from caller data so a stale acknowledgment cannot dodge the check', () => {
  const dodging = f.client('d-1', [f.request(1, 10, 'r1', f.OLD), f.ack(2, 14, 'r1', f.V1, null)]);
  const row = one(dodging);
  assert.deepEqual([row.reasonCodes[0], row.detail], ['MALFORMED_TRACE', 'events[1].issuedAt']);
});

const malformed = [
  ['a trace that is not an object', 42, 'trace'],
  ['a trace that is an array', [], 'trace'],
  ['a trace with a claimed verdict', { ...f.transitioned('m-1'), classification: 'ACTUAL_TRANSITION' }, 'trace keys'],
  ['a trace with a claimed eligibility', { ...f.stillOld('m-1'), eligible: false }, 'trace keys'],
  ['a trace without events', { clientId: 'm-1' }, 'trace keys'],
  ['a trace without a client id', { events: [] }, 'trace keys'],
  ['a trace with an invalid client id', { clientId: '../x', events: [] }, 'clientId'],
  ['a trace with a numeric client id', { clientId: 7, events: [] }, 'clientId'],
  ['events that are not an array', { clientId: 'm-1', events: {} }, 'events'],
  ['too many events', { clientId: 'm-1', events: Array.from({ length: 65 }, (_, index) => f.hold(index + 1, index)) }, 'events'],
  ['an event that is not an object', { clientId: 'm-1', events: [3] }, 'events[0]'],
  ['an unknown action', { clientId: 'm-1', events: [{ seq: 1, at: 1, action: 'TELEPORT' }] }, 'events[0]'],
  ['an inherited action name', { clientId: 'm-1', events: [{ seq: 1, at: 1, action: 'constructor' }] }, 'events[0]'],
  ['an event with an extra field', { clientId: 'm-1', events: [{ seq: 1, at: 1, action: 'HOLD', verdict: 'PASS' }] }, 'events[0] keys'],
  ['an event with a missing field', { clientId: 'm-1', events: [{ seq: 1, at: 1, action: 'REQUEST', version: f.OLD }] }, 'events[0] keys'],
  ['a zero sequence', { clientId: 'm-1', events: [{ seq: 0, at: 1, action: 'HOLD' }] }, 'events[0].seq'],
  ['a fractional sequence', { clientId: 'm-1', events: [{ seq: 1.5, at: 1, action: 'HOLD' }] }, 'events[0].seq'],
  ['a text sequence', { clientId: 'm-1', events: [{ seq: '1', at: 1, action: 'HOLD' }] }, 'events[0].seq'],
  ['a negative time', { clientId: 'm-1', events: [{ seq: 1, at: -1, action: 'HOLD' }] }, 'events[0].at'],
  ['a time beyond one day', { clientId: 'm-1', events: [{ seq: 1, at: 86400001, action: 'HOLD' }] }, 'events[0].at'],
  ['a text time', { clientId: 'm-1', events: [{ seq: 1, at: '1', action: 'HOLD' }] }, 'events[0].at'],
  ['a request identifier that starts with a slash', { clientId: 'm-1', events: [f.request(1, 1, '/x', f.OLD)] }, 'events[0].requestId'],
  ['an unknown version', { clientId: 'm-1', events: [f.request(1, 1, 'r1', '3.0.0')] }, 'events[0].version'],
  ['an empty deployment stamp', { clientId: 'm-1', events: [f.request(1, 1, 'r1', f.OLD), f.ack(2, 2, 'r1', { version: f.OLD, deploymentStamp: '' }, 1)] }, 'events[1].deploymentStamp'],
  ['a text issue time', { clientId: 'm-1', events: [f.request(1, 1, 'r1', f.OLD), f.ack(2, 2, 'r1', f.V1, '1')] }, 'events[1].issuedAt'],
  ['a lowercase reply code', { clientId: 'm-1', events: [f.request(1, 1, 'r1', f.OLD), f.failedReply(2, 2, 'r1', 'not found')] }, 'events[1].replyCode'],
  ['a lowercase interruption cause', { clientId: 'm-1', events: [f.interrupted(1, 1, 'stop')] }, 'events[0].cause'],
  ['an empty annotations object', { ...f.stillOld('m-1'), annotations: {} }, 'annotations'],
  ['an annotation with a text value', { ...f.stillOld('m-1'), annotations: { originalBudgetExceeded: 'yes' } }, 'annotations'],
  ['annotations that are an array', { ...f.stillOld('m-1'), annotations: [] }, 'annotations']
];
for (const [name, trace, detail] of malformed) {
  test(`the closed trace schema rejects ${name} without adopting anything`, () => {
    const report = run([f.transitioned('t-1'), trace]);
    const row = report.clients[1];
    assert.deepEqual([row.classification, row.failureKind, row.reasonCodes, row.detail, row.eligible, row.startVersion],
      ['FAILED_OR_UNKNOWN', 'UNKNOWN', ['MALFORMED_TRACE'], detail, true, null]);
    assert.deepEqual([row.events, row.eventCount, row.countsInNumerator], [[], 0, false]);
    assert.deepEqual([report.successRate.numerator, report.successRate.denominator], [1, 2]);
  });
}

test('a malformed client id is shown under a neutral name and never merged with another client', () => {
  const report = run([{ clientId: '../a', events: [] }, { clientId: '../b', events: [] }, { events: [] }]);
  assert.deepEqual(report.clients.map((row) => row.clientId), ['invalid-client-1', 'invalid-client-2', 'invalid-client-3']);
});

test('a malformed set is rejected with a code, no numerator and no percentage', () => {
  const cases = [
    [null, 'FLEET_SCHEMA'], [5, 'FLEET_SCHEMA'], [[], 'FLEET_SCHEMA'], [{}, 'FLEET_SCHEMA'],
    [{ schema: 'C031-fleet/1', id: 'x' }, 'FLEET_SCHEMA'],
    [{ schema: 'C031-fleet/1', id: 'x', clients: [], extra: 1 }, 'FLEET_SCHEMA'],
    [{ schema: 'C031-fleet/2', id: 'x', clients: [] }, 'FLEET_SCHEMA'],
    [{ schema: 'C031-fleet/1', id: '../x', clients: [] }, 'FLEET_SCHEMA'],
    [{ schema: 'C031-fleet/1', id: 'x', clients: {} }, 'FLEET_SCHEMA'],
    [{ schema: 'C031-fleet/1', id: 'x', clients: Array.from({ length: 4097 }, () => 0) }, 'DENSE_BOUNDED_ARRAY']
  ];
  for (const [input, code] of cases) {
    const report = evaluator.evaluateFleet(input);
    assert.deepEqual([report.valid, report.code, report.clients.length, report.successRate.numerator, report.successRate.denominator,
      report.successRate.percent, report.counts.clients, report.fleetId], [false, code, 0, 0, 0, null, 0, null], JSON.stringify(input)?.slice(0, 40));
  }
  const tooMany = evaluator.evaluateFleet({ schema: 'C031-fleet/1', id: 'x', clients: Array.from({ length: 513 }, (_, index) => ({ clientId: `c-${index}`, events: [] })) });
  assert.equal(tooMany.code, 'FLEET_SCHEMA');
  assert.equal(evaluator.evaluateFleet().code, 'NO_EVALUATION_OVERRIDES');
  assert.equal(evaluator.evaluateFleet(f.fleet('x', []), { issueTimeSaved: false }).code, 'NO_EVALUATION_OVERRIDES');
});

test('caller data cannot smuggle accessors, symbols, odd prototypes, non-finite numbers, depth or size', () => {
  const getter = f.fleet('g', []);
  Object.defineProperty(getter, 'clients', { enumerable: true, get() { return []; } });
  const hidden = f.fleet('h', []);
  Object.defineProperty(hidden, 'extra', { enumerable: false, value: 1 });
  const symbol = f.fleet('s', []);
  symbol[Symbol('x')] = 1;
  const sparse = f.fleet('p', [1, 2]);
  delete sparse.clients[0];
  const extraOnArray = f.fleet('e', [f.stillOld('a')]);
  extraOnArray.clients.note = 'x';
  const holeWithExtra = f.fleet('o', [1, 2]);
  delete holeWithExtra.clients[1];
  holeWithExtra.clients.note = 'x';
  class Instance { constructor() { this.schema = 'C031-fleet/1'; } }
  const arrayProto = f.fleet('a', []);
  Object.setPrototypeOf(arrayProto.clients, null);
  const circular = f.fleet('c', []);
  circular.clients.push(circular);
  const deep = { a: { a: { a: { a: { a: { a: { a: { a: { a: { a: { a: { a: { a: 1 } } } } } } } } } } } } };
  const polluted = JSON.parse('{"schema":"C031-fleet/1","id":"x","clients":[],"__proto__":{"x":1}}');
  const wide = Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`k${index}`, 1]));
  const many = Array.from({ length: 4000 }, () => ({ clientId: 'ab', events: Array.from({ length: 60 }, () => 1) }));
  const cases = [
    [getter, 'OWN_DATA_FIELDS'], [hidden, 'OWN_DATA_FIELDS'], [symbol, 'OWN_DATA_FIELDS'], [sparse, 'DENSE_BOUNDED_ARRAY'],
    [extraOnArray, 'DENSE_BOUNDED_ARRAY'], [holeWithExtra, 'DENSE_BOUNDED_ARRAY'], [new Instance(), 'OWN_DATA_PROTOTYPE'],
    [arrayProto, 'OWN_DATA_PROTOTYPE'], [circular, 'FINITE_OWN_JSON_REQUIRED'], [f.fleet('n', [{ at: NaN }]), 'FINITE_OWN_JSON_REQUIRED'],
    [f.fleet('i', [{ at: Infinity }]), 'FINITE_OWN_JSON_REQUIRED'], [f.fleet('z', [{ at: -0 }]), 'FINITE_OWN_JSON_REQUIRED'],
    [f.fleet('b', [{ at: 2 ** 60 }]), 'FINITE_OWN_JSON_REQUIRED'], [f.fleet('u', [{ at: undefined }]), 'FINITE_OWN_JSON_REQUIRED'],
    [f.fleet('f', [{ at: () => 1 }]), 'FINITE_OWN_JSON_REQUIRED'], [f.fleet('d', [deep]), 'BOUNDED_JSON_REQUIRED'],
    [f.fleet('l', [{ clientId: 'x'.repeat(513), events: [] }]), 'BOUNDED_JSON_REQUIRED'], [polluted, 'OWN_DATA_FIELDS'],
    [f.fleet('w', [wide]), 'OWN_DATA_FIELDS'], [f.fleet('m', many), 'BOUNDED_JSON_REQUIRED']
  ];
  for (const [input, code] of cases) assert.equal(evaluator.evaluateFleet(input).code, code, code);
  const nullPrototype = Object.assign(Object.create(null), f.fleet('np', [f.transitioned('a')]));
  assert.equal(evaluator.evaluateFleet(nullPrototype).valid, true);
});

test('the report is deeply frozen and independent of later changes to the caller data', () => {
  const input = f.fleet('freeze', [f.transitioned('a')]);
  const report = evaluator.evaluateFleet(input);
  input.clients[0].events[0].version = f.NEW;
  input.clients.push(f.stillOld('late'));
  assert.equal(report.clients.length, 1);
  assert.equal(report.clients[0].events[0].version, '1.0.0');
  assert.ok(Object.isFrozen(report) && Object.isFrozen(report.clients[0]) && Object.isFrozen(report.clients[0].events[0]));
  assert.throws(() => { report.successRate.numerator = 99; }, TypeError);
});

test('every reason code a row can carry is in the closed catalog with a kind and a meaning', () => {
  const codes = Object.keys(evaluator.reasonCodes);
  assert.ok(codes.length >= 30);
  for (const code of codes) {
    assert.ok(['OK', 'FAILED', 'UNKNOWN', 'INFO'].includes(evaluator.reasonCodes[code].kind), code);
    assert.ok(evaluator.reasonCodes[code].meaning.length > 20, code);
  }
  const produced = new Set();
  const fleets = f.savedFleets().map((item) => item.fleet.clients).flat();
  for (const client of [...fleets, ...ordering.map(([, events]) => f.client('o-x', events)), ...malformed.map(([, trace]) => trace),
    f.client('e', []), f.client('v', [f.hold(1, 1)])]) {
    const row = run([client]).clients[0];
    row.reasonCodes.forEach((code) => produced.add(code));
    row.notes.forEach((code) => produced.add(code));
  }
  for (const code of produced) assert.ok(codes.includes(code), `${code} is not in the catalog`);
  assert.ok(Object.values(evaluator.reasonCodes).filter((entry) => entry.kind === 'FAILED').length === 1);
});

test('the UMD wrapper defines the browser global once and is not writable', () => {
  const file = path.join(__dirname, '..', 'evaluator.js');
  const sandbox = { globalThis: null };
  sandbox.globalThis = sandbox;
  const script = new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
  vm.createContext(sandbox);
  script.runInContext(sandbox);
  assert.equal(typeof sandbox.C031Evaluator.evaluateFleet, 'function');
  // Data must be created in the same realm: the own-data check refuses a foreign Object.prototype.
  const inside = vm.runInContext(`(${JSON.stringify(f.fleet('b', [f.transitioned('a')]))})`, sandbox);
  assert.equal(sandbox.C031Evaluator.evaluateFleet(inside).successRate.fraction, '1/1');
  assert.equal(sandbox.C031Evaluator.evaluateFleet(f.fleet('b', [f.transitioned('a')])).code, 'OWN_DATA_PROTOTYPE');
  assert.equal(Object.getOwnPropertyDescriptor(sandbox, 'C031Evaluator').writable, false);
});
