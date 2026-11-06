'use strict';

// RED for C040: behavioral assertions about the specified table rules, run against the loadable naive stub
// (./tables.stub.cjs). After GREEN the SAME file runs byte-for-byte unchanged against the real tables.js through
// tests\green-shim.cjs; every input below is a valid producer-shaped fictional report, so a failure is never a bad input.
const test = require('node:test');
const assert = require('node:assert/strict');
const subject = require('./tables.stub.cjs');

const shapes = {
  transition: ['ACTUAL_TRANSITION', null, 'TRANSITION_EVIDENCE_COMPLETE', true, '1.0.0', '2.0.0'],
  unchanged: ['UNCHANGED', null, 'UNCHANGED_NEW_VERSION_ONLY', false, '2.0.0', '2.0.0'],
  notYet: ['NOT_TRANSITIONED_YET', null, 'STILL_ON_OLD_VERSION', true, '1.0.0', '1.0.0'],
  failed: ['FAILED_OR_UNKNOWN', 'FAILED', 'FAILED_REPLY', true, '1.0.0', '1.0.0'],
  unknown: ['FAILED_OR_UNKNOWN', 'UNKNOWN', 'INTERRUPTED_BEFORE_TERMINAL_OUTCOME', true, '1.0.0', '1.0.0']
};
const clientRow = (clientId, kind) => {
  const [classification, failureKind, code, eligible, startVersion, endVersion] = shapes[kind];
  return { clientId, classification, failureKind, reasonCodes: [code], reasonMeaning: `${code} (fictional meaning)`, detail: null, position: null,
    startVersion, endVersion, eligible, eligibility: eligible ? 'STARTED_ON_OLD_VERSION' : 'STARTED_ON_NEW_VERSION_NOT_ELIGIBLE',
    countsInNumerator: classification === 'ACTUAL_TRANSITION', countsInDenominator: eligible, traceCopies: 1, notes: [] };
};
// The fictional "producer" states its own counts from the full list; a test may then shorten, repeat or edit rows.
function cohortReport(kinds) {
  const clients = kinds.map((kind, index) => clientRow(`client-${String(index + 1).padStart(3, '0')}`, kind));
  const count = (predicate) => clients.filter(predicate).length;
  const eligible = count((row) => row.eligible);
  const actualTransition = count((row) => row.classification === 'ACTUAL_TRANSITION');
  return { schema: 'C031-evaluation/1', cardId: 'C031', valid: true, code: null, fleetId: 'red-fleet', clients,
    counts: { clients: clients.length, eligible, notEligible: clients.length - eligible, actualTransition,
      unchanged: count((row) => row.classification === 'UNCHANGED'), notTransitionedYet: count((row) => row.classification === 'NOT_TRANSITIONED_YET'),
      failedOrUnknown: count((row) => row.classification === 'FAILED_OR_UNKNOWN'), failed: count((row) => row.failureKind === 'FAILED'),
      unknown: count((row) => row.failureKind === 'UNKNOWN'), duplicateCopiesCollapsed: 0 },
    successRate: { numerator: actualTransition, denominator: eligible, fraction: `${actualTransition}/${eligible}`,
      percent: eligible ? `${((actualTransition * 100) / eligible).toFixed(2)}%` : null } };
}
const repeat = (kind, count) => Array.from({ length: count }, () => kind);
const forty = cohortReport([...repeat('transition', 40), ...repeat('failed', 3), ...repeat('unknown', 2)]);
const attentionIds = ['client-041', 'client-042', 'client-043', 'client-044', 'client-045'];
const idsOf = (view) => view.rows.map((row) => row.id);
const sum = (counts) => Object.values(counts).reduce((total, value) => total + value, 0);

test('3 failed and 2 unknown rows among 40 successes stay visible under every sort and under the status filter success', () => {
  const table = subject.fromCohort(forty);
  assert.equal(table.rows.length, 45);
  for (const column of table.columns) {
    for (const direction of ['asc', 'desc']) {
      const view = subject.view(table, { sort: { column: column.key, direction } });
      assert.equal(view.rows.length, 45, `${column.key} ${direction}`);
      for (const id of attentionIds) assert.ok(idsOf(view).includes(id), `${id} under sort ${column.key} ${direction}`);
    }
  }
  const success = subject.view(table, { filter: 'success' });
  for (const id of attentionIds) assert.ok(idsOf(success).includes(id), `${id} under the filter success`);
  assert.equal(success.keptVisible.count, 5);
  assert.deepEqual(success.rows.filter((row) => row.attention).map((row) => row.status).sort(), ['FAILED', 'FAILED', 'FAILED', 'UNKNOWN', 'UNKNOWN']);
  for (const query of [{ search: 'client-001' }, { search: 'nothing matches this' }, { pageSize: 10, page: 1 }, { pageSize: 10, page: 4 }]) {
    const view = subject.view(table, query);
    for (const id of attentionIds) assert.ok(idsOf(view).includes(id), `${id} under ${JSON.stringify(query)}`);
  }
});

test('the summary says shown of total, gives every status count including zeros, and the counts add up to the total', () => {
  const view = subject.view(subject.fromCohort(forty));
  assert.deepEqual(view.statusCounts, { ACTUAL_TRANSITION: 40, UNCHANGED: 0, NOT_TRANSITIONED_YET: 0, FAILED: 3, UNKNOWN: 2, NOT_SAVED: 0 });
  assert.equal(sum(view.statusCounts), view.total);
  assert.equal(view.total, 45);
  assert.equal(view.shown, 45);
  assert.match(view.summary, /showing 45 of 45 rows/);
  for (const text of ['ACTUAL_TRANSITION 40', 'UNCHANGED 0', 'NOT_TRANSITIONED_YET 0', 'FAILED 3', 'UNKNOWN 2']) assert.ok(view.summary.includes(text), text);
  const filtered = subject.view(subject.fromCohort(forty), { filter: 'success' });
  assert.equal(sum(filtered.statusCounts), filtered.total, 'the counts describe the whole table, not the filtered view');
});

test('a filter that hides rows says how many and which statuses, and one that would hide failures says so and how to show everything', () => {
  const mixed = subject.fromCohort(cohortReport(['transition', 'transition', ...repeat('unchanged', 3), ...repeat('notYet', 4), 'failed', 'failed', 'unknown']));
  const view = subject.view(mixed, { filter: 'success' });
  assert.equal(view.total, 12);
  assert.equal(view.shown, 5);
  assert.equal(view.hidden.count, 7);
  assert.deepEqual(view.hidden.statuses, { UNCHANGED: 3, NOT_TRANSITIONED_YET: 4 });
  assert.match(view.filterNote, /hides 7 rows/);
  assert.match(view.filterNote, /UNCHANGED 3/);
  assert.match(view.filterNote, /NOT_TRANSITIONED_YET 4/);
  assert.match(view.filterNote, /2 FAILED/);
  assert.match(view.filterNote, /1 UNKNOWN/);
  assert.match(view.filterNote, /All statuses/);
  const everything = subject.view(mixed);
  assert.equal(everything.shown, 12, 'success only is not the default view');
  assert.equal(everything.filterNote, '');
  const kept = subject.view(subject.fromCohort(forty), { filter: 'success' });
  assert.match(kept.filterNote, /3 FAILED/);
  assert.match(kept.filterNote, /2 UNKNOWN/);
  assert.match(kept.filterNote, /All statuses/);
});

test('an unrecognised producer status is kept and shown as UNKNOWN with the producer text, never skipped and never a success', () => {
  const report = cohortReport(['transition', 'transition', 'transition', 'failed']);
  report.clients[2] = { ...report.clients[2], classification: 'PARTIALLY_MIGRATED' };
  const view = subject.view(subject.fromCohort(report));
  assert.equal(view.rows.length, 4);
  const row = view.rows.find((item) => item.id === 'client-003');
  assert.ok(row, 'the row must not be skipped');
  assert.equal(row.status, 'UNKNOWN');
  assert.equal(row.kind, 'unknown');
  assert.equal(row.attention, true);
  assert.equal(row.producerStatus, 'PARTIALLY_MIGRATED');
  assert.ok(row.flags.includes('UNRECOGNISED_STATUS'));
  assert.equal(view.statusCounts.UNKNOWN, 1);
  assert.equal(view.statusCounts.ACTUAL_TRANSITION, 2);
});

test('an empty saved set says no attempts recorded, never all passed and never 100 percent', () => {
  const table = subject.fromCohort(cohortReport([]));
  const view = subject.view(table);
  assert.equal(table.state, 'EMPTY');
  assert.equal(view.shown, 0);
  assert.equal(view.total, 0);
  assert.match(view.summary, /no attempts recorded/i);
  assert.doesNotMatch(view.summary, /all passed|100/i);
  assert.equal(sum(view.statusCounts), 0);
});

test('a truncated saved set says INCOMPLETE, keeps the producer total and counts the missing rows as NOT_SAVED', () => {
  const full = cohortReport(['transition', 'failed', 'unknown', 'transition', 'notYet', 'transition', 'failed', 'unchanged', 'unknown', 'transition']);
  const truncated = { ...full, clients: full.clients.slice(0, 6) };
  const table = subject.fromCohort(truncated);
  const view = subject.view(table);
  assert.equal(table.state, 'INCOMPLETE');
  assert.equal(view.shown, 6);
  assert.equal(view.total, 10);
  assert.equal(view.statusCounts.NOT_SAVED, 4);
  assert.equal(sum(view.statusCounts), 10);
  assert.match(view.summary, /INCOMPLETE/);
  assert.match(view.summary, /showing 6 of 10 rows/);
});

test('a duplicated row is kept and flagged, never silently de-duplicated', () => {
  const full = cohortReport(['transition', 'failed', 'unknown', 'notYet']);
  const duplicated = { ...full, clients: [...full.clients, full.clients[1]] };
  const view = subject.view(subject.fromCohort(duplicated));
  const copies = view.rows.filter((row) => row.id === 'client-002');
  assert.equal(copies.length, 2);
  for (const copy of copies) assert.ok(copy.flags.includes('DUPLICATE_ROW'));
  assert.equal(view.shown, 5);
  assert.equal(view.statusCounts.FAILED, 2);
});

const keys = ['profile-audit', 'preference-audit', 'completion-receipt'].map((kind) => `job-red|profile-effects/1|synthetic-002|${kind}`);
const effect = (index, status, lower, upper, deliveries) => ({ index, effectKey: keys[index], kind: keys[index].split('|')[3],
  intendedApplications: 1, confirmedApplicationsLowerBound: lower, confirmedApplicationsUpperBound: upper, deliveryAttempts: deliveries,
  status, applicationIds: [], deliveryIds: [] });
const original = (originalId, verdict, effects) => ({ originalId, verdict, includedInDenominator: true, reasonCodes: [], effects,
  effectCounts: { intendedEffects: effects.length, confirmedApplications: effects.reduce((total, item) => total + item.confirmedApplicationsLowerBound, 0),
    deliveryAttempts: effects.reduce((total, item) => total + item.deliveryAttempts, 0) } });
const detection = (sourceId, originals, counts) => ({ schema: 'C030-detection/1', cardId: 'C030', valid: true, code: null, sourceId,
  decision: 'FAIL', counts, successFraction: { numerator: counts.pass, denominator: counts.originals }, originals });

test('the effect table keeps the complete key, the bounds, the delivery count and the verdict, and an original without effect rows stays visible', () => {
  const retry = detection('red-absence-retry', [
    original('original-001', 'FAIL', [effect(0, 'ONE_APPLICATION', 1, 1, 1), effect(1, 'ONE_APPLICATION', 1, 1, 1), effect(2, 'CONFIRMED_ABSENCE', 0, 0, 1)]),
    original('original-002', 'PASS', [effect(0, 'ONE_APPLICATION', 1, 1, 1), effect(1, 'ONE_APPLICATION', 1, 1, 1), effect(2, 'ONE_APPLICATION', 1, 1, 2)])
  ], { originals: 2, pass: 1, fail: 1, unknown: 0, unsupported: 0 });
  const view = subject.view(subject.fromEffects(retry), { filter: 'success' });
  assert.equal(view.total, 6);
  assert.deepEqual(view.rows.map((row) => row.status), ['ONE_INTENDED_EFFECT', 'ONE_INTENDED_EFFECT', 'MISSING',
    'ONE_INTENDED_EFFECT', 'ONE_INTENDED_EFFECT', 'ONE_INTENDED_EFFECT']);
  const missing = view.rows[2];
  assert.equal(missing.text.effectKey, keys[2], 'the complete effect key, not a shortened one');
  assert.deepEqual([missing.values.lower, missing.values.upper, missing.values.deliveries], [0, 0, 1]);
  assert.equal(missing.attention, true, 'the first original stays failed although the retry succeeded');
  const history = detection('red-history', [0, 1].map((index) => ({ ...original(`synthetic-C033-attempt-${index + 1}`, 'UNKNOWN', []),
    reasonCodes: ['NO_ACTUAL_EFFECT_RECEIPTS_OR_ASSOCIATION'], effectCounts: { intendedEffects: null, confirmedApplications: null, deliveryAttempts: null } })),
  { originals: 2, pass: 0, fail: 0, unknown: 2, unsupported: 0 });
  const unobserved = subject.view(subject.fromEffects(history));
  assert.equal(unobserved.rows.length, 2, 'an original with no effect rows is one UNKNOWN row, not zero rows');
  for (const row of unobserved.rows) {
    assert.equal(row.status, 'UNKNOWN');
    assert.ok(row.flags.includes('NO_EFFECT_ROWS_SAVED'));
  }
  assert.equal(unobserved.statusCounts.UNKNOWN, 2);
});

const journey = (attemptId, verdict, latencyVerdict, stateVerdict, budgetMs, elapsedMs, reasonCodes = []) => ({ attemptId, verdict, latencyVerdict,
  stateVerdict, terminalVerdict: elapsedMs === null ? 'UNKNOWN' : 'KNOWN', budgetMs, elapsedMs, includedInDenominator: true, summaryOnly: false, reasonCodes });

test('the latency table keeps budget, observed value, verdict and the retry flag, and a later retry cannot hide the exceeded original', () => {
  const report = { schema: 'C029-evaluation/1', cardId: 'C029', valid: true, code: null, savedId: 'red-latency', decision: 'FAIL',
    counts: { originals: 5, pass: 2, fail: 2, unknown: 1 }, successFraction: { numerator: 2, denominator: 5 },
    originals: [journey('synthetic-C033-attempt-1', 'PASS', 'PASS', 'PASS', 1000, 0.25),
      journey('synthetic-C033-attempt-2', 'FAIL', 'FAIL', 'PASS', 1000, 1000.25, ['ORIGINAL_LATENCY_BUDGET_MISS']),
      journey('synthetic-C033-attempt-3', 'PASS', 'PASS', 'PASS', 1000, 0.25),
      journey('synthetic-C033-attempt-4', 'FAIL', 'PASS', 'FAIL', 6000, 75.9, ['ORIGINAL_FAILED_REPLY']),
      journey('synthetic-C033-attempt-5', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN', null, null, ['END_TIME_NOT_SAVED'])] };
  const view = subject.view(subject.fromLatency(report), { filter: 'success' });
  assert.equal(view.rows.length, 5);
  assert.deepEqual(view.rows.map((row) => row.status), ['WITHIN', 'EXCEEDED', 'WITHIN', 'FAILED', 'UNKNOWN']);
  assert.deepEqual([view.rows[1].values.budget, view.rows[1].values.observed], [1000, 1000.25]);
  assert.deepEqual([view.rows[4].values.budget, view.rows[4].values.observed], [null, null]);
  assert.equal(view.rows[1].attention, true);
  for (const row of view.rows) assert.equal(row.values.retry, true, 'the producer flag that the original stays counted is shown on every row');
  assert.deepEqual(view.statusCounts, { WITHIN: 2, EXCEEDED: 1, FAILED: 1, UNKNOWN: 1, NOT_SAVED: 0 });
});
