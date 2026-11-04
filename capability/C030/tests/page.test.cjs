'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const detector = require('..\\detector.js');
const { createDocument, html } = require('.\\dom-stub.cjs');
const pagePath = require.resolve('..\\page.js');

// page.js is browser-only code: it runs here against a stub document built from the real index.html.
function load(t, api = detector) {
  const document = createDocument(html);
  globalThis.document = document;
  globalThis.C030EffectDetector = api;
  t.after(() => { delete globalThis.document; delete globalThis.C030EffectDetector; });
  delete require.cache[pagePath];
  try { require(pagePath); } finally { delete require.cache[pagePath]; }
  const get = (id) => document.getElementById(id);
  return { document, get, click: (id) => get(id).dispatch('click'),
    inspect(id, action = 'inspect') { get('source-id').value = id; get(action).dispatch('click'); } };
}
const rows = (page) => page.get('originals').descendants().filter((node) => node.tag === 'tr' && node.dataset.effect);

test('the initial display is unassessed, claims no effect and has nothing to copy', (t) => {
  const page = load(t);
  assert.match(page.get('status').textContent, /^Not inspected\. No business effect is being executed\./);
  assert.equal(page.get('status').dataset.decision, 'UNASSESSED');
  assert.equal(page.get('status').dataset.valid, 'false');
  assert.equal(page.get('counts').textContent, 'No verified denominator yet.');
  assert.equal(page.get('copy-result').disabled, true);
  assert.equal(page.get('copy-history').disabled, true);
  assert.equal(page.get('originals').children.length, 0);
});
test('inspect shows the detector verdict, exact counts and one row per intended effect, then retains the operation', (t) => {
  const page = load(t);
  page.inspect('control-one');
  const expected = detector.inspectSource('control-one');
  assert.equal(page.get('status').dataset.decision, 'PASS');
  assert.equal(page.get('status').dataset.valid, 'true');
  assert.match(page.get('status').textContent, /^PASS: bounded local inspection only\. Never a live Azure or external exactly-once result\.$/);
  assert.equal(page.get('counts').textContent, '1 originals: 1 PASS / 0 FAIL / 0 UNKNOWN / 0 UNSUPPORTED');
  assert.match(page.get('current').textContent, /^3 intended effects; 3 confirmed applications \(scoped lower bound\); 0 hypothetical; 3 delivery attempts;/);
  assert.equal(page.get('originals').children.length, 1);
  assert.equal(rows(page).length, 3);
  assert.deepEqual(rows(page).map((row) => [row.dataset.effect, row.dataset.observation]),
    expected.originals[0].effects.map((effect) => [effect.kind, effect.status]));
  assert.equal(page.get('output').value, JSON.stringify(expected, null, 2));
  assert.equal(page.get('copy-result').disabled, false);
  assert.equal(page.get('copy-history').disabled, false);
  assert.deepEqual(page.get('inspection-history').children.map((item) => item.textContent), ['1. inspect: control-one — PASS']);
});
test('historical originals keep the separate C029 budget verdict and show no associated effect rows', (t) => {
  const page = load(t);
  page.inspect('history-closed');
  assert.equal(page.get('status').dataset.decision, 'HOLD');
  assert.equal(page.get('originals').children.length, 7);
  assert.equal(rows(page).length, 0);
  assert.match(page.get('current').textContent, /^No associated effect plan or required application receipts; counts UNOBSERVED, not confirmed zero\.$/);
  const paragraphs = page.get('originals').descendants().filter((node) => node.tag === 'p').map((node) => node.textContent);
  assert.equal(paragraphs.filter((text) => text.startsWith('Unchanged C029 budget verdict:')).length, 7);
});
test('an original without any recorded reason is shown as exactly one scoped application per effect', (t) => {
  const page = load(t);
  page.inspect('control-one');
  const text = page.get('originals').descendants().filter((node) => node.tag === 'p').map((node) => node.textContent);
  assert.ok(text.includes('Exactly one scoped application observed per intended effect.'));
});
test('compare shows the retained prefix before and after, and a non-retry selection is rejected', (t) => {
  const page = load(t);
  page.inspect('control-absence-retry', 'compare');
  assert.match(page.get('comparison').textContent, /^Before: 1 originals: 0 PASS \/ 1 FAIL .* After: 2 originals: 1 PASS \/ 1 FAIL .*Original failures and unknowns retained, not repaired by retry\.$/);
  page.inspect('control-one', 'compare');
  assert.equal(page.get('error').textContent, 'CLOSED_COMPARISON_REQUIRED');
  assert.match(page.get('status').textContent, /rejected; no source adopted/);
  assert.equal(page.get('comparison').textContent, '');
});
test('inspecting without a selection is rejected and never adopts a default success', (t) => {
  const page = load(t);
  page.inspect('');
  assert.equal(page.get('status').dataset.valid, 'false');
  assert.notEqual(page.get('status').dataset.decision, 'PASS');
  assert.ok(page.get('error').textContent.length > 0);
  assert.deepEqual(page.get('inspection-history').children.map((item) => item.textContent.split(': ')[0]), ['1. inspect']);
});
test('inspect exact copy accepts only the byte-exact selected source copy', (t) => {
  const page = load(t);
  page.get('source-id').value = 'control-duplicate-application';
  page.get('candidate').value = detector.sourceJson('control-duplicate-application');
  page.click('inspect-copy');
  assert.equal(page.get('status').dataset.decision, 'FAIL');
  assert.equal(page.get('status').dataset.valid, 'true');
  page.get('candidate').value = detector.sourceJson('control-one');
  page.click('inspect-copy');
  assert.equal(page.get('status').dataset.valid, 'false');
  assert.equal(page.get('error').textContent, 'SOURCE_COPY_MISMATCH');
});
test('load exact copy fills and focuses the candidate, and an unselected source is rejected and retained', (t) => {
  const page = load(t);
  page.get('source-id').value = 'control-one';
  page.click('load-copy');
  assert.equal(page.get('candidate').value, detector.sourceJson('control-one'));
  assert.equal(page.document.activeElement, page.get('candidate'));
  assert.equal(page.get('status').textContent, 'Exact immutable source copy loaded; not yet inspected or adopted.');
  assert.equal(page.get('inspection-history').children.length, 0);
  page.get('source-id').value = '';
  page.click('load-copy');
  assert.equal(page.get('status').dataset.valid, 'false');
  assert.match(page.get('inspection-history').children[0].textContent, /^1\. load-copy-rejected: \(no source\) — /);
});
test('copy result selects only an existing result and copy history exports every retained operation', (t) => {
  const page = load(t);
  page.click('copy-result');
  assert.equal(page.get('output').selected, false);
  assert.equal(page.document.activeElement, null);
  page.click('copy-history');
  assert.equal(page.get('output').value, '');
  page.inspect('control-one');
  page.inspect('control-absence', 'inspect');
  page.click('copy-result');
  assert.equal(page.get('output').selected, true);
  assert.equal(page.document.activeElement, page.get('output'));
  page.get('output').selected = false;
  page.click('copy-history');
  const exported = JSON.parse(page.get('output').value);
  assert.equal(exported.schema, 'C030-display-history/1');
  assert.equal(exported.trainingBanner, detector.banner);
  assert.deepEqual(exported.operations.map((item) => [item.operation, item.action, item.sourceId, item.decision]),
    [[1, 'inspect', 'control-one', 'PASS'], [2, 'inspect', 'control-absence', 'FAIL']]);
  assert.equal(page.get('output').selected, true);
});
test('changing the source or editing the copy clears the previous result; reset clears only the display', (t) => {
  const page = load(t);
  page.inspect('control-one');
  page.get('candidate').value = 'edited';
  page.get('source-id').dispatch('change');
  assert.equal(page.get('candidate').value, '');
  assert.equal(page.get('status').dataset.decision, 'UNASSESSED');
  page.inspect('control-one');
  page.get('candidate').dispatch('input');
  assert.equal(page.get('status').textContent, 'Copy changed; previous inspection cleared. No source adopted.');
  assert.equal(page.get('copy-result').disabled, true);
  page.click('reset');
  assert.equal(page.get('source-id').value, '');
  assert.equal(page.get('candidate').value, '');
  assert.match(page.get('status').textContent, /^Display reset only\. Original\/error history retained;/);
  assert.equal(page.document.activeElement, page.get('source-id'));
  assert.equal(page.get('inspection-history').children.length, 2);
  assert.equal(page.get('copy-history').disabled, false);
});
test('sixteen operations are retained and further inspections are refused, never evicting history', (t) => {
  const page = load(t);
  for (let count = 0; count < 16; count += 1) page.inspect('control-one');
  assert.equal(page.get('inspection-history').children.length, 16);
  for (const id of ['inspect', 'compare', 'load-copy', 'inspect-copy']) assert.equal(page.get(id).disabled, true, id);
  assert.match(page.get('history-limit').textContent, /^16 operations retained\. Additional inspections are refused, not dropped\./);
  page.get('candidate').value = 'unchanged';
  for (const id of ['inspect', 'compare', 'inspect-copy', 'load-copy']) page.click(id);
  assert.equal(page.get('inspection-history').children.length, 16);
  assert.equal(page.get('candidate').value, 'unchanged');
  assert.equal(page.get('copy-history').disabled, false);
});
test('a detector call that throws is shown as a rejected empty-copy inspection', (t) => {
  const throwing = Object.freeze({ ...detector, inspectSource() { throw new Error('unavailable'); } });
  const page = load(t, throwing);
  page.inspect('control-one');
  assert.equal(page.get('status').dataset.valid, 'false');
  assert.equal(page.get('error').textContent, 'REQUIRED_JSON');
  assert.equal(page.get('inspection-history').children.length, 1);
});
