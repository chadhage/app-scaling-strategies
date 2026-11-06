'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const contract = require('../contract.js');
const { digestInput } = require('../input.cjs');
const result = require('../result.cjs');
const { valid } = require('./support.cjs');

const input = Object.freeze(valid());
const step = (state, extra = {}) => ({
  key: input.idempotencyKey, input, inputSha256: digestInput(input), state, trail: [{ seq: 1, type: 'begin' }], commit: null, attempts: 1, ...extra,
});
const committed = step('committed', { trail: [{ seq: 1, type: 'begin' }, { seq: 2, type: 'commit' }], commit: { leaseId: input.leaseId, units: 5, reservedAfter: 5 } });
const success = () => structuredClone(result.build({ action: 'submit', accepted: true, byThis: true, step: committed }).body);

test('the closed catalogs are consistent and frozen', () => {
  assert.equal(Object.isFrozen(contract.ERRORS), true);
  assert.deepEqual(contract.ACTION_NAMES, ['retry', 'correct-and-resubmit', 'cancel', 'resume', 'inspect']);
  assert.deepEqual(contract.OUTCOMES.map((name) => contract.CLASSIFICATIONS[name]), ['COMPLETED', 'FAILED', 'UNSUPPORTED', 'UNKNOWN', 'CANCELLED', 'INTERRUPTED']);
  for (const [code, entry] of Object.entries(contract.ERRORS)) {
    assert.match(code, /^[A-Z_]+$/);
    assert.equal(contract.OUTCOMES.includes(entry.outcome) && entry.outcome !== 'succeeded' && entry.outcome !== 'cancelled' || code === 'STEP_CANCELLED', true, code);
    assert.equal(Number.isInteger(entry.status) && entry.status >= 400 && entry.status <= 599, true, code);
    assert.equal(entry.actions === null || entry.actions.every((name) => contract.ACTION_NAMES.includes(name)), true, code);
    assert.match(entry.message, /^[A-Z].*[.]$/, code);
  }
  for (const [name, action] of Object.entries(contract.ACTIONS)) {
    assert.deepEqual(Object.keys(action).sort(), ['description', 'label', 'method', 'path']);
    assert.equal(['GET', 'POST'].includes(action.method), true, name);
  }
  assert.deepEqual(contract.allowedActions('interrupted'), ['resume', 'cancel', 'inspect']);
  assert.deepEqual(contract.allowedActions('constructor'), []);
  assert.deepEqual(contract.allowedActions(undefined), []);
});

test('every typed code builds a valid envelope for every request action, and only success is 2xx', () => {
  for (const code of Object.keys(contract.ERRORS)) {
    for (const action of contract.REQUEST_ACTIONS) {
      const { status, body } = result.refusal(code, { action });
      assert.deepEqual(contract.validateResultEnvelope(body), { ok: true, problems: [] }, `${code}/${action}`);
      assert.equal(status, contract.ERRORS[code].status);
      assert.equal(body.accepted, false);
      assert.equal(status >= 200 && status < 300, false, `${code} must not look like success`);
      assert.notEqual(body.outcome, 'succeeded');
    }
  }
});

test('success is built only from a journaled commit', () => {
  assert.throws(() => result.build({ action: 'submit', accepted: true, step: step('in-flight') }), /Only a journaled effect/);
  assert.throws(() => result.build({ action: 'submit', input }), /Only a journaled effect/);
  const first = result.build({ action: 'submit', accepted: true, byThis: true, step: committed });
  assert.equal(first.status, 201);
  const replay = result.build({ action: 'submit', accepted: true, replayed: true, step: committed });
  assert.deepEqual([replay.status, replay.body.replayed, replay.body.effect.appliedByThisRequest], [200, true, false]);
  assert.deepEqual(replay.body.didNot.map((item) => item.code), ['NO_EFFECT_BY_THIS_REQUEST', 'NO_SECOND_EFFECT', 'NO_UNDO', 'NO_CLOUD_CALL']);
});

test('every step state maps to an honest outcome, classification and offered recovery', () => {
  const expectations = [
    ['in-flight', 'STEP_IN_FLIGHT', 'unknown', 'UNKNOWN', false, ['cancel', 'retry', 'inspect']],
    ['interrupted', 'STEP_INTERRUPTED', 'interrupted', 'INTERRUPTED', false, ['resume', 'cancel', 'inspect']],
    ['cancelled', 'STEP_CANCELLED', 'cancelled', 'CANCELLED', true, ['correct-and-resubmit', 'inspect']],
    ['uncertain', 'JOURNAL_UNCERTAIN', 'unknown', 'UNKNOWN', false, ['retry', 'inspect']],
  ];
  for (const [state, code, outcome, classification, terminal, allowed] of expectations) {
    const trail = state === 'cancelled' ? [{ seq: 1, type: 'begin' }, { seq: 2, type: 'cancel' }] : [{ seq: 1, type: 'begin' }];
    const { body } = result.build({ action: 'inspect', accepted: true, step: step(state, { trail }), errorCode: code });
    assert.deepEqual([body.outcome, body.classification, body.terminal, body.recovery.allowed], [outcome, classification, terminal, allowed], state);
    assert.equal(body.effect.applied, state === 'uncertain' ? null : false, state);
    assert.equal(contract.validateResultEnvelope(body).ok, true, state);
  }
});

const mutations = [
  ['a missing key', (e) => { delete e.scope; }, 'ENVELOPE_KEYS'],
  ['an extra key', (e) => { e.extra = 1; }, 'ENVELOPE_KEYS'],
  ['a foreign kind', (e) => { e.kind = 'x'; }, 'IDENTITY'],
  ['another schema version', (e) => { e.schemaVersion = 2; }, 'IDENTITY'],
  ['a foreign scope', (e) => { e.scope = 'cloud'; }, 'IDENTITY'],
  ['an unknown action', (e) => { e.action = 'undo'; }, 'ACTION'],
  ['a non-boolean flag', (e) => { e.accepted = 'yes'; }, 'FLAGS'],
  ['an unknown outcome', (e) => { e.outcome = 'success'; }, 'OUTCOME'],
  ['a classification that disagrees', (e) => { e.classification = 'FAILED'; }, 'OUTCOME'],
  ['an unknown state', (e) => { e.step.state = 'done'; }, 'STEP'],
  ['an effect flag that is not boolean or null', (e) => { e.effect.applied = 'yes'; }, 'PARTS'],
  ['an unknown lease', (e) => { e.effect.leaseId = 'x'; }, 'PARTS'],
  ['units beyond the range', (e) => { e.effect.units = 99; }, 'PARTS'],
  ['a capacity that is not the lease capacity', (e) => { e.effect.capacity = 5; }, 'PARTS'],
  ['units without a lease', (e) => { e.effect.leaseId = null; }, 'PARTS'],
  ['no what-did-not statements', (e) => { e.didNot = []; }, 'PARTS'],
  ['a changed statement text', (e) => { e.didNot[0].text = 'changed'; }, 'PARTS'],
  ['an unknown statement code', (e) => { e.didNot[0].code = 'NO_X'; }, 'PARTS'],
  ['an error that is not in the catalog', (e) => { e.error = { code: 'X', group: 'x', message: 'x', details: [] }; }, 'PARTS'],
  ['an unknown recovery action', (e) => { e.recovery.allowed = ['undo']; }, 'PARTS'],
  ['a repeated recovery action', (e) => { e.recovery.allowed = ['retry', 'retry']; }, 'PARTS'],
  ['an empty recovery reason', (e) => { e.recovery.reason = ''; }, 'PARTS'],
  ['a trail with sequence 0', (e) => { e.trail[0].seq = 0; }, 'PARTS'],
  ['a trail that does not increase', (e) => { e.trail[1].seq = 1; }, 'PARTS'],
  ['an input with an extra key', (e) => { e.validatedInput.extra = 1; }, 'VALIDATED_INPUT'],
  ['an input outside the range', (e) => { e.validatedInput.units = 0; }, 'VALIDATED_INPUT'],
  ['a malformed digest', (e) => { e.inputSha256 = 'abc'; }, 'INPUT_DIGEST'],
  ['a digest without an input', (e) => { e.validatedInput = null; }, 'INPUT_DIGEST'],
  ['a malformed key', (e) => { e.idempotencyKey = 'x'; }, 'KEY'],
  ['negative attempts', (e) => { e.attempts = -1; }, 'ATTEMPTS'],
  ['success in a step that is only in flight', (e) => { e.step.state = 'in-flight'; }, 'SUCCESS_NEEDS_JOURNALED_EFFECT'],
  ['success without an applied effect', (e) => { e.effect.applied = false; }, 'SUCCESS_NEEDS_JOURNALED_EFFECT'],
  ['success that is not terminal', (e) => { e.terminal = false; }, 'SUCCESS_NEEDS_JOURNALED_EFFECT'],
  ['success that was not accepted', (e) => { e.accepted = false; }, 'SUCCESS_NEEDS_JOURNALED_EFFECT'],
  ['an applied effect outside a committed step', (e) => { e.step.state = 'cancelled'; }, 'EFFECT_STATE'],
  ['a missing reservation total', (e) => { e.effect.reservedAfter = null; }, 'RESERVED_AFTER'],
  ['an unknown effect in a committed step', (e) => { e.effect.applied = null; }, 'EFFECT_STATE'],
  ['an error beside a success', (e) => { e.error = result.refusal('INVALID_JSON').body.error; }, 'ERROR_PRESENCE'],
  ['an effect applied by a replay', (e) => { e.replayed = true; }, 'EFFECT_ATTRIBUTION'],
  ['an effect applied by an inspection', (e) => { e.action = 'inspect'; }, 'EFFECT_ATTRIBUTION'],
  ['an accepted cancel that did not cancel', (e) => { e.action = 'cancel'; e.effect.appliedByThisRequest = false; }, 'ACCEPTED_MEANING'],
  ['a key that differs from the validated input', (e) => { e.idempotencyKey = 'key-9999-zzzz'; }, 'KEY_MATCH'],
  ['a commit that is not the last record', (e) => { e.trail[1].type = 'begin'; }, 'COMMIT_TRAILS'],
  ['a step-less success', (e) => { e.step.state = 'none'; e.trail = []; }, 'SUCCESS_NEEDS_JOURNALED_EFFECT'],
];

test('the envelope validator refuses every structural and honesty violation', () => {
  assert.deepEqual(contract.validateResultEnvelope(success()), { ok: true, problems: [] });
  for (const [name, mutate, expected] of mutations) {
    const envelope = success();
    mutate(envelope);
    const verdict = contract.validateResultEnvelope(envelope);
    assert.equal(verdict.ok, false, name);
    assert.equal(verdict.problems.includes(expected), true, `${name}: ${verdict.problems}`);
  }
  for (const value of [null, undefined, 5, 'text', [], {}]) assert.equal(contract.validateResultEnvelope(value).ok, false);
});

test('a cancelled step with a wrong trail and an unconfirmed step without a trail are described precisely', () => {
  const cancelled = result.build({ action: 'inspect', accepted: true, step: step('cancelled', { trail: [{ seq: 1, type: 'begin' }, { seq: 2, type: 'cancel' }] }), errorCode: 'STEP_CANCELLED' }).body;
  assert.equal(contract.validateResultEnvelope(cancelled).ok, true);
  cancelled.trail[1].type = 'resume';
  assert.deepEqual(contract.validateResultEnvelope(cancelled).problems, ['CANCEL_TRAILS']);
  const unavailable = result.refusal('JOURNAL_UNAVAILABLE', { action: 'submit' }).body;
  assert.deepEqual([unavailable.step.state, unavailable.effect.applied, unavailable.outcome], ['uncertain', null, 'unknown']);
  const wrong = result.refusal('NOT_FOUND').body;
  wrong.trail = [{ seq: 1, type: 'begin' }];
  assert.deepEqual(contract.validateResultEnvelope(wrong).problems, ['NO_STEP_NO_TRAIL']);
});
