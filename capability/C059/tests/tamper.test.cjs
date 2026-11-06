'use strict';

// Every answer the page shows is validated and its wording RE-DERIVED from facts: a tampered answer, malformed JSON or a lying
// HTTP status is shown as the unknown outcome with the page's own wording, never as success and never with server prose.
const test = require('node:test');
const assert = require('node:assert/strict');
const { checker, c042, gate, openSession } = require('./harness.cjs');

const OPTIONS = { timeout: 20000 };
const PROSE = 'EVERYTHING WENT GREAT, trust me';
const input = { schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: 'tamper-key-0001', leaseId: 'synthetic-lease-001', units: 2 };

async function good() {
  const engine = await c042('engine.cjs').openEngine({ io: c042('journal.cjs').createMemoryIo() });
  return engine.submit(input);
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const edit = (answer, change, status = answer.status) => { const copy = clone(answer); change(copy.body); return { status, body: copy.body }; };

const TAMPERS = [
  ['a 500 status on a success envelope', async () => edit(await good(), () => {}, 500), 'STATUS_CONTRADICTS_ENVELOPE'],
  ['an outcome that contradicts the rest', async () => edit(await good(), (body) => { body.outcome = 'rejected'; body.classification = 'FAILED'; }), 'ENVELOPE_INVALID'],
  ['an effect that is not applied on a success', async () => edit(await good(), (body) => { body.effect.applied = false; }), 'ENVELOPE_INVALID'],
  ['a different explanation prose on the recovery reason', async () => edit(await good(), (body) => { body.recovery.reason = PROSE; }), 'REASON_TAMPERED'],
  ['other offered recovery actions than the state allows', async () => edit(await good(), (body) => { body.recovery.allowed = ['cancel']; }), 'RECOVERY_TAMPERED'],
  ['a different error message prose', async () => edit(c042('result.cjs').refusal('CAPACITY_EXHAUSTED', { action: 'submit' }), (body) => { body.error.message = PROSE; }), 'ENVELOPE_INVALID'],
  ['a refusal answered with a 2xx status', async () => edit(c042('result.cjs').refusal('CAPACITY_EXHAUSTED', { action: 'submit' }), () => {}, 200), 'STATUS_CONTRADICTS_ENVELOPE'],
  ['a refusal with a status that does not belong to its code', async () => edit(c042('result.cjs').refusal('CAPACITY_EXHAUSTED', { action: 'submit' }), () => {}, 418), 'STATUS_CONTRADICTS_CODE'],
  ['an outcome that does not belong to the typed code', async () => edit(c042('result.cjs').refusal('CAPACITY_EXHAUSTED', { action: 'submit' }), (body) => { body.outcome = 'unknown'; body.classification = 'UNKNOWN'; }), 'OUTCOME_CONTRADICTS_CODE'],
  ['an extra field with prose', async () => edit(await good(), (body) => { body.prose = PROSE; }), 'ENVELOPE_INVALID'],
  ['an array instead of an envelope', async () => ({ status: 200, body: [PROSE] }), 'ENVELOPE_INVALID'],
  ['null instead of an envelope', async () => ({ status: 200, body: null }), 'ENVELOPE_INVALID'],
];

for (const [name, make, code] of TAMPERS) {
  test(`tampered answer (${name}) is rejected as ${code}: unknown, never success, no server prose`, OPTIONS, async () => {
    const session = await openSession();
    const answer = await make();
    session.fetch.state.next = () => session.fetch.answer(answer);
    session.fill({ key: 'tamper-key-0001', units: 2 });
    const shown = await session.act('tampered', () => session.submit(), { announced: 2 });
    assert.equal(session.outcome(), 'unknown');
    assert.equal(session.$('result').getAttribute('data-code'), 'ANSWER_REJECTED');
    assert.match(session.$('facts').textContent, new RegExp(`Check that failed${code}`));
    assert.doesNotMatch(session.document.documentElement.textContent, /GREAT|trust me/);
    assert.doesNotMatch(shown.text, /succe|done|complete/i);
    assert.match(shown.text, /^Unknown\. Code ANSWER_REJECTED\. The answer was not a valid result and was discarded\. Nothing is confirmed\. Offered: Retry with the same key, Inspect the step\.$/);
    assert.deepEqual(session.buttons(), ['recovery-retry', 'recovery-inspect']);
  });
}

test('malformed JSON from the server is rejected as MALFORMED_JSON', OPTIONS, async () => {
  const session = await openSession();
  session.fetch.state.next = async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError('Unexpected token'); } });
  session.fill({ key: 'tamper-key-0002', units: 2 });
  await session.act('malformed', () => session.submit(), { announced: 2 });
  assert.equal(session.outcome(), 'unknown');
  assert.match(session.$('facts').textContent, /Check that failedMALFORMED_JSON/);
});

test('while a request is in flight the page is busy programmatically, ignores a second submit and a start over, and keeps the focus on the result heading', OPTIONS, async () => {
  const held = gate();
  const session = await openSession({ executor: held.executor });
  session.fill({ key: 'busy-key-0001', units: 2 });
  const before = session.document.announcements.length;
  session.submit();
  await held.entered('busy-key-0001');
  for (const id of ['result', 'step-form']) assert.equal(session.$(id).getAttribute('aria-busy'), 'true');
  assert.equal(session.$('submit').getAttribute('aria-disabled'), 'true');
  assert.equal(session.$('start-over').getAttribute('aria-disabled'), 'true');
  assert.equal(session.outcome(), 'pending');
  assert.equal(session.document.activeElement.id, 'result-heading');
  assert.deepEqual(checker.check(session.document).findings, [], 'the busy state satisfies the contract');
  assert.match(session.$('status').textContent, /^Working on "Conduct the step"\. Waiting for the server; nothing is confirmed yet\.$/);
  session.submit();
  session.$('start-over').focus();
  session.press('Enter');
  assert.deepEqual(session.fetch.state.calls, ['POST /v1/steps'], 'the second submit was not sent');
  assert.equal(session.document.announcements.slice(before).length, 1, 'only the progress was announced so far');
  held.release('busy-key-0001');
  await require('./dom.cjs').idle(session.document);
  session.verify('after the answer');
  assert.equal(session.outcome(), 'succeeded');
  assert.equal(session.$('submit').hasAttribute('aria-disabled'), false);
  assert.equal(session.document.announcements.slice(before).length, 2);
});

test('start over resets the journey: lesson closed, nothing chosen, a new key, no result; the focus goes to the first lesson, announced once', OPTIONS, async () => {
  const session = await openSession();
  await session.act('choose', () => session.radios()[1].click(), { announced: 1 });
  await session.act('open', () => session.$('open-lesson').click(), { announced: 1 });
  session.fill({ key: 'over-key-0001', units: 99 });
  await session.act('invalid', () => session.submit(), { announced: 1, check: { afterSubmit: true } });
  const over = await session.act('start over', () => { session.$('start-over').focus(); session.press('Enter'); }, { announced: 1 });
  assert.match(over.text, /^Started over\. Choose a lesson\.$/);
  assert.equal(session.document.activeElement, session.radios()[0]);
  assert.equal(session.$('lesson-mount').children.length, 0);
  assert.deepEqual(session.radios().map((radio) => radio.getAttribute('aria-checked')), ['false', 'false']);
  assert.equal(session.$('open-lesson').getAttribute('aria-disabled'), 'true');
  assert.equal(session.outcome(), 'none');
  assert.equal(session.$('result-empty').hidden, false);
  assert.equal(session.$('error-summary').hidden, true);
  assert.equal(session.$('units').value, '5');
  assert.match(session.$('key').value, /^demo-key-\d{4}$/);
  await session.act('a full journey after the restart', async () => { session.fill({ key: session.$('key').value, units: 1 }); session.submit(); }, { announced: 2 });
  assert.equal(session.outcome(), 'succeeded');
});
