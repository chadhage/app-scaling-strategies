'use strict';

// The REAL page under the DOM stub, driven against the REAL C042 engine through the whole journey and every recovery:
// after EVERY action the checker and the oracle hold, each state change is announced once and never as success when it is not.
const test = require('node:test');
const assert = require('node:assert/strict');
const { c042, gate, openSession } = require('./harness.cjs');

const OPTIONS = { timeout: 20000 };
const refusal = (code, options = { action: 'submit' }) => c042('result.cjs').refusal(code, options);

async function conduct(session, values, label = 'conduct') {
  session.fill(values);
  return session.act(label, () => session.submit(), { announced: 2 });
}

const press = (session, id) => () => { session.$(id).focus(); session.press('Enter'); };

test('a valid step: progress then the explicit result, each announced once, the focus on the result heading, the offered controls drawn', OPTIONS, async () => {
  const session = await openSession();
  const done = await conduct(session, { key: 'flow-key-0001', units: 5 });
  assert.equal(session.document.activeElement.id, 'result-heading');
  assert.equal(session.outcome(), 'succeeded');
  assert.equal(session.$('result-heading').textContent, 'Result: Succeeded');
  assert.equal(done.text, 'Succeeded. Reserved 5 synthetic units on synthetic-lease-001; 5 of 100 are now reserved. Offered: Retry with the same key, Inspect the step.');
  assert.deepEqual(session.buttons(), ['recovery-retry', 'recovery-inspect']);
  assert.match(session.$('facts').textContent, /Reserved after5 of 100/);
  assert.equal(session.$('result').getAttribute('data-recovery'), 'retry inspect');
  assert.equal(session.engine.snapshot().leases['synthetic-lease-001'].committed, 5);
  assert.deepEqual(done.announced.length, 2);
});

test('retry returns the recorded result with exactly one effect and says so; inspect reads the state', OPTIONS, async () => {
  const session = await openSession();
  await conduct(session, { key: 'flow-key-0002', units: 4 });
  const retried = await session.act('retry', press(session, 'recovery-retry'), { announced: 2 });
  assert.match(retried.text, /recorded result of an earlier request; no second reservation was made/);
  assert.equal(session.engine.snapshot().leases['synthetic-lease-001'].committed, 4);
  assert.match(session.$('facts').textContent, /ReplayedYes/);
  await session.act('inspect', press(session, 'recovery-inspect'), { announced: 2 });
  assert.equal(session.outcome(), 'succeeded');
  assert.equal(session.document.activeElement.id, 'result-heading');
});

test('a typed failure names its code and every offered action, never says success, and correct-and-resubmit moves the focus to the form', OPTIONS, async () => {
  const session = await openSession();
  await conduct(session, { key: 'flow-key-0003', lease: 'synthetic-lease-002', units: 10 });
  const failed = await conduct(session, { key: 'flow-key-0004', lease: 'synthetic-lease-002', units: 1 }, 'capacity');
  assert.equal(session.outcome(), 'rejected');
  assert.equal(session.$('result').getAttribute('data-code'), 'CAPACITY_EXHAUSTED');
  assert.equal(failed.text, 'Rejected. Code CAPACITY_EXHAUSTED. The lease does not have that many free synthetic units. No reservation is recorded for this step. Offered: Correct and resubmit.');
  assert.doesNotMatch(failed.text, /succe/i);
  assert.deepEqual(session.buttons(), ['recovery-correct-and-resubmit']);
  const correct = await session.act('correct', press(session, 'recovery-correct-and-resubmit'), { announced: 1 });
  assert.equal(session.document.activeElement.id, 'key');
  assert.match(correct.text, /^Edit the form, then conduct the step again\. Edit the request/);
  assert.doesNotMatch(correct.text, /fresh key/);
  session.fill({ units: 0 + 0 });
  session.fill({ lease: 'synthetic-lease-001', units: 2 });
  await session.act('resubmit with the same key', () => session.submit(), { announced: 2 });
  assert.equal(session.outcome(), 'succeeded');
});

test('a key reused with other inputs is a conflict; correct-and-resubmit then enters a fresh key', OPTIONS, async () => {
  const session = await openSession();
  await conduct(session, { key: 'flow-key-0005', units: 2 });
  const conflict = await conduct(session, { units: 3 }, 'conflict');
  assert.equal(session.$('result').getAttribute('data-code'), 'IDEMPOTENCY_KEY_CONFLICT');
  assert.match(conflict.text, /^Rejected\. Code IDEMPOTENCY_KEY_CONFLICT\. .* Offered: Correct and resubmit, Inspect the step\.$/);
  assert.equal(session.engine.snapshot().leases['synthetic-lease-001'].committed, 2);
  const fresh = await session.act('correct', press(session, 'recovery-correct-and-resubmit'), { announced: 1 });
  assert.match(fresh.text, /A fresh key, demo-key-\d{4}, was entered\./);
  assert.match(session.$('key').value, /^demo-key-\d{4}$/);
  await session.act('resubmit', () => session.submit(), { announced: 2 });
  assert.equal(session.outcome(), 'succeeded');
});

test('no answer at all is the unknown outcome with its own wording: never success, retry and inspect offered, and a retry then works', OPTIONS, async () => {
  const session = await openSession();
  session.fetch.state.fail = true;
  session.fill({ key: 'flow-key-0006', units: 1 });
  const lost = await session.act('network failure', () => session.submit(), { announced: 2 });
  assert.equal(session.outcome(), 'unknown');
  assert.equal(session.$('result').getAttribute('data-code'), 'NO_VALID_RESPONSE');
  assert.match(lost.text, /^Unknown\. Code NO_VALID_RESPONSE\. No answer arrived, so it is not known whether the request was applied\. Nothing is confirmed\. Offered: Retry with the same key, Inspect the step\.$/);
  assert.equal(session.engine.snapshot().leases['synthetic-lease-001'].committed, 0);
  await session.act('retry', press(session, 'recovery-retry'), { announced: 2 });
  assert.equal(session.outcome(), 'succeeded');
  assert.equal(session.engine.snapshot().leases['synthetic-lease-001'].committed, 1);
});

test('a step in flight: the lost answer, an inspect that reports it in flight, then an explicit cancel (nothing is undone)', OPTIONS, async () => {
  const held = gate();
  let drop = true;
  const session = await openSession({ executor: held.executor, wrap: (base) => async (route, options) => {
    if (drop && route === '/v1/steps') { drop = false; base(route, options).catch(() => {}); throw new TypeError('connection lost'); }
    return base(route, options);
  } });
  session.fill({ key: 'flow-key-0007', units: 2 });
  await session.act('submit, answer lost', () => session.submit(), { announced: 2 });
  await held.entered('flow-key-0007');
  assert.equal(session.outcome(), 'unknown');
  const inflight = await session.act('inspect', press(session, 'recovery-inspect'), { announced: 2 });
  assert.equal(session.$('result').getAttribute('data-code'), 'STEP_IN_FLIGHT');
  assert.match(inflight.text, /^Unknown\. Code STEP_IN_FLIGHT\. .* Offered: Cancel the step, Retry with the same key, Inspect the step\.$/);
  assert.deepEqual(session.buttons(), ['recovery-cancel', 'recovery-retry', 'recovery-inspect']);
  const cancelled = await session.act('cancel', press(session, 'recovery-cancel'), { announced: 2 });
  assert.equal(session.outcome(), 'cancelled');
  assert.match(cancelled.text, /^Cancelled\. Code STEP_CANCELLED\. /);
  assert.match(cancelled.text, /Offered: Correct and resubmit, Inspect the step\.$/);
  held.release('flow-key-0007');
  const fresh = await session.act('correct after a cancel enters a fresh key', press(session, 'recovery-correct-and-resubmit'), { announced: 1 });
  assert.match(fresh.text, /A fresh key/);
});

test('an interrupted step (a restart) is reported as interrupted; resume runs it to one effect, never automatically', OPTIONS, async () => {
  const held = gate();
  let drop = true;
  const session = await openSession({ executor: held.executor, wrap: (base) => async (route, options) => {
    if (drop && route === '/v1/steps') { drop = false; base(route, options).catch(() => {}); throw new TypeError('connection lost'); }
    return base(route, options);
  } });
  session.fill({ key: 'flow-key-0008', units: 3 });
  await session.act('submit, answer lost', () => session.submit(), { announced: 2 });
  await held.entered('flow-key-0008');
  await session.restart();
  assert.equal(session.engine.snapshot().leases['synthetic-lease-001'].committed, 0, 'nothing resumed automatically');
  const interrupted = await session.act('inspect after the restart', press(session, 'recovery-inspect'), { announced: 2 });
  assert.equal(session.outcome(), 'interrupted');
  assert.match(interrupted.text, /^Interrupted\. Code STEP_INTERRUPTED\. .* Offered: Resume the step, Cancel the step, Inspect the step\.$/);
  const resumed = await session.act('resume', press(session, 'recovery-resume'), { announced: 2 });
  assert.equal(session.outcome(), 'succeeded');
  assert.match(resumed.text, /^Succeeded\. Reserved 3 synthetic units/);
  assert.equal(session.engine.snapshot().leases['synthetic-lease-001'].committed, 3);
  held.release('flow-key-0008');
});

test('a step that cannot be confirmed (a typed persistence failure) and an unsupported step are shown with their own outcome words', OPTIONS, async () => {
  const session = await openSession();
  session.fetch.state.next = () => session.fetch.answer(refusal('JOURNAL_UNCERTAIN'));
  session.fill({ key: 'flow-key-0009', units: 1 });
  const uncertain = await session.act('uncertain', () => session.submit(), { announced: 2 });
  assert.match(uncertain.text, /^Unknown\. Code JOURNAL_UNCERTAIN\. The journal write could not be confirmed; the effect is not confirmed\. Whether a reservation was recorded is not confirmed\./);
  assert.equal(session.outcome(), 'unknown');
  session.fetch.state.next = () => session.fetch.answer(refusal('UNSUPPORTED_STEP'));
  const unsupported = await session.act('unsupported', press(session, 'recovery-retry'), { announced: 2 });
  assert.match(unsupported.text, /^Unsupported\. Code UNSUPPORTED_STEP\. /);
  assert.equal(session.outcome(), 'unsupported');
  assert.deepEqual(session.buttons(), ['recovery-correct-and-resubmit']);
});

test('a refusal without recovery actions says so in a visible note', OPTIONS, async () => {
  const session = await openSession();
  session.fetch.state.next = () => session.fetch.answer(refusal('STEP_LIMIT_REACHED'));
  session.fill({ key: 'flow-key-0010', units: 1 });
  const limited = await session.act('limit', () => session.submit(), { announced: 2 });
  assert.match(limited.text, /No recovery action is offered\.$/);
  assert.equal(session.$('recovery-note').hidden, false);
  assert.equal(session.$('recovery-block').hidden, true);
  assert.equal(session.document.activeElement.id, 'result-heading');
});
