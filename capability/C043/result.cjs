'use strict';

// Builds the typed, versioned result envelope (C043-preset-result/1), its listing (ran, not run, standing effects) and
// its HTTP status from FACTS: the acknowledged step facts of the preset journal. Pure: no state, no clock, no step call.
const contract = require('./contract.js');

const { DIDNOT, ERRORS, SCOPE, STATE_REASONS } = contract;
const RUN_CODE = Object.freeze({ stopped: 'PRESET_STEP_FAILED', bounded: 'PRESET_BOUND_EXCEEDED', cancelled: 'PRESET_CANCELLED', running: 'PRESET_IN_FLIGHT' });
const PERSISTENCE = Object.freeze(['RUN_JOURNAL_UNCERTAIN', 'RUN_JOURNAL_UNAVAILABLE']);
const REFUSED_ACTION = Object.freeze(['ACTION_NOT_ALLOWED', 'UNSUPPORTED_ACTION']);

const notRun = (spec, index) => ({
  index: index + 1, key: spec.idempotencyKey, leaseId: spec.leaseId, units: spec.units, status: 'not-run', code: null,
  applied: false, appliedByThisRequest: false, reservedAfter: null,
});

// The view of one run: per-step facts (acknowledged, in flight, interrupted or not run), its state and its trail.
// Only the steps of `applied` (acknowledged during THIS request) claim to have been applied by it.
function viewOf(run, { live = false, elapsedMs = 0, applied = [] } = {}) {
  const steps = run.preset.steps.map((spec, index) => {
    if (run.pending === index + 1) return { ...notRun(spec, index), status: live ? 'running' : 'interrupted', applied: null };
    return run.acks[index] ? { ...run.acks[index], appliedByThisRequest: applied.includes(index + 1) && run.acks[index].status === 'succeeded' } : notRun(spec, index);
  });
  const state = run.terminal ? run.terminal.state : live ? 'running' : 'interrupted';
  return { state, steps, trail: run.trail.map((item) => ({ ...item })), attempts: run.attempts, elapsedMs: run.terminal ? run.terminal.elapsedMs : elapsedMs, bound: run.terminal ? run.terminal.bound : null };
}

const codeOf = (view) => {
  if (view.state === 'completed') return null;
  if (view.state === 'interrupted') return view.steps.some((step) => step.status === 'unknown') ? 'PRESET_UNCONFIRMED' : 'PRESET_INTERRUPTED';
  return RUN_CODE[view.state];
};

function describeNot({ state, action, errorCode, notRunList, outcome }) {
  if (PERSISTENCE.includes(errorCode)) return ['NOT_CONFIRMED', 'NO_AUTOMATIC_RETRY', 'NO_CLOUD_CALL'];
  const codes = [];
  if (state === 'none') codes.push('NO_EFFECT', 'NO_JOURNAL_ENTRY', 'NO_STEP_CALLED');
  else {
    // Requests that never apply a step say so; a run or resume says it per step (appliedByThisRequest), so a replay equals the original.
    const refused = errorCode !== null && !Object.hasOwn(contract.RUN_CODE_STATE, errorCode);
    if (refused || ['inspect', 'cancel', 'none'].includes(action)) codes.push('NO_EFFECT_BY_THIS_REQUEST');
    codes.push('NO_UNDO');
    if (state === 'completed') codes.push('NO_SECOND_EFFECT');
    if (notRunList.length > 0) codes.push('LATER_STEPS_NOT_RUN');
    if (state !== 'completed') codes.push('NO_AUTOMATIC_RETRY');
    if (outcome === 'unknown') codes.push('NOT_CONFIRMED');
  }
  if (REFUSED_ACTION.includes(errorCode)) codes.push('ACTION_NOT_PERFORMED');
  codes.push('NO_CLOUD_CALL');
  return codes;
}

function build({ action, accepted = false, replayed = false, errorCode = null, details = null, bound = null, preset = null, sha256 = null, key = null, view = null }) {
  const code = errorCode ?? (view ? codeOf(view) : null);
  if (code === null && (view === null || view.state !== 'completed')) throw new Error('Only a completed run of every step can be reported as success.');
  const known = code === null ? null : ERRORS[code];
  const state = view ? view.state : 'none';
  const steps = view ? view.steps : preset ? preset.steps.map(notRun) : [];
  const ran = steps.filter((step) => step.status !== 'not-run').map((step) => step.index);
  const notRunList = steps.filter((step) => step.status === 'not-run').map((step) => step.index);
  const effects = steps.filter((step) => step.applied === true).map((step) => ({ index: step.index, key: step.key, leaseId: step.leaseId, units: step.units, reservedAfter: step.reservedAfter }));
  const outcome = known ? known.outcome : 'succeeded';
  const stopped = steps.find((step) => step.status === 'failed');
  const detail = details ?? (code === 'PRESET_STEP_FAILED' ? [{ path: `steps[${stopped.index - 1}]`, code: stopped.code, message: contract.catalogEntry(stopped.code).message }] : []);
  const body = {
    schemaVersion: 1, kind: 'C043-preset-result', action, accepted, replayed, outcome, classification: contract.CLASSIFICATIONS[outcome],
    terminal: !contract.OPEN_STATES.includes(state), idempotencyKey: preset ? preset.idempotencyKey : key, presetSha256: sha256, preset: preset ? JSON.parse(JSON.stringify(preset)) : null,
    run: { state }, bound: bound ?? (view ? view.bound : null), steps, ran, notRun: notRunList, effects,
    usage: { steps: ran.length, units: effects.reduce((total, item) => total + item.units, 0), elapsedMs: view ? view.elapsedMs : 0 },
    didNot: describeNot({ state, action, errorCode: code, notRunList, outcome }).map((item) => ({ code: item, text: DIDNOT[item] })),
    error: known ? { code, group: known.group, message: known.message, details: detail } : null,
    recovery: { allowed: contract.expectedActions(code, state, steps.some((step) => !contract.SUCCESS_STATUSES.includes(step.status))), reason: known ? known.message : STATE_REASONS[state] },
    trail: view ? view.trail : [], attempts: view ? view.attempts : 0, scope: SCOPE,
  };
  const fresh = steps.some((step) => step.appliedByThisRequest);
  const status = accepted ? (action === 'run' && fresh ? 201 : state === 'running' ? 202 : 200) : known.status;
  return { status, body };
}

// A typed failure for a request that never reached a run: transport, route or input problems.
function refusal(errorCode, { action = 'none', details = [], key = null, preset = null, sha256 = null, bound = null } = {}) {
  return build({ action, errorCode, details, key, preset, sha256, bound });
}

module.exports = Object.freeze({ build, refusal, viewOf, codeOf, notRun });
