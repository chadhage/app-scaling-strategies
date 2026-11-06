'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('..\\tables.js');
const saved = require('..\\saved.js');
const r = require('.\\reports.cjs');

const catalog = T.catalog(saved);
const sum = (counts) => Object.values(counts).reduce((total, value) => total + value, 0);
const idsOf = (view) => view.rows.map((row) => row.position);
const attentionOf = (table) => table.rows.filter((row) => row.attention).map((row) => row.position);
const build = (kinds) => T.fromCohort(r.cohortReport(kinds));
const frozenEverywhere = (value) => !value || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(frozenEverywhere));

test('the closed vocabularies map every status to one kind and an unrecognised status never becomes a success', () => {
  const kinds = Object.fromEntries(T.tableIds.map((id) => [id, Object.fromEntries(T.vocabularies[id])]));
  assert.deepEqual(kinds.cohort, { ACTUAL_TRANSITION: 'success', UNCHANGED: 'neutral', NOT_TRANSITIONED_YET: 'neutral', FAILED: 'failed', UNKNOWN: 'unknown' });
  assert.deepEqual(kinds.effect, { ONE_INTENDED_EFFECT: 'success', DUPLICATE: 'failed', MISSING: 'failed', MISSING_OBSERVATION: 'unknown', UNKNOWN: 'unknown' });
  assert.deepEqual(kinds.latency, { WITHIN: 'success', EXCEEDED: 'failed', FAILED: 'failed', UNKNOWN: 'unknown' });
  for (const id of T.tableIds) assert.equal(Object.values(kinds[id]).filter((kind) => kind === 'success').length, 1, id);
  assert.ok(frozenEverywhere(T.vocabularies) && frozenEverywhere(T.columns));
  assert.equal(T.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.deepEqual(T.states, ['COMPLETE', 'INCOMPLETE', 'INCONSISTENT', 'EMPTY', 'REJECTED']);
});

test('cohort rows carry the explicit status, the C031 reason code and the C031 facts', () => {
  const table = build(['transition', 'unchanged', 'notYet', 'failed', 'unknown']);
  assert.deepEqual(table.rows.map((row) => [row.id, row.status, row.kind, row.attention, row.producerStatus]), [
    ['client-001', 'ACTUAL_TRANSITION', 'success', false, 'ACTUAL_TRANSITION'], ['client-002', 'UNCHANGED', 'neutral', false, 'UNCHANGED'],
    ['client-003', 'NOT_TRANSITIONED_YET', 'neutral', false, 'NOT_TRANSITIONED_YET'], ['client-004', 'FAILED', 'failed', true, 'FAILED_OR_UNKNOWN:FAILED'],
    ['client-005', 'UNKNOWN', 'unknown', true, 'FAILED_OR_UNKNOWN:UNKNOWN']]);
  const [first, , , failed] = table.rows;
  assert.equal(first.text.reason, 'TRANSITION_EVIDENCE_COMPLETE: TRANSITION_EVIDENCE_COMPLETE (fictional meaning)');
  assert.equal(first.text.versions, '1.0.0 to 2.0.0');
  assert.equal(first.text.eligible, 'yes: STARTED_ON_OLD_VERSION');
  assert.equal(first.text.counting, 'numerator yes, denominator yes');
  assert.equal(failed.text.status, 'FAILED (needs attention)');
  assert.equal(first.text.status, 'ACTUAL_TRANSITION');
  assert.equal(failed.text.notes, 'none');
  assert.equal(table.state, 'COMPLETE');
  assert.equal(table.producerTotal, 5);
  assert.deepEqual(table.producer, { schema: 'C031-evaluation/1', id: 'test-fleet', eligible: 4, actualTransitions: 1, numerator: 1, denominator: 4, percent: '25.00%' });
  assert.ok(table.checks.length === 8 && table.checks.every((check) => check.equal));
  assert.equal(T.view(table).producerLine, 'Producer C031 says: 1 of 4 eligible clients = 25.00%; eligible 4, actual transitions 1, clients 5.');
});

test('a producer status the inspector does not recognise, a contradiction or a malformed row is UNKNOWN with a flag and the producer text', () => {
  const report = r.cohortReport(['transition', 'transition', 'transition', 'transition', 'failed', 'transition', 'transition']);
  report.clients[0].classification = 'PARTIALLY_MIGRATED';
  report.clients[1].classification = undefined;
  report.clients[2].failureKind = 'FAILED';
  report.clients[3].countsInNumerator = false;
  report.clients[4].failureKind = 'PENDING';
  report.clients[5] = 'not an object';
  report.clients[6].classification = 'FAILED_OR_UNKNOWN';
  report.clients[6].failureKind = undefined;
  const table = T.fromCohort(report);
  assert.deepEqual(table.rows.map((row) => [row.status, row.producerStatus, [...row.flags]]), [
    ['UNKNOWN', 'PARTIALLY_MIGRATED', ['UNRECOGNISED_STATUS']], ['UNKNOWN', 'undefined', ['UNRECOGNISED_STATUS']],
    ['UNKNOWN', 'ACTUAL_TRANSITION', ['CONTRADICTORY_PRODUCER_STATUS']], ['UNKNOWN', 'ACTUAL_TRANSITION', ['CONTRADICTORY_PRODUCER_STATUS']],
    ['UNKNOWN', 'FAILED_OR_UNKNOWN:PENDING', ['UNRECOGNISED_STATUS']], ['UNKNOWN', 'undefined', ['UNRECOGNISED_STATUS', 'MALFORMED_ROW']],
    ['UNKNOWN', 'FAILED_OR_UNKNOWN:undefined', ['UNRECOGNISED_STATUS']]]);
  assert.ok(table.rows.every((row) => row.kind === 'unknown' && row.attention));
  assert.equal(table.rows[5].id, 'row-6-without-client-id');
  assert.equal(table.rows[5].text.reason, 'no reason code saved');
  assert.equal(table.rows[5].text.eligible, 'no: eligibility not saved');
  assert.equal(table.rows[5].text.versions, 'unproven to none');
  assert.equal(table.state, 'INCONSISTENT', 'rows that disagree with the producer numbers are flagged, never hidden');
  assert.equal(T.view(table).statusCounts.UNKNOWN, 7);
});

test('cohort notes keep the producer notes and the collapsed trace copies', () => {
  const report = r.cohortReport(['transition', 'transition']);
  report.clients[0].notes = ['ISSUE_TIME_NOT_SAVED', 42];
  report.clients[0].traceCopies = 3;
  report.clients[1].notes = 'not a list';
  report.clients[1].reasonCodes = [7];
  report.clients[1].reasonMeaning = undefined;
  const [first, second] = T.fromCohort(report).rows;
  assert.equal(first.text.notes, 'ISSUE_TIME_NOT_SAVED; 3 saved copies collapsed by the producer');
  assert.equal(second.text.notes, 'none');
  assert.equal(second.text.reason, 'no reason code saved');
  assert.equal(second.values.reason, null);
});

test('effect rows map every C030 status and keep the complete key and the bounds', () => {
  const statuses = ['ONE_APPLICATION', 'DUPLICATE_APPLICATION', 'CONFIRMED_ABSENCE', 'MISSING_OBSERVATION', 'UNKNOWN_ACK', 'UNSUPPORTED', 'SOMETHING_NEW', 'ONE_APPLICATION'];
  const upper = (status, index) => (status === 'ONE_APPLICATION' ? (index === 7 ? null : 1) : status === 'UNKNOWN_ACK' ? null : 2);
  const effects = statuses.map((status, index) => ({ ...r.effect(index % 3, status, status === 'ONE_APPLICATION' ? 1 : 2, upper(status, index), index), index }));
  const report = r.detection('mapping', [{ ...r.original('original-001', 'UNKNOWN', effects), effectCounts: { intendedEffects: 8, confirmedApplications: null, deliveryAttempts: null } }]);
  const table = T.fromEffects(report);
  assert.deepEqual(table.rows.map((row) => [row.status, row.producerStatus, row.kind]), [
    ['ONE_INTENDED_EFFECT', 'ONE_APPLICATION', 'success'], ['DUPLICATE', 'DUPLICATE_APPLICATION', 'failed'], ['MISSING', 'CONFIRMED_ABSENCE', 'failed'],
    ['MISSING_OBSERVATION', 'MISSING_OBSERVATION', 'unknown'], ['UNKNOWN', 'UNKNOWN_ACK', 'unknown'], ['UNKNOWN', 'UNSUPPORTED', 'unknown'],
    ['UNKNOWN', 'SOMETHING_NEW', 'unknown'], ['UNKNOWN', 'ONE_APPLICATION', 'unknown']]);
  assert.ok(table.rows[6].flags.includes('UNRECOGNISED_STATUS'));
  assert.ok(table.rows[7].flags.includes('UPPER_BOUND_NOT_EXACT'), 'one application with an open upper bound is not shaped like a success');
  assert.equal(table.rows[4].text.upper, 'unknown (no upper bound)');
  assert.equal(table.rows[4].values.upper, null);
  assert.equal(table.rows[0].text.effectKey, r.keys[0]);
  assert.equal(table.rows[0].id, `original-001 / ${r.keys[0]}`);
  assert.equal(table.state, 'COMPLETE');
});

test('an effect marked one application that the bounds contradict, and malformed effect or original rows, stay visible as UNKNOWN', () => {
  const odd = { ...r.effect(0, 'ONE_APPLICATION', 2, 2, 1) };
  const missingFields = { status: 'UNKNOWN_ACK' };
  const report = r.detection('odd', [r.original('original-001', 'UNKNOWN', [odd, missingFields, 'garbage']), 'not an original', { effects: 'none' }],
    { originals: 3, pass: 0, fail: 0, unknown: 3, unsupported: 0 });
  const table = T.fromEffects(report);
  assert.deepEqual(table.rows.map((row) => row.status), ['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN']);
  assert.ok(table.rows[0].flags.includes('CONTRADICTORY_PRODUCER_STATUS'));
  assert.equal(table.rows[1].id, 'original-001 / effect-2-without-key');
  assert.equal(table.rows[1].text.lower, 'not saved');
  assert.equal(table.rows[1].text.deliveries, 'not saved');
  assert.ok(table.rows[2].flags.includes('MALFORMED_ROW'));
  assert.equal(table.rows[3].id, 'original-2-without-id / (no effect rows saved)');
  assert.equal(table.rows[4].id, 'original-3-without-id / (no effect rows saved)');
  assert.ok(table.rows.every((row) => row.attention));
});

test('an original without effect rows is one UNKNOWN row that says effects were not observed, never zero rows', () => {
  const history = r.detection('history', [0, 1].map((index) => ({ ...r.original(`attempt-${index + 1}`, 'UNKNOWN', []),
    reasonCodes: ['NO_ACTUAL_EFFECT_RECEIPTS_OR_ASSOCIATION'], effectCounts: { intendedEffects: null, confirmedApplications: null, deliveryAttempts: null } })));
  const table = T.fromEffects(history);
  assert.equal(table.state, 'COMPLETE');
  assert.equal(table.rowCount, 2);
  assert.deepEqual(table.rows.map((row) => [row.status, row.producerStatus, [...row.flags]]), Array(2).fill(['UNKNOWN', 'NO_ACTUAL_EFFECT_RECEIPTS_OR_ASSOCIATION', ['NO_EFFECT_ROWS_SAVED']]));
  assert.match(table.rows[0].text.effectKey, /unobserved, not zero/);
  const bare = r.detection('bare', [{ originalId: 'attempt-1', verdict: 'UNKNOWN', effects: [], effectCounts: {}, reasonCodes: [] }]);
  assert.equal(T.fromEffects(bare).rows[0].producerStatus, 'NO_EFFECT_ROWS_SAVED');
});

test('latency rows map every journey verdict and keep the budget, the observed value and the retry flag', () => {
  const report = r.latencyReport([
    r.journey('a', 'PASS', 'PASS', 'PASS', 1000, 0.25), r.journey('b', 'FAIL', 'FAIL', 'PASS', 1000, 1000.25, { reasonCodes: ['ORIGINAL_LATENCY_BUDGET_MISS'] }),
    r.journey('c', 'FAIL', 'PASS', 'FAIL', 6000, 75.9), r.journey('d', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN', null, null, { summaryOnly: true }),
    r.journey('e', 'PASS', 'FAIL', 'PASS', 1000, 5), r.journey('f', 'MAYBE', 'PASS', 'PASS', 1000, 5), 'junk',
    r.journey('g', 'PASS', 'PASS', 'PASS', 1000, 1, { includedInDenominator: false, reasonCodes: 'none' })
  ], { originals: 8, pass: 2, fail: 2, unknown: 1 });
  const table = T.fromLatency(report);
  assert.deepEqual(table.rows.map((row) => row.status), ['WITHIN', 'EXCEEDED', 'FAILED', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'WITHIN']);
  assert.deepEqual(table.rows.map((row) => row.producerStatus), ['PASS', 'FAIL', 'FAIL', 'UNKNOWN', 'PASS', 'MAYBE', 'undefined', 'PASS']);
  assert.ok(table.rows[4].flags.includes('CONTRADICTORY_PRODUCER_STATUS'));
  assert.ok(table.rows[5].flags.includes('UNRECOGNISED_STATUS'));
  assert.ok(table.rows[6].flags.includes('MALFORMED_ROW'));
  assert.deepEqual([...table.rows[3].flags], ['SUMMARY_ONLY']);
  assert.deepEqual([...table.rows[7].flags], ['DENOMINATOR_FLAG_NOT_TRUE']);
  assert.equal(table.rows[7].text.retry, 'NO: the producer did not keep it in its denominator');
  assert.equal(table.rows[7].values.retry, false);
  assert.equal(table.rows[0].text.retry, 'yes: kept in the producer denominator, a retry cannot hide it');
  assert.equal(table.rows[0].text.budget, '1000 ms');
  assert.equal(table.rows[0].text.observed, '0.25 ms');
  assert.equal(table.rows[3].text.budget, 'not saved - UNKNOWN');
  assert.equal(table.rows[3].text.observed, 'not saved - UNKNOWN');
  assert.equal(table.rows[1].text.reason, 'ORIGINAL_LATENCY_BUDGET_MISS');
  assert.equal(table.rows[0].text.reason, 'none');
  assert.equal(table.rows[7].text.reason, 'none');
  assert.equal(table.rows[6].id, 'journey-7-without-id');
});

test('3 failed and 2 unknown rows among 40 successes stay visible under every sort, filter, search and page, in all three tables', () => {
  const tables = catalog.tables('negative-3-failed-2-unknown-of-40');
  const expected = {
    cohort: { ACTUAL_TRANSITION: 40, UNCHANGED: 0, NOT_TRANSITIONED_YET: 0, FAILED: 3, UNKNOWN: 2, NOT_SAVED: 0 },
    effect: { ONE_INTENDED_EFFECT: 40, DUPLICATE: 3, MISSING: 0, MISSING_OBSERVATION: 0, UNKNOWN: 2, NOT_SAVED: 0 },
    latency: { WITHIN: 40, EXCEEDED: 2, FAILED: 1, UNKNOWN: 2, NOT_SAVED: 0 }
  };
  for (const id of T.tableIds) {
    const table = tables[id];
    const attention = attentionOf(table);
    assert.equal(table.state, 'COMPLETE', id);
    assert.equal(table.rowCount, 45, id);
    assert.equal(attention.length, 5, id);
    assert.deepEqual(T.view(table).statusCounts, expected[id], id);
    const queries = [{}, { filter: 'success' }, { filter: 'attention' }, { search: 'zzz no such text' }, { filter: 'success', search: 'zzz' }, { pageSize: 5, page: 1 },
      { pageSize: 5, page: 99 }, { pageSize: 1000 }, ...T.filterOptions(id).map((option) => ({ filter: option.value }))];
    for (const column of table.columns) for (const direction of ['asc', 'desc']) queries.push({ sort: { column: column.key, direction } });
    for (const query of queries) {
      const view = T.view(table, query);
      for (const position of attention) assert.ok(idsOf(view).includes(position), `${id} position ${position} under ${JSON.stringify(query)}`);
      assert.ok(view.check.ok, view.check.problems.join('; '));
      assert.equal(view.shown + view.hidden.count, 45);
      assert.equal(sum(view.statusCounts), view.total);
      assert.equal(view.total, 45);
      assert.equal(new Set(idsOf(view)).size, view.shown);
    }
  }
});

test('the status filter success keeps the 5 failed and unknown rows, says what it would have hidden and how to show everything', () => {
  const table = catalog.tables('negative-3-failed-2-unknown-of-40').cohort;
  const view = T.view(table, { filter: 'success' });
  assert.equal(view.shown, 45);
  assert.equal(view.hidden.count, 0);
  assert.deepEqual(view.keptVisible, { count: 5, statuses: { FAILED: 3, UNKNOWN: 2 } });
  assert.equal(view.filterNote, 'The filter "success" alone would have hidden 3 FAILED and 2 UNKNOWN rows: failed and unknown rows are never hidden, so they stay visible. Choose "All statuses", clear the search and use all pages to show every row.');
  assert.match(view.announcement, /showing 45 of 45 rows, COMPLETE/);
  assert.match(view.announcement, /alone would have hidden 3 FAILED and 2 UNKNOWN rows/);
});

test('a filter that hides rows names how many and which statuses; success only is neither the default nor the only view', () => {
  const table = build(['transition', 'transition', ...r.repeat('unchanged', 3), ...r.repeat('notYet', 4), 'failed', 'failed', 'unknown']);
  const everything = T.view(table);
  assert.equal(everything.shown, 12);
  assert.equal(everything.query.filter, 'all');
  assert.equal(everything.filterNote, '');
  assert.deepEqual(everything.hidden, { statuses: {}, count: 0 });
  const success = T.view(table, { filter: 'success' });
  assert.equal(success.shown, 5);
  assert.deepEqual(success.hidden, { count: 7, statuses: { UNCHANGED: 3, NOT_TRANSITIONED_YET: 4 } });
  assert.equal(success.filterNote, 'The filter "success" hides 7 rows: UNCHANGED 3, NOT_TRANSITIONED_YET 4. It would also have hidden 2 FAILED and 1 UNKNOWN rows: failed and unknown rows are never hidden, so they stay visible. Choose "All statuses", clear the search and use all pages to show every row.');
  const attention = T.view(table, { filter: 'attention' });
  assert.equal(attention.shown, 3);
  assert.deepEqual(attention.hidden.statuses, { ACTUAL_TRANSITION: 2, UNCHANGED: 3, NOT_TRANSITIONED_YET: 4 });
  assert.match(attention.filterNote, /^The filter "Failed and unknown only" hides 9 rows: /);
  assert.equal(attention.keptVisible.count, 0);
  const unchanged = T.view(table, { filter: 'UNCHANGED' });
  assert.equal(unchanged.shown, 6);
  assert.match(unchanged.filterNote, /^The filter "UNCHANGED" hides 6 rows: ACTUAL_TRANSITION 2, NOT_TRANSITIONED_YET 4\. It would also have hidden 2 FAILED and 1 UNKNOWN rows/);
  const failedOnly = T.view(table, { filter: 'FAILED' });
  assert.equal(failedOnly.shown, 3, 'unknown rows stay although only FAILED was chosen');
  assert.equal(failedOnly.keptVisible.statuses.UNKNOWN, 1);
  assert.deepEqual(T.filterOptions('cohort').map((option) => option.value), ['all', 'attention', 'success', 'ACTUAL_TRANSITION', 'UNCHANGED', 'NOT_TRANSITIONED_YET', 'FAILED', 'UNKNOWN']);
  assert.match(T.filterOptions('cohort')[0].label, /default/);
  const clean = build(['transition', 'transition']);
  assert.equal(T.view(clean, { filter: 'success' }).filterNote, '', 'a filter that hides and keeps nothing says nothing');
});

test('search and paging only ever hide success or neutral rows, and say so', () => {
  const table = build([...r.repeat('transition', 6), 'failed', 'unknown', ...r.repeat('unchanged', 4)]);
  const search = T.view(table, { search: '  CLIENT-002 ' });
  assert.equal(search.query.search, 'CLIENT-002');
  assert.deepEqual(search.rows.map((row) => row.id), ['client-002', 'client-007', 'client-008']);
  assert.equal(search.filterNote, 'The search "CLIENT-002" hides 9 rows: ACTUAL_TRANSITION 5, UNCHANGED 4. It would also have hidden 1 FAILED and 1 UNKNOWN rows: failed and unknown rows are never hidden, so they stay visible. Choose "All statuses", clear the search and use all pages to show every row.');
  const paged = T.view(table, { pageSize: 3, page: 2 });
  assert.equal(paged.query.pages, 4);
  assert.deepEqual(paged.rows.map((row) => row.id), ['client-004', 'client-005', 'client-006', 'client-007', 'client-008']);
  assert.match(paged.filterNote, /^The page 2 of 4 hides 7 rows: /);
  assert.equal(paged.shown + paged.hidden.count, 12);
  assert.equal(T.view(table, { pageSize: 3, page: 50 }).query.page, 4);
  const both = T.view(table, { filter: 'success', search: 'client-00', pageSize: 2 });
  assert.match(both.filterNote, /^The filter "success" and search "client-00" and page 1 of 3 hides /);
  assert.equal(T.view(table, { pageSize: 100 }).query.pages, 1);
  const none = T.view(table, { filter: 'UNKNOWN', pageSize: 1 });
  assert.equal(none.query.pages, 1);
});

test('sorting is stable, orders numbers and text, puts missing values last and never changes which rows are shown', () => {
  const report = r.latencyReport([r.journey('b', 'PASS', 'PASS', 'PASS', 1000, 5), r.journey('a', 'PASS', 'PASS', 'PASS', 1000, 5), r.journey('c', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN', null, null),
    r.journey('d', 'PASS', 'PASS', 'PASS', 1000, 2, { includedInDenominator: false }), r.journey('e', 'PASS', 'PASS', 'PASS', 1000, 20)], { originals: 5, pass: 4, fail: 0, unknown: 1 });
  const table = T.fromLatency(report);
  const order = (query) => T.view(table, query).rows.map((row) => row.id);
  assert.deepEqual(order({ sort: { column: 'observed', direction: 'asc' } }), ['d', 'b', 'a', 'e', 'c']);
  assert.deepEqual(order({ sort: { column: 'observed', direction: 'desc' } }), ['e', 'b', 'a', 'd', 'c'], 'ties keep the producer order and missing values stay last');
  assert.deepEqual(order({ sort: { column: 'id', direction: 'desc' } }), ['e', 'd', 'c', 'b', 'a']);
  assert.deepEqual(order({ sort: { column: 'retry', direction: 'asc' } }), ['d', 'b', 'a', 'c', 'e']);
  assert.deepEqual(order({ sort: { column: 'budget', direction: 'asc' } }), ['b', 'a', 'd', 'e', 'c']);
  assert.deepEqual(order({ sort: { column: 'status', direction: 'asc' } }), ['c', 'b', 'a', 'd', 'e']);
  assert.deepEqual(order({}), ['b', 'a', 'c', 'd', 'e']);
});

test('invalid query parts are corrected to safe defaults and named, never thrown', () => {
  const table = build(['transition', 'failed']);
  assert.deepEqual(T.view(table, null).query.corrected, []);
  const view = T.view(table, { sort: { column: 'nope', direction: 'asc' }, filter: 'nonsense', search: 7, pageSize: 0, page: -1 });
  assert.deepEqual(view.query.corrected, ['sort', 'filter', 'search', 'pageSize', 'page']);
  assert.deepEqual(view.query.sort, { column: 'position', direction: 'asc' });
  assert.equal(view.query.filter, 'all');
  assert.equal(view.shown, 2);
  assert.deepEqual(T.view(table, { sort: 'status', search: 'x'.repeat(201) }).query.corrected, ['sort', 'search']);
  assert.deepEqual(T.view(table, { sort: { column: 'status', direction: 'sideways' } }).query.corrected, ['sort']);
  assert.deepEqual(T.view(table, { sort: { column: 'status', direction: 'desc' }, pageSize: 2, page: 1 }).query.corrected, []);
});

test('an empty saved set says no attempts recorded and never all passed, never 100 percent and never a success rate', () => {
  for (const [id, table] of [['cohort', build([])], ['effect', T.fromEffects(r.detection('empty', []))], ['latency', T.fromLatency(r.latencyReport([]))]]) {
    const view = T.view(table);
    assert.equal(table.state, 'EMPTY', id);
    assert.equal(view.shown, 0);
    assert.equal(view.total, 0);
    assert.match(view.summary, /no attempts recorded \(showing 0 of 0 rows\)/);
    assert.doesNotMatch(view.summary, /all passed|100/i);
    assert.equal(sum(view.statusCounts), 0);
    assert.ok(view.check.ok);
  }
  assert.equal(T.view(build([])).producerLine, 'Producer C031 says: no success rate (0 eligible clients); eligible 0, actual transitions 0, clients 0.');
});

test('a truncated saved set says INCOMPLETE, keeps the producer total and counts the missing rows as NOT_SAVED in every table', () => {
  const full = r.cohortReport(['transition', 'failed', 'unknown', 'transition', 'notYet', 'transition', 'failed', 'unchanged', 'unknown', 'transition']);
  const cohort = T.fromCohort({ ...full, clients: full.clients.slice(0, 6) });
  const view = T.view(cohort);
  assert.deepEqual([cohort.state, view.shown, view.total, view.statusCounts.NOT_SAVED], ['INCOMPLETE', 6, 10, 4]);
  assert.equal(sum(view.statusCounts), 10);
  assert.equal(view.summary, 'Cohort table: INCOMPLETE, showing 6 of 10 rows. The producer counted 10 rows but this saved set holds 6: 4 are NOT_SAVED and their status is unknown. Status counts: ACTUAL_TRANSITION 3, UNCHANGED 0, NOT_TRANSITIONED_YET 1, FAILED 1, UNKNOWN 1, NOT_SAVED 4; together 10 of 10 rows.');
  assert.deepEqual(cohort.checks, [], 'the producer numbers are not compared with a shorter list');
  const effect = T.fromEffects(r.detection('trunc', [r.original('original-001', 'PASS', r.threeOk())], { originals: 3, pass: 1, fail: 0, unknown: 2, unsupported: 0 }));
  assert.deepEqual([effect.state, effect.rowCount, effect.total, effect.missingRows], ['INCOMPLETE', 3, 9, 6]);
  const noRows = T.fromEffects(r.detection('trunc', [], { originals: 2, pass: 0, fail: 0, unknown: 2, unsupported: 0 }));
  assert.deepEqual([noRows.state, noRows.total, noRows.missingRows], ['INCOMPLETE', 2, 2]);
  const shortOriginal = T.fromEffects(r.detection('trunc', [{ ...r.original('original-001', 'PASS', r.threeOk().slice(0, 2)), effectCounts: { intendedEffects: 3 } }]));
  assert.deepEqual([shortOriginal.state, shortOriginal.total, shortOriginal.missingRows], ['INCOMPLETE', 3, 1]);
  const latency = T.fromLatency(r.latencyReport([r.journey('a', 'PASS', 'PASS', 'PASS', 1000, 1)], { originals: 4, pass: 3, fail: 1, unknown: 0 }));
  assert.deepEqual([latency.state, latency.total, T.view(latency).statusCounts.NOT_SAVED], ['INCOMPLETE', 4, 3]);
});

test('a duplicated row is kept and flagged in every table, and the saved set is INCONSISTENT against the producer total', () => {
  const full = r.cohortReport(['transition', 'failed', 'unknown', 'notYet']);
  const cohort = T.fromCohort({ ...full, clients: [...full.clients, full.clients[1]] });
  const view = T.view(cohort);
  assert.deepEqual([cohort.state, cohort.extraRows, view.shown, view.total], ['INCONSISTENT', 1, 5, 5]);
  assert.deepEqual(view.rows.filter((row) => row.id === 'client-002').map((row) => [...row.flags]), [['DUPLICATE_ROW'], ['DUPLICATE_ROW']]);
  assert.match(view.summary, /INCONSISTENT, showing 5 of 5 rows\. This saved set disagrees with its producer: 1 extra row beyond the producer total 4, kept and flagged; /);
  assert.equal(view.statusCounts.FAILED, 2);
  assert.equal(view.rows.find((row) => row.id === 'client-001').text.notes, 'none');
  assert.equal(view.rows.find((row) => row.position === 5).text.notes, 'DUPLICATE_ROW');
  const effects = r.detection('dup', [{ ...r.original('original-001', 'PASS', [...r.threeOk(), r.threeOk()[0]]), effectCounts: { intendedEffects: 3, confirmedApplications: 3, deliveryAttempts: 3 } }]);
  const effect = T.fromEffects(effects);
  assert.equal(effect.extraRows, 1);
  assert.equal(effect.rows.filter((row) => row.flags.includes('DUPLICATE_ROW')).length, 2);
  const latency = T.fromLatency(r.latencyReport([r.journey('a', 'PASS', 'PASS', 'PASS', 1, 1), r.journey('a', 'PASS', 'PASS', 'PASS', 1, 1)], { originals: 1, pass: 1, fail: 0, unknown: 0 }));
  assert.deepEqual([latency.state, latency.extraRows], ['INCONSISTENT', 1]);
});

test('numbers that disagree with the producer are named and flagged INCONSISTENT, and rows still stay visible', () => {
  const report = r.cohortReport(['transition', 'failed', 'unknown']);
  report.counts.actualTransition = 2;
  report.successRate.numerator = 2;
  const table = T.fromCohort(report);
  assert.equal(table.state, 'INCONSISTENT');
  assert.equal(table.disagreements, 2);
  assert.match(T.view(table).summary, /actual transitions 1 from the rows but 2 from the producer; rate numerator 1 from the rows but 2 from the producer/);
  assert.equal(T.view(table).shown, 3);
  const effects = r.detection('claims', [{ ...r.original('original-001', 'PASS', r.threeOk()), effectCounts: { intendedEffects: 3, confirmedApplications: 9, deliveryAttempts: 9 } }]);
  assert.deepEqual(T.fromEffects(effects).checks.filter((check) => !check.equal).map((check) => check.name), ['confirmed applications', 'delivery attempts']);
  const latency = T.fromLatency(r.latencyReport([r.journey('a', 'PASS', 'PASS', 'PASS', 1, 1)], { originals: 1, pass: 0, fail: 1, unknown: 0 }));
  assert.deepEqual(latency.checks.filter((check) => !check.equal).map((check) => check.name), ['within budget', 'failed or exceeded']);
});

test('a rejected or unusable producer report is REJECTED with its code, keeps any rows it holds and is never an empty success', () => {
  const rejectedWithCode = { ...r.cohortReport(['failed']), valid: false, code: 'UNKNOWN_SAVED_ID' };
  const table = T.fromCohort(rejectedWithCode);
  assert.deepEqual([table.state, table.code, table.rowCount, table.total], ['REJECTED', 'UNKNOWN_SAVED_ID', 1, 1]);
  assert.equal(T.view(table).summary, 'Cohort table: REJECTED (UNKNOWN_SAVED_ID), showing 1 of 1 rows. The producer output was rejected or is unusable. Nothing is shown as success and there is no success rate. Status counts: ACTUAL_TRANSITION 0, UNCHANGED 0, NOT_TRANSITIONED_YET 0, FAILED 1, UNKNOWN 0, NOT_SAVED 0; together 1 of 1 rows.');
  const cases = [[undefined, 'PRODUCER_REPORT_REQUIRED'], [[], 'PRODUCER_REPORT_REQUIRED'], [{ valid: false }, 'PRODUCER_REPORT_NOT_VALID'],
    [{ ...r.cohortReport([]), schema: 'other/1' }, 'PRODUCER_SCHEMA_MISMATCH'], [{ ...r.cohortReport([]), clients: 'none' }, 'PRODUCER_ROWS_MISSING'],
    [{ ...r.cohortReport([]), counts: null }, 'PRODUCER_COUNTS_MISSING'], [{ ...r.cohortReport(['failed']), counts: {} }, 'PRODUCER_TOTAL_MISSING']];
  for (const [report, code] of cases) {
    const rejected = T.fromCohort(report);
    assert.deepEqual([rejected.state, rejected.code], ['REJECTED', code], String(code));
    assert.equal(sum(T.view(rejected).statusCounts), rejected.total);
  }
  assert.deepEqual([T.fromEffects(r.detection('x', [], { originals: 'many' })).state, T.fromEffects(null).rowCount, T.fromLatency({}).state], ['REJECTED', 0, 'REJECTED']);
  assert.equal(T.fromLatency(r.latencyReport([r.journey('a', 'PASS', 'PASS', 'PASS', 1, 1)], { originals: 'many' })).code, 'PRODUCER_TOTAL_MISSING');
  assert.equal(T.fromCohort({ ...r.cohortReport(['transition']), successRate: null, fleetId: 7 }).state, 'INCONSISTENT');
  assert.throws(() => T.fromReport('nope', {}), { code: 'UNKNOWN_TABLE' });
  assert.equal(T.fromReport('cohort', r.cohortReport(['transition'])).tableId, 'cohort');
  const unreadable = new Proxy({}, { get() { throw new Error('boom'); } });
  for (const tableId of T.tableIds) {
    const table = T.fromReport(tableId, unreadable);
    assert.deepEqual([table.state, table.code, table.rowCount, table.total], ['REJECTED', 'PRODUCER_REPORT_UNREADABLE', 0, 0], tableId);
    assert.match(T.view(table).summary, /REJECTED \(PRODUCER_REPORT_UNREADABLE\)/);
    assert.doesNotMatch(T.view(table).summary, /no attempts recorded|all passed/i);
  }
});

test('a hole in a sparse producer list is a malformed UNKNOWN row, never silently skipped', () => {
  const sparseClients = [r.clientRow('client-001', 'transition'), , r.clientRow('client-003', 'failed')];
  const cohort = T.fromCohort({ ...r.cohortReport(['transition', 'transition', 'failed']), clients: sparseClients });
  assert.equal(cohort.rowCount, 3);
  assert.deepEqual([cohort.rows[1].id, cohort.rows[1].status, [...cohort.rows[1].flags]], ['row-2-without-client-id', 'UNKNOWN', ['UNRECOGNISED_STATUS', 'MALFORMED_ROW']]);
  const effects = [r.effect(0, 'ONE_APPLICATION', 1, 1, 1), , r.effect(2, 'ONE_APPLICATION', 1, 1, 1)];
  const sparseOriginals = [r.original('original-001', 'PASS', r.threeOk()), , r.original('original-003', 'PASS', r.threeOk())];
  const effect = T.fromEffects(r.detection('sparse', sparseOriginals, { originals: 3, pass: 2, fail: 0, unknown: 1, unsupported: 0 }));
  assert.equal(effect.rowCount, 7, 'three rows, one placeholder row for the hole, three rows');
  assert.equal(effect.rows[3].id, 'original-2-without-id / (no effect rows saved)');
  const sparseEffects = T.fromEffects(r.detection('sparse', [{ ...r.original('original-001', 'PASS', effects), effectCounts: { intendedEffects: 3 } }]));
  assert.deepEqual(sparseEffects.rows.map((row) => row.status), ['ONE_INTENDED_EFFECT', 'UNKNOWN', 'ONE_INTENDED_EFFECT']);
  const latency = T.fromLatency(r.latencyReport([r.journey('a', 'PASS', 'PASS', 'PASS', 1, 1), , r.journey('c', 'PASS', 'PASS', 'PASS', 1, 1)]));
  assert.deepEqual(latency.rows.map((row) => row.id), ['a', 'journey-2-without-id', 'c']);
  assert.equal(latency.rows[1].status, 'UNKNOWN');
});

test('the view check catches tampered counts, a hidden failed row and inconsistent shown numbers', () => {
  const table = build(['transition', 'failed', 'unknown']);
  const view = T.view(table);
  assert.deepEqual(T.checkView(table, view), { ok: true, problems: [] });
  const bad = { ...view, statusCounts: { ...view.statusCounts, FAILED: 9 }, rows: view.rows.filter((row) => row.status !== 'FAILED'), shown: 7 };
  const problems = T.checkView(table, bad).problems;
  assert.equal(problems.length, 4);
  assert.match(problems[0], /status counts add up to 11, not to the total 3/);
  assert.match(problems[1], /1 failed or unknown rows are not shown/);
  const tampered = { ...table, total: 99 };
  const result = T.view(tampered);
  assert.equal(result.check.ok, false);
  assert.match(result.announcement, /^INCONSISTENT VIEW: status counts add up to 3, not to the total 99/);
});

test('every model output is deeply frozen, so a caller cannot edit a row, a count or a note', () => {
  const view = T.view(catalog.tables('closed-history').latency);
  assert.ok(frozenEverywhere(view));
  assert.ok(frozenEverywhere(catalog.tables('closed-history')));
  assert.throws(() => { 'use strict'; view.rows[0].status = 'WITHIN'; }, TypeError);
  assert.throws(() => { 'use strict'; view.statusCounts.FAILED = 0; }, TypeError);
});

test('the catalog serves saved sets, names their origins and treats a missing output as a rejected table', () => {
  assert.deepEqual(catalog.ids, ['closed-history', 'held-snapshot', 'fiction-failed-then-retry', 'negative-3-failed-2-unknown-of-40',
    'negative-unrecognised-status', 'negative-empty', 'negative-truncated', 'negative-duplicated-row']);
  const described = catalog.describe('closed-history');
  assert.deepEqual([described.id, described.role], ['closed-history', 'historical']);
  assert.deepEqual(described.origins.cohort, { kind: 'producer-saved-output', producer: 'C031', id: 'c034-closed-history' });
  assert.deepEqual(catalog.describe('negative-truncated').origins.effect, { kind: 'mutation', base: 'fiction-failed-then-retry', mutation: 'truncated' });
  assert.throws(() => catalog.describe('nope'), { code: 'UNKNOWN_SAVED_SET' });
  assert.throws(() => catalog.tables(7), { code: 'UNKNOWN_SAVED_SET' });
  const partial = T.catalog({ bundleVersion: 1, cardId: 'C040', sets: [{ id: 'only-cohort', reports: { cohort: { output: r.cohortReport(['failed']) } } }, { id: 'bare' }, 'junk', { role: 'x' }] });
  assert.deepEqual(partial.ids, ['only-cohort', 'bare']);
  const tables = partial.tables('only-cohort');
  assert.deepEqual([tables.cohort.state, tables.effect.state, tables.effect.code, tables.latency.state], ['COMPLETE', 'REJECTED', 'PRODUCER_REPORT_REQUIRED', 'REJECTED']);
  assert.deepEqual(partial.describe('bare'), { id: 'bare', role: 'unclassified', label: 'bare', note: '', origins: { cohort: null, effect: null, latency: null } });
  assert.deepEqual(partial.tables('bare').cohort.state, 'REJECTED');
  assert.deepEqual(T.catalog({ bundleVersion: 2 }).ids, []);
  assert.deepEqual(T.catalog(null).ids, []);
  assert.deepEqual(T.catalog({ bundleVersion: 1, cardId: 'C040', sets: [{ id: 'm', reports: { cohort: { origin: undefined } } }] }).describe('m').origins.cohort, null);
});

// Stateful property test: a seeded random walk over every saved set, table, sort, filter, search and page, including the recovery
// operations (reload of the same or another set, back to the defaults, an invalid query), checking the global invariant after EVERY step.
function walker(seed) {
  let state = seed >>> 0;
  return (limit) => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0;
    return state % limit;
  };
}
test('a seeded random walk keeps every failed and unknown row visible and every count reconciled after each operation', () => {
  const searches = ['', 'client', 'FAILED', 'zzz no match', '  ', 'a', 'unknown', '0'];
  let operations = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const next = walker(seed);
    let tables = catalog.tables(catalog.ids[next(catalog.ids.length)]);
    let tableId = T.tableIds[next(3)];
    let query = {};
    for (let step = 0; step < 160; step++) {
      const choice = next(8);
      if (choice === 0) tables = catalog.tables(catalog.ids[next(catalog.ids.length)]);
      else if (choice === 1) tableId = T.tableIds[next(3)];
      else if (choice === 2) query = { ...query, sort: { column: tables[tableId].columns[next(tables[tableId].columns.length)].key, direction: ['asc', 'desc'][next(2)] } };
      else if (choice === 3) query = { ...query, filter: T.filterOptions(tableId)[next(T.filterOptions(tableId).length)].value };
      else if (choice === 4) query = { ...query, search: searches[next(searches.length)] };
      else if (choice === 5) query = { ...query, pageSize: 1 + next(8), page: 1 + next(6) };
      else if (choice === 6) query = {};
      else query = { sort: 'bad', filter: 'bad', search: 5, pageSize: 'x', page: 0 };
      const table = tables[tableId];
      const view = T.view(table, query);
      operations += 1;
      assert.ok(view.check.ok, `seed ${seed} step ${step}: ${view.check.problems.join('; ')}`);
      for (const position of attentionOf(table)) assert.ok(idsOf(view).includes(position), `seed ${seed} step ${step}: row ${position} disappeared`);
      assert.equal(sum(view.statusCounts), view.total);
      assert.equal(view.shown + view.hidden.count, table.rowCount);
      assert.equal(new Set(idsOf(view)).size, view.shown, 'a row is listed once');
      assert.equal(view.rows.filter((row) => row.attention).length, attentionOf(table).length);
    }
  }
  assert.equal(operations, 800);
});
