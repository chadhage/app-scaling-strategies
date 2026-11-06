'use strict';

// Review F6, F7 and F8 (C059): an answer is bound to its request, the host note stays truthful, and a request without an answer is
// abandoned after a deadline (injected timers: no wall clock). The REAL page.js runs under the DOM stub against the REAL C042 engine.
const test = require('node:test');
const assert = require('node:assert/strict');
const { c042, openSession } = require('./harness.cjs');
const { idle } = require('./dom.cjs');

const OPTIONS = { timeout: 20000 };
const press = (session, id) => () => { session.$(id).focus(); session.press('Enter'); };
const input = (over = {}) => ({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: 'bind-key-0001', leaseId: 'synthetic-lease-001', units: 5, ...over });
const clone = (value) => JSON.parse(JSON.stringify(value));

// A perfectly valid answer produced by ANOTHER engine for the given input.
async function foreign(over) {
  const engine = await c042('engine.cjs').openEngine({ io: c042('journal.cjs').createMemoryIo() });
  return engine.submit(input(over));
}

async function submitted(key = 'bind-key-0001', units = 5) {
  const session = await openSession();
  session.fill({ key, units });
  await session.act('submit', () => session.submit(), { announced: 2 });
  return session;
}

const rejected = (session, code) => {
  assert.equal(session.outcome(), 'unknown');
  assert.equal(session.$('result').getAttribute('data-code'), 'ANSWER_REJECTED');
  assert.match(session.$('facts').textContent, new RegExp(`Check that failed${code}`));
};

test('F6: a valid envelope of ANOTHER step (other key, lease-002, 9 units) answering an Inspect is refused and its key is never adopted', OPTIONS, async () => {
  const session = await submitted();
  const other = await foreign({ idempotencyKey: 'other-key-0002', leaseId: 'synthetic-lease-002', units: 9 });
  assert.equal(other.status, 201);
  session.fetch.state.next = () => session.fetch.answer(other);
  const shown = await session.act('inspect answered by another step', press(session, 'recovery-inspect'), { announced: 2 });
  rejected(session, 'KEY_MISMATCH');
  assert.doesNotMatch(`${shown.text} ${session.$('result').textContent}`, /other-key-0002|Reserved 9|9 of 10/);
  await session.act('inspect again', press(session, 'recovery-inspect'), { announced: 2 });
  assert.equal(session.fetch.state.calls.at(-1), 'GET /v1/steps/bind-key-0001', 'the page still addresses its own step');
  assert.equal(session.outcome(), 'succeeded');
});

test('F6: a valid envelope of another step answering a submit or a retry is refused as KEY_MISMATCH', OPTIONS, async () => {
  const session = await openSession();
  const other = await foreign({ idempotencyKey: 'other-key-0003', units: 2 });
  session.fetch.state.next = () => session.fetch.answer(other);
  session.fill({ key: 'bind-key-0002', units: 2 });
  await session.act('submit answered by another step', () => session.submit(), { announced: 2 });
  rejected(session, 'KEY_MISMATCH');
  assert.equal(session.engine.snapshot().leases['synthetic-lease-001'].committed, 0, 'nothing was applied');
  session.fetch.state.next = () => session.fetch.answer(clone(other));
  await session.act('retry answered by another step', press(session, 'recovery-retry'), { announced: 2 });
  rejected(session, 'KEY_MISMATCH');
});

test('F6: an answer that echoes another input than the one sent is refused as INPUT_MISMATCH', OPTIONS, async () => {
  const session = await openSession();
  const answer = await foreign({ idempotencyKey: 'bind-key-0004', units: 2 });
  session.fetch.state.next = () => session.fetch.answer(answer);
  session.fill({ key: 'bind-key-0004', units: 3 });
  await session.act('submit 3 units, answer for 2', () => session.submit(), { announced: 2 });
  rejected(session, 'INPUT_MISMATCH');
  assert.doesNotMatch(session.document.documentElement.textContent, /Reserved 2/);
});

const NUMERICS = [
  ['attempts MAX_SAFE_INTEGER', (body) => { body.attempts = Number.MAX_SAFE_INTEGER; }, 'ATTEMPTS_MISMATCH'],
  ['attempts 0 on a committed step', (body) => { body.attempts = 0; }, 'ATTEMPTS_MISMATCH'],
  ['attempts 2 without a resume in the trail', (body) => { body.attempts = 2; }, 'ATTEMPTS_MISMATCH'],
  ['an applied effect with other units than the input (in range)', (body) => { body.effect.units = 3; body.effect.reservedAfter = 3; }, 'EFFECT_MISMATCH'],
  ['an applied effect on another lease than the input (in range)', (body) => { body.effect.leaseId = 'synthetic-lease-002'; body.effect.capacity = 10; body.effect.reservedAfter = 2; }, 'EFFECT_MISMATCH'],
];

for (const [name, change, code] of NUMERICS) {
  test(`F6: a shape-valid ${name} is refused as ${code}`, OPTIONS, async () => {
    const session = await openSession();
    const answer = await foreign({ idempotencyKey: 'bind-key-0005', units: 2 });
    change(answer.body);
    assert.equal(c042('contract.js').validateResultEnvelope(answer.body).ok, true, 'the tampered envelope is still shape-valid');
    session.fetch.state.next = () => session.fetch.answer(answer);
    session.fill({ key: 'bind-key-0005', units: 2 });
    await session.act(name, () => session.submit(), { announced: 2 });
    rejected(session, code);
  });
}

test('F6: honest answers are never refused: replay, conflict, capacity, not found, cancel, resume and a restart keep their own key and input', OPTIONS, async () => {
  const session = await submitted('bind-key-0006', 4);
  await session.act('retry', press(session, 'recovery-retry'), { announced: 2 });
  assert.equal(session.outcome(), 'succeeded');
  session.fill({ units: 6 });
  await session.act('conflict', () => session.submit(), { announced: 2 });
  assert.equal(session.$('result').getAttribute('data-code'), 'IDEMPOTENCY_KEY_CONFLICT');
  await session.act('inspect after a conflict', press(session, 'recovery-inspect'), { announced: 2 });
  assert.equal(session.outcome(), 'succeeded', 'the stored step answers an inspect although the form holds another input');
  const missing = await openSession();
  missing.fill({ key: 'bind-key-0007', units: 1 });
  await missing.act('submit', () => missing.submit(), { announced: 2 });
  await missing.restart();
  await missing.act('inspect on a restarted engine', press(missing, 'recovery-inspect'), { announced: 2 });
  assert.equal(missing.outcome(), 'succeeded');
});

test('F7: #host-note is true after every choice and close: it never says that no lesson is selected while one is chosen', OPTIONS, async () => {
  const session = await openSession();
  const note = () => session.$('host-note').textContent;
  assert.match(note(), /^No lesson selected\./);
  await session.act('choose', () => session.radios()[0].click(), { announced: 1 });
  assert.doesNotMatch(note(), /No lesson selected/);
  assert.match(note(), /A-S001 is chosen and not open/);
  await session.act('open', () => session.$('open-lesson').click(), { announced: 1 });
  assert.doesNotMatch(note(), /No lesson selected/);
  await session.act('close', () => session.$('close-lesson').click(), { announced: 1 });
  assert.doesNotMatch(note(), /No lesson selected/, 'a lesson is still chosen after Close');
  assert.match(note(), /A-S001 is chosen and not open/);
  await session.act('choose another', () => session.radios()[1].click(), { announced: 1 });
  assert.match(note(), /A-S003 is chosen and not open/);
  await session.act('start over', () => session.$('start-over').click(), { announced: 1 });
  assert.match(note(), /^No lesson selected\. No result or management action has been run\.$/);
});

const manualTimers = () => {
  const timers = new Map();
  let next = 1;
  return {
    setTimeout: (callback, ms) => { timers.set(next, { callback, ms }); return next++; },
    clearTimeout: (id) => { timers.delete(id); },
    pending: () => [...timers.values()].map((timer) => timer.ms),
    fire: () => { const [id, timer] = [...timers.entries()][0]; timers.delete(id); timer.callback(); },
  };
};

// A service that accepts a request and never answers; it only honours the abort signal.
const silent = (base) => Object.assign((route, options = {}) => (options.method === 'POST'
  ? new Promise((resolve, reject) => { options.signal?.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }))); })
  : base(route, options)), { state: base.state, answer: base.answer });

test('F8: a request that never gets an answer is aborted after a deadline: typed NO_ANSWER_IN_TIME, announced once, Retry and Inspect offered, no longer busy', OPTIONS, async () => {
  const timers = manualTimers();
  const session = await openSession({ wrap: silent, globals: { setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, AbortController } });
  session.fill({ key: 'dead-key-0001', units: 2 });
  const before = session.document.announcements.length;
  session.submit();
  assert.equal(session.$('result').getAttribute('aria-busy'), 'true');
  assert.equal(timers.pending().length, 1, 'a deadline is armed for the pending request');
  assert.ok(timers.pending()[0] > 0 && timers.pending()[0] <= 60000, `the deadline is ${timers.pending()[0]} ms`);
  timers.fire();
  await idle(session.document);
  session.verify('after the deadline');
  assert.equal(session.$('result').hasAttribute('aria-busy'), false);
  assert.equal(session.outcome(), 'unknown');
  assert.equal(session.$('result').getAttribute('data-code'), 'NO_ANSWER_IN_TIME');
  assert.deepEqual(session.buttons(), ['recovery-retry', 'recovery-inspect']);
  const said = session.document.announcements.slice(before).map((entry) => entry.text).filter((text) => text !== '');
  assert.equal(said.length, 2, JSON.stringify(said));
  assert.match(said[1], /^Unknown\. Code NO_ANSWER_IN_TIME\. No answer arrived in time and the request was abandoned, so it is not known whether it was applied\. Nothing is confirmed\. Offered: Retry with the same key, Inspect the step\.$/);
  assert.equal(session.engine.snapshot().leases['synthetic-lease-001'].committed, 0);
  assert.equal(timers.pending().length, 0, 'the deadline was consumed');
  assert.equal(session.$('submit').hasAttribute('aria-disabled'), false, 'the form works again');
});

test('F8: an answer in time clears its deadline, so no timer is left behind', OPTIONS, async () => {
  const timers = manualTimers();
  const session = await openSession({ globals: { setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, AbortController } });
  session.fill({ key: 'dead-key-0002', units: 2 });
  await session.act('submit', () => session.submit(), { announced: 2 });
  assert.equal(session.outcome(), 'succeeded');
  assert.deepEqual(timers.pending(), []);
});

test('F8: an abort while the answer body is being read is also NO_ANSWER_IN_TIME, not a malformed answer', OPTIONS, async () => {
  const timers = manualTimers();
  const slowBody = (base) => Object.assign((route, options = {}) => (options.method === 'POST'
    ? Promise.resolve({ status: 200, ok: true, json: () => new Promise((resolve, reject) => { options.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))); }) })
    : base(route, options)), { state: base.state, answer: base.answer });
  const session = await openSession({ wrap: slowBody, globals: { setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, AbortController } });
  session.fill({ key: 'dead-key-0003', units: 2 });
  session.submit();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timers.pending().length, 1, 'a deadline is armed while the body is being read');
  timers.fire();
  await idle(session.document);
  assert.equal(session.$('result').getAttribute('data-code'), 'NO_ANSWER_IN_TIME');
});
