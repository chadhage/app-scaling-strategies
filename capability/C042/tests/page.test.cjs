'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const contract = require('../contract.js');
const result = require('../result.cjs');
const { cleanup, gate, inFlight, scratch, startService, valid } = require('./support.cjs');
const { networkFetch, runPage } = require('./dom-stub.cjs');

const KEY = 'demo-key-0001';
const labels = (...names) => names.map((name) => contract.ACTIONS[name].label);
const ids = (document) => (id) => document.element(id);

async function withPage(options, body) {
  const service = await startService(options);
  const page = runPage({ fetch: networkFetch(service.port) });
  try {
    return await body({ ...page, service, $: ids(page.document) });
  } finally {
    await service.stop();
    if (service.dir) cleanup(service.dir);
  }
}

test('the page enables its controls, starts from a valid example and follows the preset', async () => {
  await withPage({}, async ({ $, context }) => {
    for (const id of ['submit', 'inspect', 'load']) assert.equal($(id).disabled, false, id);
    assert.equal(JSON.parse($('request').value).idempotencyKey, KEY);
    assert.match($('status').textContent, /^Not run/);
    assert.equal($('recovery').textContent, 'No result yet.');
    $('preset').value = 'duplicate';
    await $('preset').dispatch('change');
    assert.match($('request').value, /"units":5,"units":6/);
    $('preset').value = 'constructor';
    await $('preset').dispatch('change');
    assert.match($('request').value, /"units":5,"units":6/, 'an unknown preset changes nothing');
    assert.equal(Object.isFrozen(context.C042Page), true);
  });
});

test('Enter on the form submits the step and shows the inputs, the explicit result, what did not happen and the controls', async () => {
  await withPage({}, async ({ $ }) => {
    await $('step-form').dispatch('submit');
    assert.match($('status').textContent, /^SUCCEEDED — /);
    assert.deepEqual(JSON.parse($('inputs').textContent), valid({ idempotencyKey: KEY }));
    const rows = $('result').lines();
    assert.equal(rows.includes('succeeded (COMPLETED)'), true);
    assert.equal(rows[rows.indexOf('Applied by this request') + 1], 'true');
    assert.equal($('did-not').lines().some((line) => line.startsWith('NO_UNDO: ')), true);
    assert.deepEqual($('trail').lines(), ['#1 begin', '#2 commit']);
    assert.deepEqual($('recovery').labels(), labels('retry', 'inspect'));
    assert.equal($('recovery').buttons()[0].title, contract.ACTIONS.retry.description);
    await $('recovery').buttons()[0].click();
    const replay = $('result').lines();
    assert.equal(replay[replay.indexOf('Replayed') + 1], 'true');
    assert.equal(replay[replay.indexOf('Applied by this request') + 1], 'false');
    await $('recovery').buttons()[1].click();
    assert.match($('status').textContent, /^SUCCEEDED — /);
    await $('inspect').click();
    assert.equal($('result').lines().includes('committed'), true);
  });
});

test('every example is conducted by the server and shown as a typed result with only its offered controls', async () => {
  await withPage({}, async ({ $ }) => {
    const expected = [
      ['valid', 'SUCCEEDED', labels('retry', 'inspect')],
      ['conflict', 'REJECTED', labels('correct-and-resubmit', 'inspect')],
      ['duplicate', 'REJECTED', labels('correct-and-resubmit')],
      ['prototype', 'REJECTED', labels('correct-and-resubmit')],
      ['range', 'REJECTED', labels('correct-and-resubmit')],
      ['unsupported', 'UNSUPPORTED', labels('correct-and-resubmit')],
    ];
    const codes = [null, 'IDEMPOTENCY_KEY_CONFLICT', 'DUPLICATE_FIELD', 'FORBIDDEN_FIELD', 'FIELD_OUT_OF_RANGE', 'UNSUPPORTED_STEP'];
    for (const [index, [preset, word, controls]] of expected.entries()) {
      $('preset').value = preset;
      await $('preset').dispatch('change');
      await $('step-form').dispatch('submit');
      assert.match($('status').textContent, new RegExp(`^${word} — `), preset);
      assert.deepEqual($('recovery').labels(), controls, preset);
      if (codes[index]) assert.equal($('result').lines().some((line) => line.startsWith(codes[index])), true, preset);
    }
    assert.equal($('details').lines().length, 0, 'the unsupported refusal carries no field details');
    $('preset').value = 'duplicate';
    await $('preset').dispatch('change');
    await $('step-form').dispatch('submit');
    assert.deepEqual($('details').lines(), ['units: DUPLICATE_FIELD']);
    assert.equal($('inputs').textContent.startsWith('No validated input'), true);
    await $('recovery').buttons()[0].click();
    assert.equal($('request').document.active, $('request'));
    assert.match($('status').textContent, /^Edit the request/);
  });
});

test('cancel and inspect work from a second page while the first waits for the result', async () => {
  const held = gate();
  await withPage({ executor: held.executor }, async ({ $, service }) => {
    const other = runPage({ fetch: networkFetch(service.port) });
    const second = (id) => other.document.element(id);
    const waiting = $('step-form').dispatch('submit');
    await inFlight(held, KEY, [waiting]);
    assert.equal($('submit').disabled, true, 'busy: no second submission from the same page');
    await $('submit').dispatch('click');
    second('key').value = KEY;
    await second('inspect').click();
    assert.match(second('status').textContent, /^UNKNOWN — /);
    assert.deepEqual(second('recovery').labels(), labels('cancel', 'retry', 'inspect'));
    await second('recovery').buttons()[0].click();
    assert.match(second('status').textContent, /^CANCELLED — /);
    await waiting;
    assert.match($('status').textContent, /^CANCELLED — /);
    assert.deepEqual($('recovery').labels(), labels('correct-and-resubmit', 'inspect'));
    held.release(KEY);
    const invalid = second('key');
    invalid.value = 'short';
    await second('inspect').click();
    assert.match(second('status').textContent, /^Enter a valid idempotency key/);
    invalid.value = 'key-0404-nope';
    await second('inspect').click();
    assert.match(second('status').textContent, /^REJECTED — /);
    assert.deepEqual(second('recovery').labels(), labels('correct-and-resubmit'));
  });
});

test('after a restart the page shows the interrupted step and resumes it only on request', async () => {
  const held = gate();
  const dir = scratch();
  const first = await startService({ dir, executor: held.executor });
  const firstPage = runPage({ fetch: networkFetch(first.port) });
  const pending = firstPage.document.element('step-form').dispatch('submit').catch(() => {});
  await inFlight(held, KEY, [pending]);
  await first.stop();
  await pending;
  const second = await startService({ dir });
  try {
    const page = runPage({ fetch: networkFetch(second.port) });
    const $ = (id) => page.document.element(id);
    await $('inspect').click();
    assert.match($('status').textContent, /^INTERRUPTED — /);
    assert.deepEqual($('recovery').labels(), labels('resume', 'cancel', 'inspect'));
    assert.equal($('result').lines().includes('false'), true);
    await $('recovery').buttons()[0].click();
    assert.match($('status').textContent, /^SUCCEEDED — /);
    assert.deepEqual($('trail').lines(), ['#1 begin', '#2 resume', '#3 commit']);
    await $('recovery').buttons()[0].click();
    assert.equal($('result').lines().includes('true'), true);
  } finally {
    await second.stop();
    cleanup(dir);
  }
});

test('a missing, malformed or contradictory response is unknown or rejected, never success', async () => {
  const sent = [];
  const reject = () => { throw new TypeError('Failed to fetch'); };
  const page = runPage({ fetch: async (route, options) => { sent.push([options?.method ?? 'GET', route]); return reject(); } });
  const $ = (id) => page.document.element(id);
  await $('step-form').dispatch('submit');
  assert.match($('status').textContent, /^UNKNOWN — .*Nothing is shown as success/);
  assert.deepEqual($('recovery').labels(), labels('retry', 'inspect'));
  assert.equal($('inputs').textContent, 'No validated input.');
  await $('recovery').buttons()[0].click();
  await $('recovery').buttons()[1].click();
  assert.deepEqual(sent.map((item) => item[0]), ['POST', 'POST', 'GET']);
  $('request').value = '{';
  await $('step-form').dispatch('submit');
  assert.equal($('recovery').textContent, 'No recovery control is offered for this result.');
  const bad = [
    ['not an envelope', async () => ({ status: 200, json: async () => ({ accepted: true }) }), /^REJECTED — the response is not a valid C042 result envelope \(ENVELOPE_KEYS\)/],
    ['not JSON', async () => ({ status: 200, json: async () => { throw new SyntaxError('x'); } }), /^UNKNOWN — /],
  ];
  for (const [name, fetch, pattern] of bad) {
    const other = runPage({ fetch });
    await other.document.element('step-form').dispatch('submit');
    assert.match(other.document.element('status').textContent, pattern, name);
    assert.equal(other.document.element('result').children.length, 0, name);
  }
  const success = result.build({ action: 'submit', accepted: true, byThis: true, step: { key: KEY, input: Object.freeze(valid({ idempotencyKey: KEY })), state: 'committed', trail: [{ seq: 1, type: 'begin' }, { seq: 2, type: 'commit' }], commit: { leaseId: 'synthetic-lease-001', units: 5, reservedAfter: 5 }, attempts: 1 } });
  const liar = runPage({ fetch: async () => ({ status: 500, json: async () => success.body }) });
  await liar.document.element('step-form').dispatch('submit');
  assert.match(liar.document.element('status').textContent, /HTTP status contradicts accepted/);
  const keyless = result.refusal('STEP_NOT_FOUND', { action: 'inspect' }).body;
  keyless.recovery.allowed = ['inspect'];
  const guarded = runPage({ fetch: async () => ({ status: 404, json: async () => keyless }) });
  guarded.document.element('request').value = '{}';
  await guarded.document.element('step-form').dispatch('submit');
  await guarded.document.element('recovery').buttons()[0].click();
  assert.match(guarded.document.element('status').textContent, /^No valid idempotency key is known/);
});
