'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../model.js');

test('forced reauthentication stops admission and keeps affected attempts counted', () => {
  let state = model.createState();
  state = model.transition(state, {
    type: 'start', fixtureId: 'forced-reauthentication', pilot: 2,
  });
  state = model.transition(state, { type: 'observe' });
  state = model.transition(state, { type: 'expand' });
  assert.equal(state.result.outcome, 'FAILURE');
  assert.equal(state.result.attempted, 2);
  assert.equal(state.result.interruptions, 1);
  assert.equal(state.result.forcedReauthentication, 1);
  assert.equal(state.result.admission, 'STOPPED');
  assert.equal(state.gate.decision, 'BLOCKED');
  assert.equal(state.gate.validationRequired, true);
});

function gated(fixtureId = 'compatible-settings', pilot = 2, initial = model.createState()) {
  let state = model.transition(initial, { type: 'start', fixtureId, pilot });
  state = model.transition(state, { type: 'observe' });
  return model.transition(state, { type: 'expand' });
}

function rejects(state, action) {
  const before = JSON.stringify(state);
  assert.throws(() => model.transition(state, action), {
    name: 'GuardError', code: 'ERR_SYNTHETIC_GUARD',
  });
  assert.equal(JSON.stringify(state), before);
}

const cases = [
  ['compatible-settings', 'SUCCESS', 0, 0, 0, 0, 0],
  ['forced-reauthentication', 'FAILURE', 1, 0, 1, 0, 0],
  ['rejected-valid-session', 'FAILURE', 1, 0, 0, 1, 0],
  ['rejected-sign-in', 'FAILURE', 1, 0, 0, 0, 1],
  ['missing-observation', 'UNKNOWN', 0, 1, 0, 0, 0],
  ['failure-and-unknown', 'FAILURE', 1, 1, 1, 0, 0],
];

for (const [fixture, outcome, interruptions, unknown, reauth, rejected, signIn] of cases) {
  for (const pilot of model.pilots) {
    test(`${fixture}, pilot ${pilot}: exact synthetic counts and unexecuted gate`, () => {
      const state = gated(fixture, pilot);
      const result = state.result;
      assert.equal(result.outcome, outcome);
      assert.equal(result.attempted, pilot);
      assert.equal(result.interruptions, interruptions);
      assert.equal(result.unknown, unknown);
      assert.equal(result.successes, pilot - interruptions - unknown);
      assert.equal(result.forcedReauthentication, reauth);
      assert.equal(result.rejectedValidSessions, rejected);
      assert.equal(result.rejectedSignIns, signIn);
      assert.equal(result.oldOnlyControls, 8 - pilot);
      assert.equal(result.successes + result.interruptions + result.unknown, result.attempted);
      assert.equal(result.validationRequired, true);
      assert.equal(result.rows.length, pilot);
      assert.equal(result.rows[0].kind, 'existing valid-session fixture');
      assert.equal(result.rows[1].kind, 'synthetic sign-in check');
      assert.equal(state.gate.decision, outcome === 'SUCCESS' ? 'ELIGIBLE' : 'BLOCKED');
      assert.equal(state.gate.currentCohort, pilot);
      assert.equal(state.gate.proposedCohort, pilot * 2);
      assert.equal(state.gate.expanded, false);
      assert.equal(state.gate.validationRequired, true);
    });
  }
}

test('known failures stop admission on observation, before checking expansion', () => {
  for (const fixtureId of ['forced-reauthentication', 'rejected-valid-session', 'rejected-sign-in', 'failure-and-unknown']) {
    const exposed = model.transition(model.createState(), { type: 'start', fixtureId, pilot: 2 });
    assert.equal(exposed.result, null);
    assert.equal(exposed.gate, null);
    const observed = model.transition(exposed, { type: 'observe' });
    assert.equal(observed.result.admission, 'STOPPED');
    assert.equal(observed.result.outcome, 'FAILURE');
    assert.equal(observed.gate, null);
  }
});

test('missing observation holds admission and never becomes a synthetic success', () => {
  const state = gated('missing-observation');
  assert.equal(state.result.admission, 'HELD');
  assert.equal(state.result.outcome, 'UNKNOWN');
  assert.equal(state.result.successes, 1);
  assert.equal(state.result.attempted, 2);
  assert.equal(state.result.unknown, 1);
  assert.match(state.gate.reason, /unresolved attempts are not successes/);
});

test('unsupported fixtures and non-enumerated pilot values fail without mutation', () => {
  const state = model.createState();
  for (const fixtureId of ['', 'FORCED-REAUTHENTICATION', 'unlisted', null, 7, {}, undefined]) {
    rejects(state, { type: 'start', fixtureId, pilot: 2 });
  }
  for (const pilot of [0, 1, 3, 8, -2, 2.5, NaN, Infinity, '2', null, undefined]) {
    rejects(state, { type: 'start', fixtureId: 'compatible-settings', pilot });
  }
});

test('unexpected fields, accessors and non-record actions are rejected', () => {
  const state = model.createState();
  for (const action of [
    null, undefined, [], 'observe', {},
    Object.create(null),
    { type: 'bypass-validation' },
    { type: 'start', fixtureId: 'compatible-settings', pilot: 2, bypass: true },
    { type: 'reset', extra: 'discard failure' },
    { type: 'observe', [Symbol('extra')]: true },
  ]) rejects(state, action);
  let getterRead = false;
  rejects(state, { get type() { getterRead = true; return 'reset'; } });
  assert.equal(getterRead, false);
});

test('forged and serialized states are rejected; only this memory-only model owns state', () => {
  const real = model.createState();
  for (const state of [null, undefined, {}, { ...real }, JSON.parse(JSON.stringify(real)), Object.create(real)]) {
    assert.throws(() => model.transition(state, { type: 'reset' }), {
      name: 'GuardError', code: 'ERR_SYNTHETIC_GUARD',
    });
  }
});

test('immutable fixtures, state, measured rows and retained entries cannot be rewritten', () => {
  const state = model.transition(gated('forced-reauthentication'), { type: 'check', prediction: 'FAILURE' });
  assert.throws(() => { model.fixtures[1].first[0] = 'accepted'; }, TypeError);
  assert.throws(() => { state.result.interruptions = 0; }, TypeError);
  assert.throws(() => { state.result.rows[0].observed = 'accepted'; }, TypeError);
  assert.throws(() => { state.gate.validationRequired = false; }, TypeError);
  assert.throws(() => { state.history[0].result.outcome = 'SUCCESS'; }, TypeError);
  assert.throws(() => state.history.pop(), TypeError);
  assert.equal(state.result.outcome, 'FAILURE');
  assert.equal(state.result.interruptions, 1);
});

test('out-of-order and repeated actions fail closed at every phase', () => {
  const draft = model.createState();
  for (const type of ['observe', 'expand', 'new']) rejects(draft, { type });
  rejects(draft, { type: 'check', prediction: 'SUCCESS' });
  const exposed = model.transition(draft, { type: 'start', fixtureId: 'compatible-settings', pilot: 2 });
  rejects(exposed, { type: 'expand' });
  rejects(exposed, { type: 'start', fixtureId: 'compatible-settings', pilot: 2 });
  const observed = model.transition(exposed, { type: 'observe' });
  rejects(observed, { type: 'observe' });
  rejects(observed, { type: 'check', prediction: 'SUCCESS' });
  const gate = model.transition(observed, { type: 'expand' });
  rejects(gate, { type: 'expand' });
  rejects(gate, { type: 'new' });
  const checked = model.transition(gate, { type: 'check', prediction: 'SUCCESS' });
  rejects(checked, { type: 'check', prediction: 'SUCCESS' });
  rejects(checked, { type: 'observe' });
});

test('unsupported predictions do not write a checked attempt', () => {
  const state = gated('forced-reauthentication');
  for (const prediction of ['', 'PASS', 'failure', null, undefined, 1]) {
    rejects(state, { type: 'check', prediction });
  }
  assert.equal(state.history.length, 0);
  assert.equal(state.verification, null);
});

test('correct failure and unknown predictions pass learning without changing user impact', () => {
  for (const fixtureId of ['forced-reauthentication', 'missing-observation', 'failure-and-unknown']) {
    const gate = gated(fixtureId);
    const checked = model.transition(gate, { type: 'check', prediction: gate.result.outcome });
    assert.equal(checked.verification.passed, true);
    assert.strictEqual(checked.result, gate.result);
    assert.strictEqual(checked.history[0].result, gate.result);
    assert.notEqual(checked.result.outcome, 'SUCCESS');
  }
});

test('incorrect interpretation is retained and does not forgive an authentication failure', () => {
  const checked = model.transition(gated('rejected-valid-session'), { type: 'check', prediction: 'SUCCESS' });
  assert.equal(checked.verification.passed, false);
  assert.equal(checked.history[0].verification.prediction, 'SUCCESS');
  assert.equal(checked.result.outcome, 'FAILURE');
  assert.equal(checked.result.attempted, 2);
  assert.equal(checked.result.interruptions, 1);
});

test('new attempts retain separate denominators, including previous failures and unknowns', () => {
  const failed = model.transition(gated('forced-reauthentication'), { type: 'check', prediction: 'FAILURE' });
  const next = model.transition(failed, { type: 'new' });
  assert.equal(next.phase, 'DRAFT');
  assert.equal(next.attempt, 2);
  assert.strictEqual(next.history, failed.history);
  assert.equal(next.result, null);
  const checked = model.transition(gated('missing-observation', 4, next), { type: 'check', prediction: 'UNKNOWN' });
  assert.equal(checked.history.length, 2);
  assert.equal(checked.history[0].result.attempted, 2);
  assert.equal(checked.history[0].result.interruptions, 1);
  assert.equal(checked.history[1].result.attempted, 4);
  assert.equal(checked.history[1].result.unknown, 1);
});

test('six checked attempts are bounded; a seventh requires explicit reset', () => {
  let state = model.createState();
  for (let attempt = 1; attempt <= model.MAX_ATTEMPTS; attempt += 1) {
    state = model.transition(gated('forced-reauthentication', 2, state), { type: 'check', prediction: 'FAILURE' });
    assert.equal(state.attempt, attempt);
    assert.equal(state.history.length, attempt);
    if (attempt < model.MAX_ATTEMPTS) state = model.transition(state, { type: 'new' });
  }
  rejects(state, { type: 'new' });
  assert.equal(state.history[0].result.interruptions, 1);
  const reset = model.transition(state, { type: 'reset' });
  assert.equal(reset.history.length, 0);
  assert.equal(reset.attempt, 1);
});

test('reset clears every valid phase without automatically rewriting earlier state objects', () => {
  const draft = model.createState();
  const exposed = model.transition(draft, { type: 'start', fixtureId: 'forced-reauthentication', pilot: 2 });
  const observed = model.transition(exposed, { type: 'observe' });
  const gate = model.transition(observed, { type: 'expand' });
  const checked = model.transition(gate, { type: 'check', prediction: 'FAILURE' });
  for (const state of [draft, exposed, observed, gate, checked]) {
    assert.deepEqual(model.transition(state, { type: 'reset' }), model.createState());
  }
  assert.equal(checked.history.length, 1);
  assert.equal(checked.result.outcome, 'FAILURE');
});

test('fixed fixtures are deterministic and initial missing evidence is not success', () => {
  assert.equal(model.BANNER, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(model.createState().result, null);
  for (const fixture of model.fixtures) {
    assert.deepEqual(gated(fixture.id, 4), gated(fixture.id, 4));
  }
});
