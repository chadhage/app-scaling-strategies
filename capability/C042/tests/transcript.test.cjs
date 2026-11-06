'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const contract = require('../contract.js');
const { produceTranscript } = require('../transcript.cjs');
const { startService } = require('./support.cjs');
const { networkFetch, runPage } = require('./dom-stub.cjs');

let cached;
const transcript = async () => structuredClone(await (cached ??= produceTranscript()));
const verify = async (mutate) => {
  const value = await transcript();
  const returned = mutate(value);
  const out = returned === undefined ? value : returned;
  const { context } = runPage({ fetch: async () => { throw new Error('unused'); } });
  return context.C042Page.verifyTranscript(out);
};
const renumber = (value) => { value.events.forEach((event, index) => { event.n = index + 1; }); return value; };
const exchange = (value, scenario, method, route, nth = 0) => value.events.filter((event) => event.scenario === scenario && event.request?.method === method && event.request.path === route)[nth];

test('the server produces a deterministic transcript of real exchanges that the page verifies', async () => {
  const first = await transcript();
  const second = await produceTranscript();
  assert.deepEqual(second, first, 'no clock, port or random value appears in the transcript');
  assert.deepEqual(first.scenarios.map((item) => item.id), ['conduct', 'cancel', 'disconnect', 'restart', 'uncertain', 'capacity']);
  const exchanges = first.events.filter((event) => event.kind === 'exchange');
  assert.equal(exchanges.length >= 24, true);
  for (const event of exchanges) {
    if (event.response.body.kind === 'C042-step-result') assert.deepEqual(contract.validateResultEnvelope(event.response.body), { ok: true, problems: [] }, `event ${event.n}`);
  }
  assert.equal(exchanges.some((event) => event.request.body?.includes('__proto__')), true);
  const verdict = await verify(() => undefined);
  assert.equal(verdict.ok, true, JSON.stringify(verdict));
  assert.deepEqual(Object.keys(verdict.summary.outcomes).sort(), [...contract.OUTCOMES].sort());
  assert.deepEqual([verdict.summary.effects, verdict.summary.replays >= 1, verdict.summary.aborts], [5, true, 2]);
  assert.equal(verdict.summary.typedFailures.includes('ACTION_NOT_ALLOWED'), true);
});

test('the page loads the live transcript over real sockets and shows every exchange', async () => {
  const service = await startService({ transcript: produceTranscript });
  try {
    const page = runPage({ fetch: networkFetch(service.port) });
    const $ = (id) => page.document.element(id);
    await $('load').click();
    assert.match($('status').textContent, /^VERIFIED SERVER TRANSCRIPT — \d+ exchanges, 5 effects, \d+ replays, 2 aborts and restarts/);
    assert.equal($('events').children.length, (await transcript()).events.length);
    const events = (await transcript()).events;
    const submitted = events.filter((event) => event.kind === 'exchange' && event.request.method === 'POST' && event.request.path === '/v1/steps');
    const submitRows = $('events').children.filter((row) => /^POST \/v1\/steps( |$)/.test(row.children[2].textContent));
    assert.equal(submitRows.length, submitted.length, 'every delivered submit is shown once');
    assert.equal(submitRows.filter((row) => row.children[3].textContent === '201').length, submitted.filter((event) => event.response.body.effect.appliedByThisRequest).length, 'the 201 rows are exactly the submits that applied an effect');
    assert.equal(submitRows.filter((row) => row.children[3].textContent === '200').length, submitted.filter((event) => event.response.status === 200).length);
    assert.equal(JSON.parse($('summary').textContent).verified, true);
    assert.equal($('events').children.some((row) => row.className === 'kind-abort'), true);
    assert.equal($('load').disabled, false);
  } finally {
    await service.stop();
  }
});

const tampering = [
  ['a foreign kind', (t) => { t.kind = 'x'; }, 'TRANSCRIPT_SHAPE'],
  ['another version', (t) => { t.schemaVersion = 2; }, 'TRANSCRIPT_SHAPE'],
  ['a foreign scope', (t) => { t.scope = 'cloud'; }, 'TRANSCRIPT_SHAPE'],
  ['no events', (t) => { t.events = []; }, 'TRANSCRIPT_SHAPE'],
  ['too many events', (t) => { t.events = Array.from({ length: 201 }, () => t.events[0]); }, 'TRANSCRIPT_SHAPE'],
  ['null', () => null, 'TRANSCRIPT_SHAPE'],
  ['a primitive', () => 'text', 'TRANSCRIPT_SHAPE'],
  ['a missing event', (t) => { t.events.splice(3, 1); }, 'SEQUENCE_GAP'],
  ['an exchange without a response', (t) => { delete exchange(t, 'conduct', 'POST', '/v1/steps').response; }, 'EVENT_SHAPE'],
  ['a response without a numeric status', (t) => { exchange(t, 'conduct', 'POST', '/v1/steps').response.status = '201'; }, 'EVENT_SHAPE'],
  ['an event of an unknown kind', (t) => { t.events[0].kind = 'x'; }, 'EVENT_SHAPE'],
  ['a tampered unit count', (t) => { exchange(t, 'conduct', 'POST', '/v1/steps').response.body.effect.units = 99; }, 'ENVELOPE_INVALID'],
  ['a success that is not journaled', (t) => { exchange(t, 'conduct', 'POST', '/v1/steps').response.body.step.state = 'in-flight'; }, 'ENVELOPE_INVALID'],
  ['a success shown with HTTP 400', (t) => { exchange(t, 'conduct', 'POST', '/v1/steps').response.status = 400; }, 'STATUS_MISMATCH'],
  ['a refusal shown with HTTP 200', (t) => { exchange(t, 'conduct', 'POST', '/v1/steps', 2).response.status = 200; }, 'STATUS_MISMATCH'],
  ['a refusal shown with the wrong status', (t) => { exchange(t, 'conduct', 'POST', '/v1/steps', 2).response.status = 500; }, 'STATUS_MISMATCH'],
  ['a second commit for one key', (t) => { exchange(t, 'conduct', 'POST', '/v1/steps', 1).response.body.trail[1].seq = 3; }, 'SECOND_EFFECT'],
  ['two requests that both claim the effect', (t) => { const body = exchange(t, 'conduct', 'POST', '/v1/steps', 1).response.body; body.replayed = false; body.effect.appliedByThisRequest = true; }, 'SECOND_EFFECT'],
  ['a ledger that disagrees', (t) => { exchange(t, 'conduct', 'GET', '/v1/leases').response.body.leases['synthetic-lease-001'].committed = 6; }, 'LEDGER_MISMATCH'],
  ['a ledger beyond capacity', (t) => { exchange(t, 'conduct', 'GET', '/v1/leases').response.body.leases['synthetic-lease-001'].held = 99; }, 'LEDGER_MISMATCH'],
  ['a snapshot without leases', (t) => { delete exchange(t, 'conduct', 'GET', '/v1/leases').response.body.leases; }, 'TRANSCRIPT_SHAPE'],
  ['no abort or restart events', (t) => { t.events = t.events.filter((event) => event.kind !== 'abort'); renumber(t); }, 'MISSING_EVIDENCE'],
  ['no cancellation', (t) => { t.events = t.events.filter((event) => event.scenario !== 'cancel'); renumber(t); }, 'MISSING_EVIDENCE'],
  ['no interruption', (t) => { t.events = t.events.filter((event) => event.scenario !== 'restart'); renumber(t); }, 'MISSING_EVIDENCE'],
  ['no uncertain outcome', (t) => { t.events = t.events.filter((event) => event.scenario !== 'uncertain'); renumber(t); }, 'MISSING_EVIDENCE'],
  ['no replay', (t) => { t.events = t.events.filter((event) => !(event.response?.body?.replayed)); renumber(t); }, 'MISSING_EVIDENCE'],
];

test('the page rejects a transcript that is tampered with in any way it can check', async () => {
  for (const [name, mutate, code] of tampering) {
    const verdict = await verify(mutate);
    assert.equal(verdict.ok, false, name);
    assert.equal(verdict.code, code, `${name}: ${JSON.stringify(verdict)}`);
    assert.equal(typeof verdict.message, 'string');
  }
});

test('the page shows REJECTED and clears the display for a tampered, missing or unavailable transcript', async () => {
  const good = await transcript();
  const tampered = structuredClone(good);
  tampered.events.splice(3, 1);
  const load = async (fetch) => {
    const page = runPage({ fetch });
    const $ = (id) => page.document.element(id);
    await $('load').click();
    return $;
  };
  const sent = [];
  let $ = await load(async (route) => { sent.push(route); return { ok: true, status: 200, json: async () => good }; });
  assert.match($('status').textContent, /^VERIFIED/);
  $ = await load(async () => ({ ok: true, status: 200, json: async () => tampered }));
  assert.match($('status').textContent, /^REJECTED — SEQUENCE_GAP: /);
  assert.deepEqual([$('events').children.length, $('summary').textContent], [0, 'No verified transcript.']);
  $ = await load(async () => ({ ok: false, status: 500, json: async () => ({}) }));
  assert.equal($('status').textContent, 'REJECTED — HTTP_500: no transcript was observed.');
  $ = await load(async () => { throw new TypeError('blocked'); });
  assert.match($('status').textContent, /^REJECTED — TRANSCRIPT_UNAVAILABLE/);
  const page = runPage({ fetch: async (route) => { sent.push(route); return { ok: true, status: 200, json: async () => good }; } });
  sent.length = 0;
  const first = page.document.element('load').dispatch('click');
  await page.document.element('load').dispatch('click');
  await first;
  assert.deepEqual(sent, ['/transcript.json'], 'a second click while loading is ignored');
});
