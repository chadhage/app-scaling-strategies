'use strict';

// Builds the typed, versioned result envelope (C042-step-result/1) and its HTTP status. Pure: no state, no clock.
const contract = require('./contract.js');
const { digestInput } = require('./input.cjs');

const { ERRORS, LEASES, DIDNOT, CLASSIFICATIONS, STATE_REASONS, SCOPE, SCHEMA_VERSION } = contract;
const UNCONFIRMED = ['JOURNAL_UNCERTAIN', 'JOURNAL_UNAVAILABLE', 'INTERNAL_ERROR'];
const OPEN_STATES = ['in-flight', 'interrupted', 'uncertain'];

function describeNot({ state, outcome, errorCode, byThis }) {
  const codes = [];
  if (outcome === 'succeeded') {
    if (!byThis) codes.push('NO_EFFECT_BY_THIS_REQUEST');
    codes.push('NO_SECOND_EFFECT', 'NO_UNDO');
  } else if (outcome === 'unknown') {
    codes.push('NOT_CONFIRMED');
    if (state === 'uncertain') codes.push('NO_AUTOMATIC_RETRY');
  } else {
    if (['ACTION_NOT_ALLOWED', 'UNSUPPORTED_ACTION'].includes(errorCode)) codes.push('ACTION_NOT_PERFORMED');
    codes.push(state === 'committed' ? 'NO_EFFECT_BY_THIS_REQUEST' : 'NO_EFFECT');
    if (state === 'none') codes.push('NO_JOURNAL_ENTRY');
    if (['cancelled', 'interrupted', 'in-flight'].includes(state)) codes.push('NO_AUTOMATIC_RETRY');
    if (outcome !== 'rejected' || state === 'committed' || errorCode === 'ACTION_NOT_ALLOWED') codes.push('NO_UNDO');
  }
  codes.push('NO_CLOUD_CALL');
  return codes.map((code) => ({ code, text: DIDNOT[code] }));
}

function build({ action, accepted = false, replayed = false, byThis = false, step = null, input = null, key = null, errorCode = null, details = [] }) {
  const known = errorCode === null ? null : ERRORS[errorCode];
  const state = step ? step.state : UNCONFIRMED.includes(errorCode) ? 'uncertain' : 'none';
  if (known === null && state !== 'committed') throw new Error('Only a journaled effect can be reported as success.');
  const outcome = known ? known.outcome : 'succeeded';
  const shown = input ?? step?.input ?? null;
  const subject = step?.input ?? input;
  const allowed = known?.actions ?? contract.allowedActions(state);
  const body = {
    schemaVersion: SCHEMA_VERSION, kind: 'C042-step-result', action, accepted, replayed, outcome,
    classification: CLASSIFICATIONS[outcome], terminal: !OPEN_STATES.includes(state),
    idempotencyKey: step ? step.key : shown ? shown.idempotencyKey : key,
    inputSha256: shown ? digestInput(shown) : null,
    validatedInput: shown ? { ...shown } : null,
    step: { state },
    effect: {
      applied: state === 'committed' ? true : state === 'uncertain' ? null : false, appliedByThisRequest: byThis,
      leaseId: subject ? subject.leaseId : null, units: subject ? subject.units : null,
      reservedAfter: step?.commit ? step.commit.reservedAfter : null, capacity: subject ? LEASES[subject.leaseId] : null,
    },
    didNot: describeNot({ state, outcome, errorCode, byThis }),
    error: known ? { code: errorCode, group: known.group, message: known.message, details } : null,
    recovery: { allowed: [...allowed], reason: known ? known.message : STATE_REASONS[state] },
    trail: step ? step.trail.map((item) => ({ ...item })) : [],
    attempts: step ? step.attempts : 0,
    scope: SCOPE,
  };
  const status = accepted ? (action === 'submit' && byThis ? 201 : state === 'in-flight' ? 202 : 200) : known.status;
  return { status, body };
}

// A typed failure for a request that never reached a step: transport, route or input problems.
function refusal(errorCode, { action = 'none', details = [], key = null } = {}) {
  return build({ action, errorCode, details, key });
}

module.exports = Object.freeze({ build, refusal, describeNot });
