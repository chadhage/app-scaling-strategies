'use strict';

// The journey's pure rules: client-side validation of the closed input (every field and every code) and the wording that is
// RE-DERIVED from facts (never from server prose).
const test = require('node:test');
const assert = require('node:assert/strict');
const journey = require('../journey.js');
const { c042 } = require('./harness.cjs');

const OPTIONS = { timeout: 20000 };
const valid = { key: 'good-key-0001', lease: 'synthetic-lease-001', units: '5' };

test('validateForm builds the closed input from a valid form', OPTIONS, () => {
  assert.deepEqual(journey.validateForm(valid), { ok: true, input: { schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: 'good-key-0001', leaseId: 'synthetic-lease-001', units: 5 } });
  assert.equal(journey.validateForm({ ...valid, units: '10' }).input.units, 10);
  assert.equal(journey.validateForm({ ...valid, units: 7 }).input.units, 7);
});

const INVALID = [
  [{ key: '' }, 'key', 'KEY_REQUIRED'], [{ key: 'short' }, 'key', 'KEY_FORMAT'], [{ key: ' leading-space-1' }, 'key', 'KEY_FORMAT'], [{ key: '-starts-badly-1' }, 'key', 'KEY_FORMAT'],
  [{ key: 'a'.repeat(65) }, 'key', 'KEY_FORMAT'], [{ key: 'bad key with spaces' }, 'key', 'KEY_FORMAT'],
  [{ lease: '' }, 'lease', 'LEASE_UNKNOWN'], [{ lease: 'synthetic-lease-003' }, 'lease', 'LEASE_UNKNOWN'], [{ lease: '__proto__' }, 'lease', 'LEASE_UNKNOWN'], [{ lease: 'constructor' }, 'lease', 'LEASE_UNKNOWN'],
  [{ units: '' }, 'units', 'UNITS_REQUIRED'], [{ units: '1.5' }, 'units', 'UNITS_NOT_INTEGER'], [{ units: '1e1' }, 'units', 'UNITS_NOT_INTEGER'], [{ units: '-1' }, 'units', 'UNITS_NOT_INTEGER'],
  [{ units: '+1' }, 'units', 'UNITS_NOT_INTEGER'], [{ units: ' 1' }, 'units', 'UNITS_NOT_INTEGER'], [{ units: '0x1' }, 'units', 'UNITS_NOT_INTEGER'], [{ units: '1234567' }, 'units', 'UNITS_NOT_INTEGER'],
  [{ units: '0' }, 'units', 'UNITS_RANGE'], [{ units: '11' }, 'units', 'UNITS_RANGE'], [{ units: '999999' }, 'units', 'UNITS_RANGE'],
];

for (const [change, field, code] of INVALID) {
  test(`validateForm: ${JSON.stringify(change)} is ${code} on ${field} with its fixed message`, OPTIONS, () => {
    const verdict = journey.validateForm({ ...valid, ...change });
    assert.equal(verdict.ok, false);
    assert.deepEqual(verdict.problems.map((problem) => [problem.field, problem.code]), [[field, code]]);
    assert.equal(verdict.problems[0].message, journey.MESSAGES[code]);
  });
}

test('validateForm with nothing at all reports every field once, in form order', OPTIONS, () => {
  assert.deepEqual(journey.validateForm().problems.map((problem) => problem.code), ['KEY_REQUIRED', 'LEASE_UNKNOWN', 'UNITS_REQUIRED']);
  assert.deepEqual(journey.validateForm({}).problems.map((problem) => problem.field), ['key', 'lease', 'units']);
});

test('validationView counts fields, not problems, and names each field once', OPTIONS, () => {
  const view = journey.validationView(journey.validateForm({ key: 'x', lease: 'x', units: '' }).problems);
  assert.equal(view.outcome, 'validation');
  assert.equal(view.announcement, 'Not submitted: 3 fields need correction: Idempotency key, Lease, Units. The first invalid field has the focus.');
  assert.match(journey.validationView([{ field: 'units', code: 'UNITS_RANGE', message: 'x' }]).announcement, /^Not submitted: 1 field needs correction: Units\./);
});

test('present derives every shown line from the validated facts; the explanation is the catalog text, never the answer text', OPTIONS, async () => {
  const engine = await c042('engine.cjs').openEngine({ io: c042('journal.cjs').createMemoryIo() });
  const sent = { schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: 'jr-key-0001', leaseId: 'synthetic-lease-002', units: 3 };
  const expected = { key: 'jr-key-0001', input: sent };
  const done = await engine.submit(sent);
  const view = journey.present(done, expected);
  assert.equal(view.ok, true);
  assert.deepEqual(view.actions, ['retry', 'inspect']);
  assert.equal(view.heading, 'Result: Succeeded');
  assert.deepEqual(view.facts.find(([name]) => name === 'Reserved after'), ['Reserved after', '3 of 10']);
  assert.deepEqual(view.didNot, done.body.didNot.map((item) => c042('contract.js').DIDNOT[item.code]));
  assert.equal(journey.present(await engine.submit(sent), expected).announcement.includes('recorded result of an earlier request'), true);
  const failed = journey.present(c042('result.cjs').refusal('CAPACITY_EXHAUSTED', { action: 'submit' }), expected);
  assert.equal(failed.outcome, 'rejected');
  assert.equal(failed.announcement, 'Rejected. Code CAPACITY_EXHAUSTED. The lease does not have that many free synthetic units. No reservation is recorded for this step. Offered: Correct and resubmit.');
  const bare = journey.present(c042('result.cjs').refusal('STEP_LIMIT_REACHED', { action: 'submit' }), expected);
  assert.deepEqual(bare.actions, []);
  assert.match(bare.announcement, /No recovery action is offered\.$/);
});

test('localFailure is always the unknown outcome with the page\'s own words', OPTIONS, () => {
  const lost = journey.localFailure('NO_VALID_RESPONSE', []);
  assert.equal(lost.outcome, 'unknown');
  assert.equal(lost.announcement, 'Unknown. Code NO_VALID_RESPONSE. No answer arrived, so it is not known whether the request was applied. Nothing is confirmed. No recovery action is offered.');
  const rejected = journey.localFailure('ANSWER_REJECTED', ['retry'], 'ENVELOPE_INVALID');
  assert.deepEqual(rejected.facts.at(-1), ['Check that failed', 'ENVELOPE_INVALID']);
  assert.doesNotMatch(lost.announcement, /succe|done/i);
});

test('the wording table: every outcome word has a symbol, every request and state has a label, and the sentences are fixed', OPTIONS, () => {
  for (const outcome of c042('contract.js').OUTCOMES) assert.equal(journey.WORDS[outcome].length, 2, outcome);
  assert.deepEqual(journey.LEASES, ['synthetic-lease-001', 'synthetic-lease-002']);
  assert.equal(journey.labelOf('retry'), 'Retry with the same key');
  assert.equal(journey.say.opened({ id: 'A-S001' }), 'A-S001 opened in an isolated frame. Press Tab to enter it; Shift+Tab or Close the lesson leaves it. Nothing was run or certified.');
  assert.equal(journey.say.chosen({ id: 'A-S001', title: 'T' }, true), 'A-S001 chosen: T. The open lesson was closed. Open it, or go on to conduct the step.');
  assert.match(journey.say.correct('demo-key-0009'), /A fresh key, demo-key-0009, was entered\./);
  assert.match(journey.say.progress('inspect'), /^Working on "Inspect the step"\./);
});
