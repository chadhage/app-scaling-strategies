'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const classifier = require('..\\classifier.js');
const observed = require('..\\..\\C015\\observed-snapshot.js');
const pagePath = path.resolve(__dirname, '..', 'page.js');

function element(id) {
  return {
    id, textContent: '', value: '', disabled: false, dataset: {}, children: [], listeners: {}, focusCount: 0,
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); },
    dispatch(type) { return Promise.all((this.listeners[type] || []).map((listener) => listener())); },
    focus() { this.focusCount += 1; },
    replaceChildren(...nodes) { this.children = nodes; },
    append(...nodes) { this.children.push(...nodes); }
  };
}
function loadPage(t) {
  const registry = new Map();
  const document = {
    getElementById(id) { if (!registry.has(id)) registry.set(id, element(id)); return registry.get(id); },
    createElement: (tag) => element(`<${tag}>`)
  };
  const saved = ['document', 'C035Classifier', 'C015ObservedSnapshot'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  Object.assign(globalThis, { document, C035Classifier: classifier, C015ObservedSnapshot: observed });
  delete require.cache[pagePath];
  require(pagePath);
  t.after(() => {
    delete require.cache[pagePath];
    for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  });
  return (id) => document.getElementById(id);
}

test('page: the initial presentation is unassessed, historical only and shows the six required dimensions', (t) => {
  const byId = loadPage(t);
  assert.equal(byId('status').dataset.outcome, 'unassessed');
  assert.match(byId('status').textContent, /Presentation reset or not inspected/);
  assert.match(byId('counts').textContent, /No current presentation denominator/);
  assert.match(byId('dimension-counts').textContent, /context, schema, timing, state, terminal and provenance/);
  assert.match(byId('scope').textContent, /No evidence selected/);
  const context = JSON.parse(byId('context').textContent);
  assert.equal(context.origin, 'BUNDLED_HISTORICAL_C015_PUBLIC_RESTORE_OBSERVATION_ONLY');
  assert.equal(context.actualBrowserDiskRead, false);
  assert.equal(JSON.parse(byId('state').textContent).retainedDecision, 'HOLD');
});
test('page: inspect lists every original with its dimensions and focuses the result heading', async (t) => {
  const byId = loadPage(t);
  byId('source-id').value = 'closed-history';
  await byId('inspect').dispatch('click');
  assert.equal(byId('status').dataset.outcome, 'classified');
  assert.match(byId('status').textContent, /Not actual user mutation success/);
  assert.equal(byId('originals').children.length, 7);
  assert.match(byId('originals').children[0].children[0].textContent, /^\S+: [A-Z]+ \/ (?:PASS|FAIL|HOLD)$/);
  assert.match(byId('counts').textContent, /7 scoped originals = 2 PASS \+ 2 FAIL \+ 3 HOLD/);
  assert.match(byId('retained').textContent, /Retained decision: FAIL; 1\/16/);
  assert.equal(byId('inspection-history').children.length, 1);
  assert.equal(byId('result-heading').focusCount, 1);
  assert.equal(byId('comparison').textContent, '');
  assert.ok(['inspect', 'compare', 'load-copy', 'inspect-copy', 'reset'].every((id) => byId(id).disabled === false));
});
test('page: compare prints both sides without adding the before denominator', async (t) => {
  const byId = loadPage(t);
  byId('comparison-id').value = 'cancellation';
  await byId('compare').dispatch('click');
  const comparison = JSON.parse(byId('comparison').textContent);
  assert.match(comparison.boundary, /MODELED fictional controls/);
  assert.equal(comparison.before.decision, 'HOLD');
  assert.ok(byId('originals').children.length >= 1);
});
test('page: an unknown source id is a protective visible rejection, never a default success', async (t) => {
  const byId = loadPage(t);
  byId('source-id').value = 'not-a-source';
  await byId('inspect').dispatch('click');
  assert.equal(byId('status').dataset.outcome, 'rejected');
  assert.match(byId('status').textContent, /Protectively rejected/);
  assert.equal(byId('error').textContent, 'UNKNOWN_SOURCE_ID');
  assert.match(byId('inspection-history').children[0].textContent, /REJECTED UNKNOWN_SOURCE_ID/);
  assert.equal(byId('counts').textContent.startsWith('0 scoped originals'), true);
});
test('page: load-copy and inspect-copy accept only the exact selected-source copy and reject a tampered one', async (t) => {
  const byId = loadPage(t);
  byId('source-id').value = 'closed-history';
  await byId('load-copy').dispatch('click');
  assert.ok(byId('candidate').value.includes('C035-source-copy/1'));
  assert.equal(byId('candidate').focusCount, 1);
  assert.match(byId('status').textContent, /copied for inspection only/);
  await byId('inspect-copy').dispatch('click');
  assert.equal(byId('status').dataset.outcome, 'classified');
  byId('candidate').value = byId('candidate').value.replace('closed-history', 'forged-history');
  await byId('inspect-copy').dispatch('click');
  assert.equal(byId('status').dataset.outcome, 'rejected');
  byId('source-id').value = 'not-a-source';
  await byId('load-copy').dispatch('click');
  assert.equal(byId('status').dataset.outcome, 'rejected');
});
test('page: changed input clears only the presentation and reset returns focus without freeing history', async (t) => {
  const byId = loadPage(t);
  byId('source-id').value = 'modeled-cancel-request';
  await byId('inspect').dispatch('click');
  assert.match(byId('result').textContent, /HOLD/);
  for (const id of ['source-id', 'comparison-id']) {
    await byId(id).dispatch('change');
    assert.match(byId('status').textContent, /Input changed; stale result cleared/);
    assert.equal(byId('result').textContent, '');
  }
  await byId('candidate').dispatch('input');
  assert.match(byId('status').textContent, /not from retained history/);
  await byId('reset').dispatch('click');
  assert.equal(byId('source-id').value, '');
  assert.equal(byId('candidate').value, '');
  assert.equal(byId('source-id').focusCount, 1);
  assert.equal(byId('status').dataset.outcome, 'unassessed');
  assert.match(byId('retained').textContent, /Retained decision: HOLD; 1\/16/);
});
test('page: a second activation while busy does no work and buttons are disabled meanwhile', async (t) => {
  const byId = loadPage(t);
  byId('source-id').value = 'modeled-complete';
  const first = byId('inspect').dispatch('click');
  assert.equal(byId('inspect').disabled, true);
  const second = byId('inspect').dispatch('click');
  const copy = byId('load-copy').dispatch('click');
  await Promise.all([first, second, copy]);
  assert.equal(byId('inspection-history').children.length, 1);
  assert.equal(byId('inspect').disabled, false);
});
test('page: the retained history limit refuses further work visibly instead of dropping entries', async (t) => {
  const byId = loadPage(t);
  byId('source-id').value = 'modeled-complete';
  for (let index = 0; index < 17; index += 1) await byId('inspect').dispatch('click');
  assert.match(byId('history-limit').textContent, /HISTORY_LIMIT_RETAINED/);
  assert.match(byId('status').textContent, /HISTORY_LIMIT_RETAINED; retained evidence unchanged/);
  assert.equal(byId('status').dataset.outcome, 'rejected');
  assert.equal(byId('inspection-history').children.length, 16);
});
