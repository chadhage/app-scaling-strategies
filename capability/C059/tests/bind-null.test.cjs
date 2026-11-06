'use strict';

// Second review, N2: the answer binding (review F6) skipped its checks when the envelope's idempotencyKey was null, so a valid envelope of ANOTHER step
// (lease-002, 9 units) with idempotencyKey, validatedInput and inputSha256 set to null was shown, announced as success and adopted. An envelope that confirms
// a step (accepted, so every success) must carry the key of the request and an echoed input; only a refusal may carry neither. Every combination of the three
// fields (the real value, null, deleted) is tried on every kind of confirming answer the engine produces, against the REAL C042 engine and the REAL page.
const test = require('node:test');
const assert = require('node:assert/strict');
const journey = require('../journey.js');
const { c042, gate, openSession } = require('./harness.cjs');

const OPTIONS = { timeout: 30000 };
const clone = (value) => JSON.parse(JSON.stringify(value));
const input = (over = {}) => ({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: 'bind-null-0001', leaseId: 'synthetic-lease-001', units: 3, ...over });
const freshEngine = (executor) => c042('engine.cjs').openEngine({ io: c042('journal.cjs').createMemoryIo(), ...(executor ? { executor } : {}) });
const FIELDS = ['idempotencyKey', 'validatedInput', 'inputSha256'];
const VARIANTS = ['real', 'null', 'deleted'];

// Every kind of ACCEPTED answer the engine produces, each with the expectation of the request it answers.
async function accepted() {
  const mine = input();
  const engine = await freshEngine();
  const first = await engine.submit(mine);
  const again = await engine.submit(mine);
  const held = gate();
  const slow = await freshEngine(held.executor);
  const running = slow.submit(input({ idempotencyKey: 'bind-null-0002' }));
  await held.entered('bind-null-0002');
  const cancelled = slow.cancel('bind-null-0002');
  held.release('bind-null-0002');
  await running;
  return [
    ['a succeeded submit (201)', first, { key: mine.idempotencyKey, input: mine }],
    ['the replay of a submit (200)', again, { key: mine.idempotencyKey, input: mine }],
    ['an inspect of a committed step (200)', engine.inspect(mine.idempotencyKey), { key: mine.idempotencyKey, input: null }],
    ['a cancel of a step in flight (200, cancelled)', cancelled, { key: 'bind-null-0002', input: null }],
  ];
}

// A valid envelope of ANOTHER step with the three fields varied.
function variant(answer, [key, echoed, digest]) {
  const body = clone(answer.body);
  for (const [field, kind] of [['idempotencyKey', key], ['validatedInput', echoed], ['inputSha256', digest]]) {
    if (kind === 'null') body[field] = null;
    else if (kind === 'deleted') delete body[field];
  }
  return { status: answer.status, body };
}

test('N2: every combination of the key, the echoed input and its digest (real, null, deleted) on every kind of accepted answer: only the genuine answer of the request is shown', OPTIONS, async () => {
  for (const [kind, genuine, expected] of await accepted()) {
    assert.equal(genuine.body.accepted, true, `${kind} is an accepted answer`);
    assert.equal(journey.present(genuine, expected).ok, true, `${kind}: the genuine answer is shown`);
    for (const key of VARIANTS) for (const echoed of VARIANTS) for (const digest of VARIANTS) {
      const label = `${kind}, key ${key}, input ${echoed}, digest ${digest}`;
      const view = journey.present(variant(genuine, [key, echoed, digest]), expected);
      const genuineCombination = key === 'real' && echoed === 'real' && digest === 'real';
      assert.equal(view.ok, genuineCombination, label);
      if (genuineCombination) continue;
      // Without a deleted field, a null key beside a real input, and a digest that does not match its input, the pinned contract refuses the shape itself;
      // the two shapes it ALLOWS (everything null, or only the key) are the ones the binding has to refuse.
      const shapeAllowed = [key, echoed, digest].every((item) => item !== 'deleted') && (echoed === 'null') === (digest === 'null') && (echoed === 'null' || key === 'real');
      assert.equal(view.code, shapeAllowed ? (key === 'null' ? 'KEY_MISMATCH' : 'INPUT_MISMATCH') : 'ENVELOPE_INVALID', label);
    }
  }
});

test('N2: a valid envelope of ANOTHER step (lease-002, 9 units) with idempotencyKey, validatedInput and inputSha256 null is refused for a request of lease-001 x 3 (the reviewer probe)', OPTIONS, async () => {
  const engine = await freshEngine();
  const other = await engine.submit(input({ idempotencyKey: 'bind-null-0009', leaseId: 'synthetic-lease-002', units: 9 }));
  const forged = clone(other.body);
  forged.idempotencyKey = null;
  forged.validatedInput = null;
  forged.inputSha256 = null;
  const view = journey.present({ status: other.status, body: forged }, { key: 'bind-null-0001', input: input() });
  assert.deepEqual([view.ok, view.code], [false, 'KEY_MISMATCH']);
  assert.equal(journey.present({ status: other.status, body: forged }, { key: 'bind-null-0001', input: null }).code, 'KEY_MISMATCH', 'also for a request without an input');
});

test('N2 control: a refusal that carries no key and no input (a typed refusal before the key was known) is still shown for a request that had a key; so is an engine rejection with its key', OPTIONS, async () => {
  const mine = input({ idempotencyKey: 'bind-null-0003' });
  const refusal = c042('result.cjs').refusal('UNSUPPORTED_MEDIA_TYPE', { action: 'submit' });
  assert.deepEqual([refusal.body.idempotencyKey, refusal.body.validatedInput, refusal.body.inputSha256, refusal.body.accepted], [null, null, null, false]);
  const shown = journey.present(refusal, { key: mine.idempotencyKey, input: mine });
  assert.equal(shown.ok, true, 'a refusal needs no key');
  assert.equal(shown.outcome, 'rejected');
  const engine = await freshEngine();
  await engine.submit(input({ idempotencyKey: 'bind-null-0004', leaseId: 'synthetic-lease-002', units: 10 }));
  const full = await engine.submit(input({ idempotencyKey: 'bind-null-0005', leaseId: 'synthetic-lease-002', units: 1 }));
  assert.equal(full.body.error.code, 'CAPACITY_EXHAUSTED');
  assert.equal(journey.present(full, { key: 'bind-null-0005', input: input({ idempotencyKey: 'bind-null-0005', leaseId: 'synthetic-lease-002', units: 1 }) }).ok, true);
  assert.equal(journey.present(full, { key: 'bind-null-0006', input: null }).code, 'KEY_MISMATCH', 'a rejection of ANOTHER key is still refused');
});

test('N2 in the page: the forged null-key envelope of another step answering a submit, an inspect and a retry is rejected as KEY_MISMATCH and never adopted', OPTIONS, async () => {
  const engine = await freshEngine();
  const other = await engine.submit(input({ idempotencyKey: 'other-key-0002', leaseId: 'synthetic-lease-002', units: 9 }));
  const forged = () => { const body = clone(other.body); body.idempotencyKey = null; body.validatedInput = null; body.inputSha256 = null; return { status: other.status, body }; };
  const session = await openSession();
  session.fill({ key: 'bind-null-0007', units: 2 });
  const attempts = [['submit', () => session.submit()], ['inspect', () => { session.$('recovery-inspect').focus(); session.press('Enter'); }], ['retry', () => { session.$('recovery-retry').focus(); session.press('Enter'); }]];
  for (const [name, action] of attempts) {
    session.fetch.state.next = () => session.fetch.answer(forged());
    await session.act(`${name} answered by a forged envelope`, action, { announced: 2 });
    assert.equal(session.outcome(), 'unknown', name);
    assert.equal(session.$('result').getAttribute('data-code'), 'ANSWER_REJECTED', name);
    assert.match(session.$('facts').textContent, /Check that failedKEY_MISMATCH/, name);
    assert.doesNotMatch(session.$('result').textContent, /Reserved 9|9 of 10|lease-002/, name);
    assert.doesNotMatch(session.document.documentElement.textContent, /Reserved 9|9 of 10/, name);
    assert.equal(session.engine.snapshot().leases['synthetic-lease-001'].committed, 0, `${name}: nothing was applied`);
  }
});
