'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { scripts } = require('./support.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pageFile = path.join(root, 'page.js');
const pageSource = fs.readFileSync(pageFile, 'utf8');
const buttonIds = ['load', 'inspect', 'compare', 'json', 'reset'];
class FakeElement {
  constructor(tag, id = '', disabled = false) {
    Object.assign(this, { tagName: tag, id, children: [], dataset: {}, listeners: new Map(), textContent: '',
      value: '', disabled, open: false, focusCalls: 0 });
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  click() { return this.listeners.get('click')?.(); }
  replaceChildren(...nodes) { this.children = nodes; }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  focus() { this.focusCalls++; }
}
// Only ids that exist in the real markup resolve, so the controller cannot touch an element the page does not have.
function createDocument() {
  const elements = new Map();
  for (const match of html.matchAll(/<(\w+)\b[^>]*?\bid="([^"]+)"[^>]*>/g)) {
    elements.set(match[2], new FakeElement(match[1], match[2], /\bdisabled\b/.test(match[0])));
  }
  return { elements, createElement: (tag) => new FakeElement(tag),
    getElementById(id) {
      if (!elements.has(id)) throw new Error(`No element ${id} in index.html`);
      return elements.get(id);
    } };
}
async function boot(stubRouting) {
  const context = vm.createContext({ TextEncoder, TextDecoder, Uint8Array });
  vm.runInContext('globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));', context);
  const document = createDocument();
  context.document = document;
  if (stubRouting) Object.defineProperty(context, 'C037Routing', { value: stubRouting });
  else {
    for (const pieces of scripts) {
      const file = path.join(repository, 'capability', ...pieces);
      vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file, timeout: 1000 });
    }
  }
  await vm.runInContext(pageSource, context, { filename: pageFile });
  const el = (id) => document.getElementById(id);
  return {
    el,
    text: (id) => el(id).textContent,
    status: () => ({ outcome: el('status').dataset.outcome, message: el('status').textContent }),
    rows: () => el('destinations').children.map((row) => row.children.map((cell) => cell.textContent)),
    counts: () => {
      const items = el('counts').children;
      return Object.fromEntries(Array.from({ length: items.length / 2 }, (_, i) => [items[2 * i].textContent, items[2 * i + 1].textContent]));
    },
    history: () => el('history').children.map((item) => item.textContent),
    act: async (id, sample) => {
      if (sample !== undefined) el('sample').value = sample;
      return el(id).click();
    }
  };
}
function stubModel(overrides = {}) {
  const snapshot = { currentExpectedContext: null, currentMetrics: { started: 0, known: 0, unknown: 0, inFlight: 0, missingDestination: 0 },
    sessionDisposition: 'UNOBSERVED', retainedFailures: [], retainedHolds: [], history: [] };
  return { targets: ['v1', 'v2'], open: async () => ({ snapshot: () => snapshot, getFixture: () => ({ sampleId: 'stub' }),
    inspectText: async () => ({}), compareText: async () => ({}), ...overrides }) };
}
test('the page binds only ids that exist in the markup, then reports ready with every control enabled and nothing observed', async () => {
  const page = await boot();
  assert.deepEqual(page.status(), { outcome: 'ready', message: 'UNOBSERVED. Choose a source explicitly, load JSON, then inspect or compare.' });
  for (const id of buttonIds) {
    assert.equal(page.el(id).disabled, false, id);
    assert.equal(page.el(id).listeners.has('click'), true, id);
  }
  assert.equal(page.text('error'), '');
  assert.equal(page.text('current-started'), '0');
  assert.equal(page.text('actual-current'), '0');
  assert.equal(page.text('session'), 'Session: UNOBSERVED. Retained failures 0; retained HOLDs 0.');
  assert.equal(page.text('classification'), 'Source: UNOBSERVED. Requested policy: UNOBSERVED.');
  assert.match(page.text('policy'), /^Requested policy: UNOBSERVED \/ HOLD\. No inferred 50\/50 default\.$/);
  assert.match(page.text('originals'), /^No historical originals selected\./);
  assert.deepEqual(page.rows(), [['v1', 'UNOBSERVED', 'UNOBSERVED', '0', 'UNOBSERVED', 'HOLD'], ['v2', 'UNOBSERVED', 'UNOBSERVED', '0', 'UNOBSERVED', 'HOLD']]);
  assert.deepEqual(Object.values(page.counts()), ['0', '0', '0', '0', '0', '0', '0', '0']);
  assert.equal(JSON.parse(page.text('result-json')).outcome, 'UNOBSERVED');
  assert.match(JSON.parse(page.text('context')).runId, /\S/);
  assert.deepEqual(page.history(), []);
});
test('load copies the chosen closed sample as editable JSON and performs no comparison or metric transition', async () => {
  const page = await boot();
  await page.act('load', 'fictional-match');
  assert.equal(JSON.parse(page.el('candidate').value).sampleId, 'fictional-match');
  assert.equal(page.status().outcome, 'loaded');
  assert.equal(page.status().message, 'JSON copy loaded. No comparison or metric transition performed.');
  assert.equal(page.text('current-started'), '0');
  assert.deepEqual(page.history(), []);
  assert.equal(JSON.parse(page.text('result-json')).outcome, 'UNOBSERVED');
});
test('a matching fictional control shows declared weights as declared, measured counts and shares, and commits guarded fictional originals only', async () => {
  const page = await boot();
  await page.act('load', 'fictional-match');
  await page.act('compare');
  assert.deepEqual(page.status(), { outcome: 'matched-control', message: 'MATCH_CONTROL: FICTIONAL_MEASURED_CONTROL_MATCH' });
  assert.equal(page.text('error'), '');
  assert.deepEqual(page.rows(), [['v1', '50% (declared)', '2', '2', '50.00%', '0.00 bps / 500 bps: within'],
    ['v2', '50% (declared)', '2', '2', '50.00%', '0.00 bps / 500 bps: within']]);
  assert.deepEqual(page.counts(), { started: '4', known: '4', unknown: '0', inFlight: '0', missingDestination: '0',
    interrupted: '0', duplicateDeliveries: '0', failedResponses: '0' });
  assert.equal(page.text('current-started'), '4');
  assert.equal(page.text('current-known'), '4');
  assert.equal(page.text('actual-current'), '0');
  assert.equal(page.text('classification'),
    'Source: explicit-fictional-measured-control-observations. Requested policy: declared-modeled-policy; not an observed actual requested policy.');
  assert.match(page.text('policy'), /^DECLARED fictional policy; exact total 10000 bps; tolerance 500 bps; minimum 4 started originals\. NOT an observed actual requested policy\.$/);
  assert.equal(page.text('missing'), '');
  assert.deepEqual(page.history(), ['1. compare: MATCH_CONTROL — FICTIONAL_MEASURED_CONTROL_MATCH; guarded fictional starts 4']);
  assert.equal(page.text('session'), 'Session: FICTIONAL_CONTROL_ONLY. Retained failures 0; retained HOLDs 0.');
  assert.equal(JSON.parse(page.text('result-json')).sampleId, 'fictional-match');
  for (const id of buttonIds) assert.equal(page.el(id).disabled, false, `${id} re-enabled after the action`);
});
test('inspect shows the same comparison but cannot commit current metrics', async () => {
  const page = await boot();
  await page.act('load', 'fictional-match');
  await page.act('inspect');
  assert.equal(page.status().outcome, 'matched-control');
  assert.equal(page.text('current-started'), '0');
  assert.equal(page.counts().started, '4');
  assert.deepEqual(page.history(), ['1. inspect: MATCH_CONTROL — FICTIONAL_MEASURED_CONTROL_MATCH; guarded fictional starts 0']);
});
test('a known share mismatch is shown as OUTSIDE the threshold and survives a display reset', async () => {
  const page = await boot();
  await page.act('load', 'fictional-skew');
  await page.act('compare');
  assert.deepEqual(page.status(), { outcome: 'mismatched', message: 'MISMATCH: OBSERVED_SHARE_MISMATCH' });
  assert.deepEqual(page.rows(), [['v1', '50% (declared)', '2', '4', '100.00%', '5000.00 bps / 500 bps: OUTSIDE'],
    ['v2', '50% (declared)', '2', '0', '0.00%', '-5000.00 bps / 500 bps: OUTSIDE']]);
  assert.equal(page.text('session'), 'Session: FAILURE_RETAINED. Retained failures 1; retained HOLDs 0.');
  await page.act('reset');
  assert.equal(page.status().outcome, 'reset');
  assert.match(page.status().message, /Failures, HOLDs, originals, metrics and replay protection retained\.$/);
  assert.equal(page.el('candidate').value, '');
  assert.equal(page.el('sample').value, '');
  assert.equal(page.el('result-details').open, false);
  assert.equal(page.el('sample').focusCalls, 1);
  assert.equal(page.text('session'), 'Session: FAILURE_RETAINED. Retained failures 1; retained HOLDs 0.');
  assert.equal(page.text('current-started'), '4');
  assert.equal(page.history().length, 1);
  assert.equal(page.rows()[0][1], 'UNOBSERVED');
});
test('unknown, in-flight and missing destinations keep the denominator and HOLD with the missing codes listed', async () => {
  const page = await boot();
  await page.act('load', 'fictional-unknown');
  await page.act('compare');
  assert.equal(page.status().outcome, 'held');
  assert.equal(page.counts().started, '4');
  assert.equal(page.counts().interrupted, '1');
  assert.equal(page.counts().known, '3');
  assert.match(page.text('missing'), /^HOLD: INCOMPLETE_DESTINATION_OBSERVATIONS$/);
  assert.equal(page.text('current-unknown'), '1');
  assert.deepEqual(page.rows(), [['v1', '50% (declared)', '2', '2', '50.00%', '0.00 bps / 500 bps: within'],
    ['v2', '50% (declared)', '2', '1', '25.00%', '-2500.00 bps / 500 bps: OUTSIDE']]);
  assert.equal(page.text('session'), 'Session: FAILURE_RETAINED. Retained failures 1; retained HOLDs 1.');
});
test('zero measured requests never turn declared weights into measured destinations', async () => {
  const page = await boot();
  await page.act('load', 'fictional-zero');
  await page.act('compare');
  assert.equal(page.status().outcome, 'held');
  assert.deepEqual(page.rows(), [['v1', '50% (declared)', '0', '0', 'UNOBSERVED', 'HOLD'], ['v2', '50% (declared)', '0', '0', 'UNOBSERVED', 'HOLD']]);
  assert.match(page.text('missing'), /ZERO_DENOMINATOR/);
});
test('historical actual HTTP shows 4/8 and 3/8 with no requested policy, no invented 50/50 and no current metric', async () => {
  const page = await boot();
  await page.act('load', 'historical-closed');
  await page.act('compare');
  assert.equal(page.status().outcome, 'held');
  assert.equal(page.text('classification'), 'Source: actual-historical-local-HTTP-destination-observations. Requested policy: UNOBSERVED.');
  assert.match(page.text('policy'), /^Requested policy: UNOBSERVED \/ HOLD\. No inferred 50\/50 default\.$/);
  assert.deepEqual(page.rows(), [['v1', 'UNOBSERVED', 'UNOBSERVED', '4', '50.00%', 'HOLD'], ['v2', 'UNOBSERVED', 'UNOBSERVED', '3', '37.50%', 'HOLD']]);
  assert.equal(page.counts().started, '8');
  assert.equal(page.counts().known, '7');
  assert.equal(page.counts().missingDestination, '1');
  assert.match(page.text('missing'), /NO_AUTHENTICATED_CURRENT_POLICY_OR_IDENTITY_ASSOCIATION/);
  assert.ok(Array.isArray(JSON.parse(page.text('originals'))));
  assert.equal(page.text('current-started'), '0');
});
test('rejected evidence shows its code in the alert region and retains the failure', async () => {
  const page = await boot();
  await page.act('load', 'wrong-run');
  await page.act('compare');
  assert.equal(page.status().outcome, 'rejected');
  assert.match(page.text('error'), /^[A-Z0-9_]+$/);
  assert.deepEqual(page.rows()[0], ['v1', 'UNOBSERVED', 'UNOBSERVED', '0', 'UNOBSERVED', 'HOLD']);
  page.el('candidate').value = '{';
  await page.act('inspect');
  assert.equal(page.status().outcome, 'rejected');
  assert.match(page.text('error'), /^[A-Z0-9_]+$/);
  assert.equal(page.history().length, 2);
  assert.match(page.text('session'), /^Session: FAILURE_RETAINED\. Retained failures 2;/);
});
test('json shows the result details only and a missing sample choice is retained as a selection error', async () => {
  const page = await boot();
  await page.act('json');
  assert.equal(page.el('result-details').open, true);
  assert.deepEqual(page.status(), { outcome: 'json', message: 'Result JSON shown; no comparison or metric transition performed.' });
  await page.act('load', '');
  assert.deepEqual(page.status(), { outcome: 'rejected', message: 'No evidence selected or available; no default policy or observed result.' });
  assert.equal(page.text('error'), 'UNKNOWN_SAMPLE_ID');
  assert.deepEqual(page.history(), ['Selection error retained: UNKNOWN_SAMPLE_ID']);
  await page.act('load', 'fictional-match');
  await page.act('compare');
  assert.equal(page.history().length, 2);
  assert.equal(page.history()[0], 'Selection error retained: UNKNOWN_SAMPLE_ID');
});
test('a second action while one is running is ignored and the controls stay disabled until it settles', async () => {
  let release;
  let calls = 0;
  const page = await boot(stubModel({ compareText: () => { calls++; return new Promise((resolve) => { release = () => resolve({ outcome: 'matched-control', disposition: 'MATCH_CONTROL', code: 'STUB' }); }); } }));
  const first = page.act('compare');
  const second = page.act('compare');
  assert.equal(await second, undefined);
  assert.equal(calls, 1);
  for (const id of buttonIds) assert.equal(page.el(id).disabled, true, `${id} disabled while busy`);
  release();
  await first;
  for (const id of buttonIds) assert.equal(page.el(id).disabled, false, `${id} enabled after settling`);
  assert.deepEqual(page.status(), { outcome: 'matched-control', message: 'MATCH_CONTROL: STUB' });
});
test('an unexpected model error without a code is reported as LOCAL_UI_ERROR and the first selection error is kept', async () => {
  const page = await boot(stubModel({ compareText: async () => { throw new Error('boom'); },
    inspectText: async () => { throw Object.assign(new Error('coded'), { code: 'CODED_LATER' }); } }));
  await page.act('compare');
  assert.equal(page.text('error'), 'LOCAL_UI_ERROR');
  await page.act('inspect');
  assert.equal(page.text('error'), 'CODED_LATER');
  assert.deepEqual(page.history(), ['Selection error retained: LOCAL_UI_ERROR']);
  assert.equal(page.status().outcome, 'rejected');
});
test('an unavailable local model leaves every control disabled and never falls back to a previous success', async () => {
  for (const [error, code] of [[Object.assign(new Error('gone'), { code: 'CURRENT_CONTEXT_UNAVAILABLE' }), 'CURRENT_CONTEXT_UNAVAILABLE'],
    [new Error('no code'), 'LOCAL_CONTEXT_UNAVAILABLE']]) {
    const page = await boot({ targets: ['v1', 'v2'], open: async () => { throw error; } });
    assert.deepEqual(page.status(), { outcome: 'unavailable', message: 'Inspector unavailable / HOLD. No previous-state success fallback.' });
    assert.equal(page.text('error'), code);
    for (const id of buttonIds) {
      assert.equal(page.el(id).disabled, true, id);
      assert.equal(page.el(id).listeners.size, 0, id);
    }
  }
});
