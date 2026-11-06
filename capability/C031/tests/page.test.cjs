'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const evaluator = require('..\\evaluator.js');
const saved = require('..\\saved.js');
const source = require('..\\source.cjs');
const f = require('.\\fixtures.cjs');
const { createDocument, html } = require('.\\dom-stub.cjs');

const pagePath = require.resolve('..\\page.js');
const bundle = source.readC034Bundle();
const globals = ['document', 'C031Evaluator', 'C031Saved', 'C034Saved'];

// page.js is browser-only code: it runs here against a stub document built from the real index.html.
function load(t, options = {}) {
  const document = createDocument(html);
  globalThis.document = document;
  globalThis.C031Evaluator = Object.hasOwn(options, 'evaluator') ? options.evaluator : evaluator;
  globalThis.C031Saved = Object.hasOwn(options, 'saved') ? options.saved : saved;
  globalThis.C034Saved = Object.hasOwn(options, 'c034') ? options.c034 : bundle;
  for (const name of globals) if (globalThis[name] === undefined) delete globalThis[name];
  t.after(() => { for (const name of globals) delete globalThis[name]; });
  delete require.cache[pagePath];
  try { require(pagePath); } finally { delete require.cache[pagePath]; }
  const get = (id) => document.getElementById(id);
  return {
    document, get,
    click: (id) => get(id).dispatch('click'),
    choose(id, action = 'evaluate') { get('source-id').value = id; get(action).dispatch('click'); },
    rows: () => get('clients').children,
    cells: (row) => row.children.map((cell) => cell.textContent)
  };
}

const staticText = (id) => new RegExp(`<p id="${id}"[^>]*>([^<]*)</p>`).exec(html)[1];

test('the initial display is unassessed, claims no success and has no rows', (t) => {
  const page = load(t);
  assert.equal(page.get('status').dataset.state, 'UNASSESSED');
  assert.equal(staticText('status'), 'Not evaluated. No saved set is chosen and no success is assumed.');
  assert.equal(staticText('rate'), 'No verified denominator yet.');
  assert.equal(page.get('clients').children.length, 0);
  assert.equal(page.get('evaluate').disabled, false);
  assert.equal(page.get('compare').disabled, false);
  assert.equal(page.get('history-limit').textContent, '');
});

test('evaluating the baseline spells out the numerator, denominator and the counts next to the rate', (t) => {
  const page = load(t);
  page.choose('fleet-baseline');
  assert.equal(page.get('status').dataset.state, 'EVALUATED');
  assert.equal(page.get('status').textContent, 'Evaluated fleet-baseline: 3 of 8 eligible clients made an actual acknowledged transition. UI verification only, not a live migration.');
  assert.equal(page.get('rate').textContent, 'Migration success rate: 3 of 8 = 37.50%');
  assert.equal(page.get('numerator').textContent, 'Numerator 3: clients with an ACTUAL_TRANSITION, an acknowledged old-to-new version change in its required order.');
  assert.equal(page.get('denominator').textContent, 'Denominator 8: eligible clients that started on the old version 1.0.0, plus clients whose start cannot be proven (never excluded).');
  assert.equal(page.get('counts').textContent, 'Next to the rate: unchanged 2 (new version only, outside the rate) | failed 1 | unknown 1 | not transitioned yet 3 | 10 clients in the set');
  assert.equal(page.get('error').textContent, '');
  assert.equal(page.rows().length, 10);
  assert.deepEqual(page.rows().map((row) => row.dataset.classification), ['ACTUAL_TRANSITION', 'ACTUAL_TRANSITION', 'ACTUAL_TRANSITION',
    'NOT_TRANSITIONED_YET', 'NOT_TRANSITIONED_YET', 'NOT_TRANSITIONED_YET', 'FAILED_OR_UNKNOWN', 'FAILED_OR_UNKNOWN', 'UNCHANGED', 'UNCHANGED']);
  assert.deepEqual(page.rows().map((row) => row.dataset.failure), ['NONE', 'NONE', 'NONE', 'NONE', 'NONE', 'NONE', 'FAILED', 'UNKNOWN', 'NONE', 'NONE']);
  assert.match(page.get('provenance').textContent, /"kind": "saved-synthetic-fleet"/);
  assert.deepEqual(page.get('inspection-history').children.map((item) => item.textContent),
    ['1. evaluate / fleet-baseline: 3/8 = 37.50%, unchanged 2, failed 1, unknown 1']);
});

test('each table row shows class, failure kind, reason, versions, eligibility, counting and the evidence order', (t) => {
  const page = load(t);
  page.choose('fleet-baseline');
  const [transition, , , , , , failed, , unchanged] = page.rows();
  assert.deepEqual(page.cells(transition).slice(0, 7), ['client-001', 'ACTUAL_TRANSITION', 'none',
    'TRANSITION_EVIDENCE_COMPLETE: Request at the old version, then a valid server acknowledgment of the new version, then a request or state at the new version.',
    '1.0.0 to 2.0.0', 'yes: STARTED_ON_OLD_VERSION', 'numerator yes, denominator yes']);
  assert.match(page.cells(transition)[7], /^request at 1\.0\.0 \(seq 1\), acknowledged 2\.0\.0 \(seq 4\), then STATE at 2\.0\.0 \(seq 5\)$/);
  assert.deepEqual(page.cells(failed).slice(1, 3), ['FAILED_OR_UNKNOWN', 'FAILED']);
  assert.equal(page.cells(failed)[7], 'UNKNOWN_PROFILE');
  assert.deepEqual(page.cells(unchanged).slice(1, 7).filter((_, index) => [0, 4, 5].includes(index)), ['UNCHANGED', 'no: STARTED_ON_NEW_VERSION_NOT_ELIGIBLE', 'numerator no, denominator no']);
  assert.equal(page.cells(unchanged)[7], 'No transition evidence');
  const details = transition.children[7].children.find((node) => node.tag === 'details');
  assert.equal(details.children[0].textContent, 'Inspect saved actions');
  assert.equal(JSON.parse(details.children[1].textContent).length, 5);
});

test('a flood of unchanged clients keeps the rate and shows 42 unchanged next to it', (t) => {
  const page = load(t);
  page.choose('negative-unchanged-flood');
  assert.equal(page.get('rate').textContent, 'Migration success rate: 3 of 8 = 37.50%');
  assert.match(page.get('counts').textContent, /unchanged 42 \(new version only, outside the rate\) \| failed 1 \| unknown 1 \| not transitioned yet 3 \| 50 clients/);
  assert.equal(page.rows().length, 50);
});

test('compare shows baseline and set numbers, the decision and at most twelve changed clients', (t) => {
  const page = load(t);
  page.choose('negative-unchanged-flood', 'compare');
  const parts = page.get('comparison').children;
  assert.equal(parts[0].textContent, 'Baseline fleet-baseline: 3 of 8 = 37.50%. This set negative-unchanged-flood: 3 of 8 = 37.50%. Rate raised: no. Numerator increased: no. Decision: NOT_RAISED.');
  assert.equal(parts[1].children.length, 12);
  assert.equal(parts[1].children[0].textContent, 'added flood-001: UNCHANGED / UNCHANGED_NEW_VERSION_ONLY (not eligible, outside the rate)');
  assert.equal(parts[2].textContent, '28 more changed or added clients are in the table above.');
  assert.equal(page.get('inspection-history').children[0].textContent.startsWith('1. compare / negative-unchanged-flood: 3/8'), true);
});

test('compare of a small negative lists every changed client with its reason code and no overflow line', (t) => {
  const page = load(t);
  page.choose('negative-replayed-v2-request', 'compare');
  const parts = page.get('comparison').children;
  assert.match(parts[0].textContent, /This set negative-replayed-v2-request: 3 of 10 = 30\.00%\. Rate raised: no\. Numerator increased: no\. Decision: NOT_RAISED\.$/);
  assert.deepEqual(parts[1].children.map((item) => item.textContent), [
    'added replayed-001: FAILED_OR_UNKNOWN / UNACKNOWLEDGED_NEW_VERSION_REQUEST',
    'added replayed-002: FAILED_OR_UNKNOWN / STATE_BEFORE_ACKNOWLEDGMENT']);
  assert.equal(parts.length, 2);
});

test('duplicated traces name their copies: the collapsed exact copy and the conflicting pair', (t) => {
  const page = load(t);
  page.choose('negative-duplicated-trace', 'compare');
  assert.deepEqual(page.get('comparison').children[1].children.map((item) => item.textContent), [
    'changed client-001: ACTUAL_TRANSITION / TRANSITION_EVIDENCE_COMPLETE (2 saved trace copies)',
    'changed client-004: FAILED_OR_UNKNOWN / CONFLICTING_DUPLICATE_TRACES (2 saved trace copies)',
    'added duplicate-001: FAILED_OR_UNKNOWN / DUPLICATE_ACK']);
  const cells = (id) => page.cells(page.rows().find((row) => row.dataset.client === id));
  assert.match(cells('client-001')[7], /DUPLICATE_TRACE_COLLAPSED/);
  assert.match(cells('client-001')[7], /2 saved copies of this trace/);
  assert.match(cells('client-004')[7], /^2 saved copies of this trace/);
});

test('compare of a set that is not a negative reports it, and the set itself is still shown', (t) => {
  const page = load(t);
  page.choose('fleet-baseline', 'compare');
  assert.equal(page.get('comparison').children[0].textContent, 'Comparison unavailable: COMPARISON_REQUIRES_NEGATIVE_FLEET.');
  assert.equal(page.rows().length, 10);
});

test('the saved C034 history shows three of seven with failed, unknown and the save-gap notes', (t) => {
  const page = load(t);
  page.choose('c034-closed-history');
  assert.equal(page.get('rate').textContent, 'Migration success rate: 3 of 7 = 42.86%');
  assert.match(page.get('counts').textContent, /unchanged 0 .* \| failed 1 \| unknown 3 \| not transitioned yet 0 \| 7 clients/);
  assert.match(page.cells(page.rows()[2])[7], /ISSUE_TIME_NOT_SAVED; ORIGINAL_BUDGET_EXCEEDED_SEPARATE_VERDICT$/);
  assert.equal(page.cells(page.rows()[4])[4], 'unproven to none');
  assert.equal(page.cells(page.rows()[6])[3].split(':')[0], 'SUMMARY_ONLY_NO_TRACE');
  assert.match(page.get('provenance').textContent, /"kind": "c034-saved-trace-adapted-read-only"/);
  assert.match(page.get('provenance').textContent, /"migrationAttested": false/);
});

test('no selection or an unknown set is rejected: no rows, no success rate, the code is shown and retained', (t) => {
  const page = load(t);
  page.choose('');
  assert.equal(page.get('status').dataset.state, 'REJECTED');
  assert.equal(page.get('status').textContent, 'Rejected: nothing is adopted and no success rate is shown.');
  assert.equal(page.get('rate').textContent, 'No success rate: rejected input or unknown saved set.');
  assert.equal(page.get('error').textContent, 'UNKNOWN_SAVED_ID');
  assert.equal(page.get('numerator').textContent, '');
  assert.equal(page.rows().length, 0);
  assert.deepEqual(page.get('inspection-history').children.map((item) => [item.textContent, item.dataset.state]),
    [['1. evaluate / none: rejected UNKNOWN_SAVED_ID', 'REJECTED']]);
});

test('a set without any eligible client is never shown as 100 percent', (t) => {
  const onlyUnchanged = { bundleVersion: 1, cardId: 'C031', fleets: [
    { id: 'fleet-baseline', role: 'baseline', negativeOf: null, label: 'x', fleet: f.fleet('fleet-baseline', [f.unchanged('u-1'), f.unchangedBusy('u-2')]) }] };
  const page = load(t, { saved: onlyUnchanged });
  page.choose('fleet-baseline');
  assert.equal(page.get('rate').textContent, 'Migration success rate: not defined (0 of 0 eligible clients, never 100 percent)');
  assert.equal(page.get('numerator').textContent.startsWith('Numerator 0:'), true);
  assert.match(page.get('counts').textContent, /unchanged 2 /);
  assert.equal(page.get('inspection-history').children[0].textContent, '1. evaluate / fleet-baseline: 0/0 = not defined, unchanged 2, failed 0, unknown 0');
});

test('without the saved C034 bundle the historical sets fail closed instead of showing anything', (t) => {
  const page = load(t, { c034: undefined });
  page.choose('c034-closed-history');
  assert.equal(page.get('error').textContent, 'UNKNOWN_SAVED_ID');
  assert.equal(page.rows().length, 0);
  page.choose('fleet-baseline');
  assert.equal(page.get('status').dataset.state, 'EVALUATED');
});

test('reset changes only the presentation, returns focus to the picker and keeps the operation history', (t) => {
  const page = load(t);
  page.choose('negative-out-of-order', 'compare');
  assert.ok(page.rows().length > 0);
  page.click('reset');
  assert.equal(page.get('status').dataset.state, 'UNASSESSED');
  assert.equal(page.get('status').textContent, staticText('status'), 'reset restores exactly the static initial text of index.html');
  assert.equal(page.get('rate').textContent, staticText('rate'));
  assert.deepEqual([page.rows().length, page.get('comparison').children.length, page.get('provenance').textContent, page.get('counts').textContent,
    page.get('numerator').textContent, page.get('denominator').textContent, page.get('error').textContent], [0, 0, '', '', '', '', '']);
  assert.equal(page.document.activeElement, page.get('source-id'));
  assert.equal(page.get('source-id').value, 'negative-out-of-order');
  assert.equal(page.get('inspection-history').children.length, 1);
});

test('after sixteen operations further evaluations are refused, not dropped, and history is never evicted', (t) => {
  const page = load(t);
  for (let count = 0; count < 16; count++) page.choose(count % 2 ? 'negative-stale-cached-ack' : 'fleet-baseline', count % 3 ? 'evaluate' : 'compare');
  assert.equal(page.get('inspection-history').children.length, 16);
  assert.equal(page.get('evaluate').disabled, true);
  assert.equal(page.get('compare').disabled, true);
  assert.equal(page.get('history-limit').textContent, '16 operations retained. Further evaluations are refused, not dropped; reset does not erase history.');
  const before = page.get('rate').textContent;
  page.choose('c034-closed-history');
  page.choose('c034-held-snapshot', 'compare');
  assert.equal(page.get('inspection-history').children.length, 16);
  assert.equal(page.get('rate').textContent, before);
  page.click('reset');
  assert.equal(page.get('inspection-history').children.length, 16);
  assert.equal(page.get('evaluate').disabled, true);
});

test('without the evaluator the page shows an error, disables the actions and adopts nothing', (t) => {
  const page = load(t, { evaluator: undefined });
  assert.equal(page.get('error').textContent, 'ACCEPTED_DEPENDENCIES_UNAVAILABLE');
  assert.equal(page.get('status').dataset.state, 'REJECTED');
  assert.equal(page.get('evaluate').disabled, true);
  assert.equal(page.get('compare').disabled, true);
  assert.equal(page.get('evaluate').listeners.size, 0);
  assert.equal(page.rows().length, 0);
});

test('every select option in index.html is a catalog id, and every catalog id has an option', (t) => {
  const page = load(t);
  const values = [...html.matchAll(/<option value="([^"]*)"/g)].map((match) => match[1]).filter(Boolean);
  const catalog = evaluator.create({ saved, c034: bundle });
  assert.deepEqual([...values].sort(), [...catalog.ids].sort());
  assert.ok(page.get('source-id'));
});
