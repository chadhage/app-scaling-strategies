'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const T = require('..\\tables.js');
const saved = require('..\\saved.js');
const { createDocument, html } = require('.\\dom-stub.cjs');

const pagePath = require.resolve('..\\page.js');
const globals = ['document', 'C040Tables', 'C040Saved'];
const catalog = T.catalog(saved);

// page.js is browser-only code: it runs here against a stub document built from the real index.html.
function load(t, options = {}) {
  const document = createDocument(html);
  globalThis.document = document;
  globalThis.C040Tables = Object.hasOwn(options, 'tables') ? options.tables : T;
  globalThis.C040Saved = Object.hasOwn(options, 'saved') ? options.saved : saved;
  for (const name of globals) if (globalThis[name] === undefined) delete globalThis[name];
  t.after(() => { for (const name of globals) delete globalThis[name]; });
  delete require.cache[pagePath];
  try { require(pagePath); } finally { delete require.cache[pagePath]; }
  const get = (id) => document.getElementById(id);
  const page = {
    document, get,
    rows: () => Array.from(get('rows').children),
    counts: () => Object.fromEntries(Array.from(get('status-counts').children).map((item) => [item.dataset.status, Number(item.dataset.count)])),
    cells: (row) => row.children.map((cell) => cell.textContent),
    choose(id) { get('saved-set').value = id; get('load').dispatch('click'); },
    tab: (id) => get(`tab-${id}`),
    key(id, key) {
      const event = { key, prevented: false, preventDefault() { this.prevented = true; } };
      get(`tab-${id}`).dispatch('keydown', event);
      return event;
    },
    pick(id, value) { get(id).value = value; get(id).dispatch('change'); },
    search(value) { get('search').value = value; get('search').dispatch('input'); },
    options: (id) => get(id).children.map((item) => item.value),
    selectedTab: () => T.tableIds.filter((id) => get(`tab-${id}`).getAttribute('aria-selected') === 'true')
  };
  return page;
}

test('the initial display is unloaded, assumes no success and shows no rows', (t) => {
  const page = load(t);
  assert.equal(page.get('status').dataset.state, 'UNLOADED');
  assert.equal(page.get('status').textContent, `Ready. No saved set is loaded. Nothing is assumed to have passed.`);
  assert.equal(page.get('summary').textContent, 'No saved set is loaded: 0 of 0 rows are shown and nothing is assumed to have passed.');
  assert.equal(page.rows().length, 0);
  assert.equal(page.get('status-counts').children.length, 0);
  assert.equal(page.get('caption').textContent, 'No saved set is loaded');
  for (const id of ['sort-column', 'sort-direction', 'status-filter', 'search']) assert.equal(page.get(id).disabled, true, id);
  assert.equal(page.get('load').disabled, false);
  assert.deepEqual(page.selectedTab(), ['cohort']);
  assert.equal(page.get('table-title').textContent, 'Cohort table');
  assert.equal(page.get('error').textContent, '');
});

test('the saved-set picker lists every saved set once, grouped by role, with no default choice', (t) => {
  const page = load(t);
  assert.match(html, /<select id="saved-set">\s*<option value="">Choose a saved set; no default success<\/option>\s*<\/select>/, 'the markup starts on an empty choice');
  const groups = page.get('saved-set').children;
  assert.deepEqual(groups.map((group) => group.label), ['Saved accepted history', 'Fictional baseline', 'Fictional negatives']);
  assert.deepEqual(groups.flatMap((group) => group.children.map((item) => item.value)), catalog.ids);
  assert.deepEqual(groups.flatMap((group) => group.children.map((item) => item.textContent)), catalog.ids.map((id) => catalog.describe(id).label));
});

test('choosing nothing and pressing load rejects with a code and shows no table', (t) => {
  const page = load(t);
  page.get('load').dispatch('click');
  assert.equal(page.get('error').textContent, 'UNKNOWN_SAVED_SET');
  assert.equal(page.get('status').dataset.state, 'UNLOADED');
  assert.equal(page.get('status').textContent, 'The saved set could not be loaded. No saved set is loaded. Nothing is assumed to have passed.');
  assert.equal(page.rows().length, 0);
  page.choose('closed-history');
  assert.equal(page.get('error').textContent, '', 'a later successful load clears the code');
  page.get('saved-set').value = '';
  page.get('load').dispatch('click');
  assert.equal(page.get('error').textContent, 'UNKNOWN_SAVED_SET');
  assert.equal(page.rows().length, 0, 'a failed load does not leave the previous table on screen');
});

test('loading the closed history shows 7 clients with their status text, the summary, the counts and the producer numbers', (t) => {
  const page = load(t);
  page.choose('closed-history');
  const view = T.view(catalog.tables('closed-history').cohort);
  assert.equal(page.get('status').dataset.state, 'COMPLETE');
  assert.equal(page.get('status').textContent, `Loaded saved set closed-history. ${view.announcement}`);
  assert.equal(page.get('summary').textContent, view.summary);
  assert.match(page.get('summary').textContent, /showing 7 of 7 rows, COMPLETE/);
  assert.deepEqual(page.get('summary').dataset, { state: 'COMPLETE', total: '7', shown: '7' });
  assert.equal(page.get('producer-line').textContent, 'Producer C031 says: 3 of 7 eligible clients = 42.86%; eligible 7, actual transitions 3, clients 7.');
  assert.deepEqual(page.counts(), { ACTUAL_TRANSITION: 3, UNCHANGED: 0, NOT_TRANSITIONED_YET: 0, FAILED: 1, UNKNOWN: 3, NOT_SAVED: 0 });
  assert.equal(page.rows().length, 7);
  assert.deepEqual(page.rows().map((row) => row.dataset.kind), ['success', 'success', 'success', 'failed', 'unknown', 'unknown', 'unknown']);
  assert.deepEqual(page.rows().map((row) => row.id), Array.from({ length: 7 }, (_, index) => `row-${index + 1}`));
  const failed = page.rows()[3];
  assert.equal(failed.dataset.attention, 'true');
  assert.equal(page.cells(failed)[2], 'FAILED (needs attention)');
  assert.match(page.cells(failed)[3], /^FAILED_REPLY: /);
  assert.equal(page.cells(page.rows()[0])[2], 'ACTUAL_TRANSITION');
  assert.equal(page.get('caption').textContent, 'Cohort table of saved set closed-history: 7 of 7 rows, COMPLETE');
  assert.equal(page.get('error').textContent, '');
  assert.deepEqual(page.get('head').children.map((cell) => cell.textContent), T.columns.cohort.map((column) => column.label));
  assert.ok(page.get('head').children.every((cell) => cell.scope === 'col'));
  assert.deepEqual(page.get('head').children.map((cell) => cell.getAttribute('aria-sort')), ['ascending', 'none', 'none', 'none', 'none', 'none', 'none', 'none']);
  assert.match(page.get('provenance').textContent, /"kind": "producer-saved-output"/);
  assert.match(page.get('provenance').textContent, /"id": "c034-closed-history"/);
  for (const id of ['sort-column', 'sort-direction', 'status-filter', 'search']) assert.equal(page.get(id).disabled, false, id);
  assert.deepEqual(page.options('status-filter'), ['all', 'attention', 'success', 'ACTUAL_TRANSITION', 'UNCHANGED', 'NOT_TRANSITIONED_YET', 'FAILED', 'UNKNOWN']);
  assert.deepEqual(page.options('sort-column'), T.columns.cohort.map((column) => column.key));
  assert.equal(page.get('status-filter').value, 'all', 'success only is not the default');
});

test('the tablist moves with the arrow keys, Home and End, wraps around, keeps one selected tab with a roving tab stop and resets the controls', (t) => {
  const page = load(t);
  page.choose('closed-history');
  page.pick('status-filter', 'FAILED');
  assert.equal(page.get('status-filter').value, 'FAILED');
  const tabStops = () => T.tableIds.map((id) => page.tab(id).getAttribute('tabindex')).join(',');
  assert.equal(tabStops(), '0,-1,-1');
  const right = page.key('cohort', 'ArrowRight');
  assert.equal(right.prevented, true);
  assert.deepEqual(page.selectedTab(), ['effect']);
  assert.equal(page.document.activeElement, page.tab('effect'));
  assert.equal(tabStops(), '-1,0,-1');
  assert.equal(page.get('panel').getAttribute('aria-labelledby'), 'tab-effect');
  assert.equal(page.get('table-title').textContent, 'Effect table');
  assert.equal(page.get('status-filter').value, 'all', 'switching tables puts sort, filter and search back to the defaults');
  assert.equal(page.rows().length, 7, 'seven originals, one UNKNOWN row each');
  assert.match(page.get('status').textContent, /^Switched to the Effect table; sort, filter and search are back to their defaults\. Effect table: showing 7 of 7 rows/);
  page.key('effect', 'ArrowRight');
  assert.deepEqual(page.selectedTab(), ['latency']);
  page.key('latency', 'ArrowRight');
  assert.deepEqual(page.selectedTab(), ['cohort'], 'ArrowRight wraps to the first tab');
  page.key('cohort', 'ArrowLeft');
  assert.deepEqual(page.selectedTab(), ['latency'], 'ArrowLeft wraps to the last tab');
  page.key('latency', 'Home');
  assert.deepEqual(page.selectedTab(), ['cohort']);
  page.key('cohort', 'End');
  assert.deepEqual(page.selectedTab(), ['latency']);
  assert.equal(page.document.activeElement, page.tab('latency'));
  const other = page.key('latency', 'a');
  assert.equal(other.prevented, false, 'other keys are left alone');
  assert.deepEqual(page.selectedTab(), ['latency']);
  page.tab('cohort').dispatch('click');
  assert.deepEqual(page.selectedTab(), ['cohort']);
  assert.equal(page.get('table-title').textContent, 'Cohort table');
});

test('switching tables before anything is loaded changes only the selected tab and says nothing is loaded', (t) => {
  const page = load(t);
  page.key('cohort', 'ArrowRight');
  assert.deepEqual(page.selectedTab(), ['effect']);
  assert.equal(page.get('table-title').textContent, 'Effect table');
  assert.equal(page.get('status').textContent, 'Switched to the Effect table; sort, filter and search are back to their defaults. No saved set is loaded. Nothing is assumed to have passed.');
  assert.equal(page.rows().length, 0);
});

test('sorting by a column and a direction reorders the rows, marks the header and an announcement follows, and no row is lost', (t) => {
  const page = load(t);
  page.choose('closed-history');
  page.pick('sort-column', 'status');
  assert.deepEqual(page.rows().map((row) => row.dataset.status), ['ACTUAL_TRANSITION', 'ACTUAL_TRANSITION', 'ACTUAL_TRANSITION', 'FAILED', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN']);
  assert.equal(page.get('status').textContent.startsWith('Sorted by Status, ascending. Cohort table: showing 7 of 7 rows'), true);
  page.pick('sort-direction', 'desc');
  assert.deepEqual(page.rows().map((row) => row.dataset.status), ['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'FAILED', 'ACTUAL_TRANSITION', 'ACTUAL_TRANSITION', 'ACTUAL_TRANSITION']);
  assert.match(page.get('status').textContent, /^Sorted by Status, descending\./);
  assert.equal(page.get('head').children[2].getAttribute('aria-sort'), 'descending');
  assert.equal(page.get('head').children[0].getAttribute('aria-sort'), 'none');
  assert.equal(page.rows().length, 7);
  assert.equal(page.rows().filter((row) => row.dataset.attention === 'true').length, 4);
  assert.equal(page.get('error').textContent, '');
});

test('the status filter success keeps 3 failed and 2 unknown rows among 40 successes and says so in the note and the live announcement', (t) => {
  const page = load(t);
  page.choose('negative-3-failed-2-unknown-of-40');
  assert.equal(page.rows().length, 45);
  assert.deepEqual(page.counts(), { ACTUAL_TRANSITION: 40, UNCHANGED: 0, NOT_TRANSITIONED_YET: 0, FAILED: 3, UNKNOWN: 2, NOT_SAVED: 0 });
  page.pick('status-filter', 'success');
  assert.equal(page.rows().length, 45);
  assert.equal(page.rows().filter((row) => row.dataset.attention === 'true').length, 5);
  assert.equal(page.get('filter-note').textContent, 'The filter "success" alone would have hidden 3 FAILED and 2 UNKNOWN rows: failed and unknown rows are never hidden, so they stay visible. Choose "All statuses", clear the search and use all pages to show every row.');
  assert.match(page.get('status').textContent, /^Status filter changed\. Cohort table: showing 45 of 45 rows, COMPLETE\./);
  assert.match(page.get('status').textContent, /alone would have hidden 3 FAILED and 2 UNKNOWN rows/);
  assert.deepEqual(page.rows().filter((row) => row.dataset.kind !== 'success').map((row) => page.cells(row)[2]),
    ['FAILED (needs attention)', 'UNKNOWN (needs attention)', 'FAILED (needs attention)', 'FAILED (needs attention)', 'UNKNOWN (needs attention)']);
  page.pick('status-filter', 'all');
  assert.equal(page.get('filter-note').textContent, '');
});

test('a filter that hides rows says how many and which statuses on the page, and the failed and unknown rows stay', (t) => {
  const page = load(t);
  page.choose('fiction-failed-then-retry');
  assert.equal(page.rows().length, 10);
  page.pick('status-filter', 'success');
  assert.equal(page.rows().length, 5);
  assert.match(page.get('filter-note').textContent, /^The filter "success" hides 5 rows: UNCHANGED 2, NOT_TRANSITIONED_YET 3\. It would also have hidden 1 FAILED and 1 UNKNOWN rows/);
  assert.equal(page.rows().filter((row) => row.dataset.attention === 'true').length, 2);
  assert.deepEqual(page.get('summary').dataset, { state: 'COMPLETE', total: '10', shown: '5' });
  assert.equal(Object.values(page.counts()).reduce((sum, value) => sum + value, 0), 10, 'the counts describe the whole table, not the filtered view');
  page.pick('status-filter', 'attention');
  assert.equal(page.rows().length, 2);
});

test('a search hides only success and neutral rows and says so', (t) => {
  const page = load(t);
  page.choose('negative-3-failed-2-unknown-of-40');
  page.search('zzz no match');
  assert.equal(page.rows().length, 5);
  assert.match(page.get('filter-note').textContent, /^The search "zzz no match" hides 40 rows: ACTUAL_TRANSITION 40\./);
  assert.match(page.get('status').textContent, /^Search for "zzz no match"\./);
  page.search('client-001');
  assert.equal(page.rows().length, 6);
  page.search('   ');
  assert.match(page.get('status').textContent, /^Search cleared\./);
  assert.equal(page.rows().length, 45);
  assert.equal(page.get('filter-note').textContent, '');
});

test('an empty saved set says no attempts recorded on the page in all three tables, never all passed', (t) => {
  const page = load(t);
  page.choose('negative-empty');
  for (const id of T.tableIds) {
    page.tab(id).dispatch('click');
    assert.equal(page.get('summary').dataset.state, 'EMPTY', id);
    assert.match(page.get('summary').textContent, /no attempts recorded \(showing 0 of 0 rows\)/);
    assert.doesNotMatch(page.get('status').textContent, /all passed|100/i);
    assert.equal(page.rows().length, 0);
    assert.equal(Object.values(page.counts()).reduce((sum, value) => sum + value, 0), 0);
    assert.equal(page.get('error').textContent, '');
  }
});

test('a truncated saved set says INCOMPLETE with the producer total and shows NOT_SAVED in the counts', (t) => {
  const page = load(t);
  page.choose('negative-truncated');
  assert.equal(page.get('summary').dataset.state, 'INCOMPLETE');
  assert.deepEqual(page.get('summary').dataset, { state: 'INCOMPLETE', total: '10', shown: '4' });
  assert.match(page.get('summary').textContent, /INCOMPLETE, showing 4 of 10 rows/);
  assert.equal(page.counts().NOT_SAVED, 6);
  assert.equal(Object.values(page.counts()).reduce((sum, value) => sum + value, 0), 10);
  assert.equal(page.rows().length, 4);
  assert.equal(page.get('error').textContent, '');
});

test('a duplicated row is shown twice with the flag, each with its own unique page identifier', (t) => {
  const page = load(t);
  page.choose('negative-duplicated-row');
  assert.equal(page.get('summary').dataset.state, 'INCONSISTENT');
  const copies = page.rows().filter((row) => row.dataset.rowId === 'client-007');
  assert.equal(copies.length, 2);
  assert.deepEqual(copies.map((row) => row.dataset.flags), ['DUPLICATE_ROW', 'DUPLICATE_ROW']);
  assert.equal(new Set(page.rows().map((row) => row.id)).size, page.rows().length);
  assert.equal(page.get('error').textContent, '');
  assert.match(page.cells(copies[0]).at(-1), /DUPLICATE_ROW/);
});

test('a status the inspector does not recognise is displayed as UNKNOWN with a flag', (t) => {
  const page = load(t);
  page.choose('negative-unrecognised-status');
  const row = page.rows().find((item) => item.dataset.flags.includes('UNRECOGNISED_STATUS'));
  assert.ok(row);
  assert.equal(row.dataset.status, 'UNKNOWN');
  assert.equal(row.dataset.attention, 'true');
  assert.equal(page.cells(row)[2], 'UNKNOWN (needs attention)');
});

test('the retry set shows the failed first original in the effect and latency tables with the retry flag', (t) => {
  const page = load(t);
  page.choose('fiction-failed-then-retry');
  page.key('cohort', 'ArrowRight');
  assert.deepEqual(page.rows().map((row) => row.dataset.status), ['ONE_INTENDED_EFFECT', 'ONE_INTENDED_EFFECT', 'MISSING', 'ONE_INTENDED_EFFECT', 'ONE_INTENDED_EFFECT', 'ONE_INTENDED_EFFECT']);
  assert.deepEqual(page.get('head').children.map((cell) => cell.textContent).slice(1, 6),
    ['Original', 'Intended effect key', 'Applications, lower bound', 'Applications, upper bound', 'Delivery count']);
  assert.equal(page.cells(page.rows()[2])[2], 'job-c030-fiction|profile-effects/1|synthetic-002|completion-receipt');
  page.key('effect', 'ArrowRight');
  assert.deepEqual(page.rows().map((row) => row.dataset.status), ['EXCEEDED', 'WITHIN']);
  assert.match(page.cells(page.rows()[0])[5], /^yes: kept in the producer denominator, a retry cannot hide it$/);
  assert.equal(page.cells(page.rows()[0])[2], '1000 ms');
  assert.equal(page.cells(page.rows()[0])[3], '1000.25 ms');
});

test('reset clears only the display, returns focus to the picker and keeps the chosen table; reloading shows everything again', (t) => {
  const page = load(t);
  page.choose('closed-history');
  page.key('cohort', 'ArrowRight');
  page.get('reset').dispatch('click');
  assert.equal(page.document.activeElement, page.get('saved-set'));
  assert.equal(page.get('saved-set').value, '');
  assert.equal(page.rows().length, 0);
  assert.equal(page.get('status').dataset.state, 'UNLOADED');
  assert.equal(page.get('status').textContent, 'Display reset. No saved set is loaded. Nothing is assumed to have passed.');
  assert.deepEqual(page.selectedTab(), ['effect']);
  assert.equal(page.get('error').textContent, '');
  assert.equal(page.get('search').disabled, true);
  page.pick('sort-column', 'status');
  assert.equal(page.rows().length, 0, 'a control event with nothing loaded changes nothing');
  page.choose('closed-history');
  assert.equal(page.rows().length, 7);
  assert.deepEqual(page.selectedTab(), ['effect']);
});

test('the page re-reads what it rendered and raises an alert when the counts, the rows or the identifiers disagree', (t) => {
  const wrap = (change) => ({ ...T, view: (table, query) => change(T.view(table, query)) });
  const bad = (change) => {
    const page = load(t, { tables: wrap(change) });
    page.choose('closed-history');
    return page;
  };
  const counts = bad((view) => ({ ...view, statusCounts: { ...view.statusCounts, FAILED: 9 } }));
  assert.match(counts.get('error').textContent, /^PAGE_CHECK_FAILED: the rendered status counts add up to 15, not to the total 7$/);
  assert.equal(counts.get('status').dataset.state, 'INCONSISTENT');
  assert.match(counts.get('status').textContent, /^INCONSISTENT PAGE: Loaded saved set closed-history\./);
  const hidden = bad((view) => ({ ...view, rows: view.rows.filter((row) => row.status !== 'FAILED'), shown: view.shown - 1 }));
  assert.match(hidden.get('error').textContent, /3 failed or unknown rows are rendered but the table holds 4/);
  const repeated = bad((view) => ({ ...view, rows: [...view.rows, view.rows[0]], shown: view.shown + 1 }));
  assert.match(repeated.get('error').textContent, /rendered row identifiers are not unique/);
  const count = bad((view) => ({ ...view, shown: 3 }));
  assert.match(count.get('error').textContent, /7 rows are rendered but the summary says 3/);
});

test('without the accepted model or saved sets the page fails closed with a code and no table', (t) => {
  for (const options of [{ tables: undefined }, { saved: undefined }]) {
    const page = load(t, options);
    assert.equal(page.get('status').dataset.state, 'REJECTED');
    assert.equal(page.get('error').textContent, 'ACCEPTED_SAVED_SETS_UNAVAILABLE');
    assert.equal(page.get('load').disabled, true);
    assert.equal(page.rows().length, 0);
  }
});

test('a saved set that cannot be built reports its code, or a generic one, and shows nothing', (t) => {
  const failing = (error) => ({ ...T, catalog: (bundle) => ({ ...T.catalog(bundle), tables: () => { throw error; } }) });
  const coded = load(t, { tables: failing(Object.assign(new Error('x'), { code: 'SOME_CODE' })) });
  coded.choose('closed-history');
  assert.equal(coded.get('error').textContent, 'SOME_CODE');
  assert.equal(coded.rows().length, 0);
  const plain = load(t, { tables: failing(new Error('plain')) });
  plain.choose('closed-history');
  assert.equal(plain.get('error').textContent, 'SAVED_SET_UNAVAILABLE');
});

test('the markup has the exact banner, a strict content security policy, no inline script and a labelled tablist and controls', () => {
  assert.match(html, /<p id="banner" class="banner">Training rehearsal - synthetic data - not a live Azure result<\/p>/);
  const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.equal(policy, "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'");
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.deepEqual(scripts.map((script) => /src="([^"]+)"/.exec(script[1])[1]), ['tables.js', 'saved.js', 'page.js']);
  assert.ok(scripts.every((script) => script[2] === '' && /\sdefer\b/.test(script[1])), 'no inline script, every script deferred');
  assert.doesNotMatch(html, /\son[a-z]+="|javascript:|<style|style="/i);
  assert.match(html, /<div id="tablist" role="tablist" aria-label="Result tables">/);
  assert.deepEqual([...html.matchAll(/role="tab"/g)].length, 3);
  assert.match(html, /<div id="panel" role="tabpanel" aria-labelledby="tab-cohort" tabindex="0">/);
  assert.match(html, /<p id="status" role="status" aria-live="polite"/);
  assert.match(html, /<p id="error" role="alert">/);
  for (const id of ['saved-set', 'sort-column', 'sort-direction', 'status-filter', 'search']) assert.match(html, new RegExp(`<label for="${id}">`), id);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'every id in the markup is unique');
  assert.match(html, /production Node 24, Express, Entra and any real service are neither validated nor registered/);
});

// Stateful property test of the page: a seeded random walk over every user operation, including the recovery operations (reset, reload of
// the same or another set, a refused load, a table switch by key), with the global invariant read back from the DOM after EVERY step.
function walker(seed) {
  let state = seed >>> 0;
  return (limit) => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0;
    return state % limit;
  };
}
test('a seeded random walk over the page keeps every failed and unknown row on screen, the counts reconciled and the identifiers unique after each operation', (t) => {
  let operations = 0;
  const texts = ['', 'client', 'zzz no match', 'FAILED', 'original', '1', '  ', 'journey'];
  for (const seed of [11, 12, 13, 14]) {
    const next = walker(seed);
    const page = load(t);
    for (let step = 0; step < 150; step++) {
      const choice = next(11);
      if (choice === 0 || choice === 1) page.choose(catalog.ids[next(catalog.ids.length)]);
      else if (choice === 2) page.get('tab-' + T.tableIds[next(3)]).dispatch('click');
      else if (choice === 3) page.key(T.tableIds[next(3)], ['ArrowRight', 'ArrowLeft', 'Home', 'End', 'x'][next(5)]);
      else if (choice === 4) {
        const values = page.options('sort-column');
        if (values.length) page.pick('sort-column', values[next(values.length)]);
      } else if (choice === 5) page.pick('sort-direction', ['asc', 'desc'][next(2)]);
      else if (choice === 6) {
        const values = page.options('status-filter');
        if (values.length) page.pick('status-filter', values[next(values.length)]);
      } else if (choice === 7) page.search(texts[next(texts.length)]);
      else if (choice === 8) page.get('reset').dispatch('click');
      else if (choice === 9) { page.get('saved-set').value = ''; page.get('load').dispatch('click'); }
      else page.choose(page.get('saved-set').value || catalog.ids[0]);
      operations += 1;
      const rows = page.rows();
      const identifiers = rows.map((row) => row.id);
      assert.equal(new Set(identifiers).size, identifiers.length, `seed ${seed} step ${step}: row identifiers repeat`);
      assert.equal(page.selectedTab().length, 1);
      assert.equal(page.tab(page.selectedTab()[0]).getAttribute('tabindex'), '0');
      const loaded = page.get('summary').dataset.state !== 'UNLOADED';
      if (!loaded) {
        assert.equal(rows.length, 0);
        assert.equal(page.get('status-counts').children.length, 0);
        assert.match(page.get('summary').textContent, /^No saved set is loaded: 0 of 0 rows/);
        continue;
      }
      const { total, shown } = page.get('summary').dataset;
      assert.equal(Object.values(page.counts()).reduce((sum, value) => sum + value, 0), Number(total), `seed ${seed} step ${step}: counts do not add up`);
      assert.equal(rows.length, Number(shown));
      assert.equal(page.get('error').textContent, '', `seed ${seed} step ${step}`);
      assert.ok(page.get('status').textContent.includes(`of ${total} rows`));
      const table = catalog.tables(page.get('saved-set').value)[page.selectedTab()[0]];
      const rendered = new Set(rows.map((row) => Number(row.dataset.position)));
      for (const row of table.rows.filter((item) => item.attention)) assert.ok(rendered.has(row.position), `seed ${seed} step ${step}: ${row.id} disappeared`);
      assert.equal(rows.filter((row) => row.dataset.attention === 'true').length, table.rows.filter((row) => row.attention).length);
    }
  }
  assert.equal(operations, 600);
});
