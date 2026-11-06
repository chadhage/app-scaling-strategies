(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'C017Contract', { value: factory() });
}(globalThis, function () {
  'use strict';

  const OUTCOMES = Object.freeze(['CANCELLED_BEFORE_EFFECT', 'CANCELLED_PARTIAL', 'CANCEL_TOO_LATE', 'COMPENSATED', 'CANCEL_UNKNOWN']);
  const EFFECTIVE = Object.freeze(['CANCELLED_BEFORE_EFFECT', 'CANCELLED_PARTIAL', 'COMPENSATED']);
  const HTTP_STATUS = Object.freeze({ CANCELLED_BEFORE_EFFECT: 200, CANCELLED_PARTIAL: 200, COMPENSATED: 200, CANCEL_TOO_LATE: 409, CANCEL_UNKNOWN: 503 });
  const DETERMINATIONS = Object.freeze(['INTERRUPTED_KNOWN', 'INTERRUPTED_UNKNOWN', 'CANCEL_UNKNOWN']);
  const identity = Object.freeze({ leaseId: 'lease-synthetic-001', runId: 'synthetic-run-001', userId: 'user-synthetic-001' });
  const patterns = Object.freeze({
    key: /^[A-Za-z0-9._-]{8,64}$/, leaseId: /^lease-[a-z0-9-]{3,40}$/, runId: /^synthetic-run-\d{3}$/,
    userId: /^user-[a-z0-9-]{3,40}$/, actionId: /^act-\d{1,6}-[0-9a-f]{8}$/,
  });
  const epoch = (min) => (v) => Number.isSafeInteger(v) && !Object.is(v, -0) && v >= min && v <= 1000000;
  const schemas = Object.freeze({
    start: { key: 'key', leaseId: 'leaseId', runId: 'runId', userId: 'userId', expectedEpoch: epoch(0) },
    cancel: { key: 'key', leaseId: 'leaseId', runId: 'runId', userId: 'userId', actionId: 'actionId', epoch: epoch(1), compensate: (v) => typeof v === 'boolean' },
    reconcile: { key: 'key', leaseId: 'leaseId', runId: 'runId', userId: 'userId', actionId: 'actionId', epoch: epoch(1) },
  });

  const recovery = Object.freeze(['reinspect', 'correct-closed-command', 'confirm-operator-review', 'stop', 'retry-identical']);
  const table = {
    INVALID_JSON: [400, 'input', 'The body is not exactly one strict JSON object.', ['correct-closed-command']],
    INVALID_COMMAND: [400, 'input', 'The command does not match the closed schema; no field may be added, forged, duplicated or omitted.', ['correct-closed-command']],
    BODY_TOO_LARGE: [413, 'input', 'The body exceeds the small closed command size.', ['correct-closed-command']],
    UNSUPPORTED_MEDIA_TYPE: [415, 'input', 'Commands are application/json only.', ['correct-closed-command']],
    METHOD_NOT_ALLOWED: [405, 'input', 'The route does not support that method.', ['correct-closed-command']],
    NOT_FOUND: [404, 'input', 'No local route has that path.', ['reinspect']],
    FORBIDDEN_ORIGIN: [403, 'input', 'Only the actual same-origin loopback page may send commands.', ['stop']],
    UNKNOWN_LEASE: [404, 'identity', 'The server holds no such lease.', ['reinspect']],
    UNKNOWN_RUN: [404, 'identity', 'The lease has no such run.', ['reinspect']],
    UNKNOWN_USER: [403, 'identity', 'The user is not the owner of this lease.', ['reinspect']],
    UNKNOWN_ACTION: [404, 'identity', 'The current epoch has no such action.', ['reinspect']],
    STALE_EPOCH: [409, 'epoch', 'The epoch is older than the lease epoch; a past action cannot be commanded.', ['reinspect']],
    FUTURE_EPOCH: [409, 'epoch', 'The epoch is newer than the lease epoch; the server has not reached it.', ['reinspect']],
    ACTION_NOT_SETTLED: [409, 'state', 'The previous action is still in flight or interrupted and not reconciled.', ['reinspect']],
    ACTION_NOT_RUNNING: [409, 'state', 'The action is not running; it was reconciled after an interruption.', ['reinspect']],
    ALREADY_TERMINAL: [409, 'state', 'A cancel decision or reconciliation already settled this action.', ['reinspect']],
    CANCEL_IN_PROGRESS: [409, 'state', 'Another cancel is pending for this action; only one decision is made per action.', ['reinspect', 'retry-identical']],
    IDEMPOTENCY_CONFLICT: [409, 'state', 'The key was already used for a different command; nothing was changed.', ['correct-closed-command', 'reinspect']],
    NOT_INTERRUPTED: [409, 'state', 'Only an action interrupted by a restart can be reconciled.', ['reinspect']],
    STATE_UNREADABLE: [503, 'integrity', 'The journal is unreadable or inconsistent: the state is UNKNOWN and nothing is repaired or written.', ['confirm-operator-review', 'stop']],
    JOURNAL_FULL: [503, 'integrity', 'The local journal has no room for a new action; an operator must rotate it. Nothing was changed.', ['confirm-operator-review', 'stop']],
    SERVER_CLOSING: [503, 'integrity', 'The server is closing; the command was not decided and its effect is not claimed.', ['reinspect']],
  };
  const failures = Object.freeze(Object.fromEntries(Object.entries(table).map(([code, [status, group, reason, actions]]) => [code, Object.freeze({ status, group, reason, actions })])));

  const isPlain = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
  const safe = (v, name) => (typeof v === 'string' && patterns[name] && patterns[name].test(v) ? v : null);

  function validateCommand(value) {
    const details = [];
    if (!isPlain(value)) return { ok: false, details: [{ path: '$', code: 'NOT_AN_OBJECT' }] };
    const spec = typeof value.kind === 'string' && Object.hasOwn(schemas, value.kind) ? schemas[value.kind] : null;
    if (!spec) return { ok: false, details: [{ path: 'kind', code: 'UNKNOWN_KIND' }] };
    const allowed = ['schemaVersion', 'kind', ...Object.keys(spec)];
    for (const name of Object.keys(value)) if (!allowed.includes(name)) details.push({ path: name.slice(0, 40), code: 'EXTRA_FIELD' });
    if (value.schemaVersion !== 1) details.push({ path: 'schemaVersion', code: 'BAD_VERSION' });
    for (const [name, rule] of Object.entries(spec)) {
      if (!Object.hasOwn(value, name)) details.push({ path: name, code: 'MISSING_FIELD' });
      else if (!(typeof rule === 'string' ? safe(value[name], rule) !== null : rule(value[name]))) details.push({ path: name, code: 'BAD_VALUE' });
    }
    if (details.length) return { ok: false, details };
    return { ok: true, command: Object.freeze({ schemaVersion: 1, kind: value.kind, ...Object.fromEntries(Object.keys(spec).map((name) => [name, value[name]])) }) };
  }

  function failure(code, context = {}) {
    const entry = failures[code];
    const raw = context.requested || {};
    const requested = Object.fromEntries(['leaseId', 'runId', 'userId', 'actionId'].map((name) => [name, safe(raw[name], name)]));
    requested.epoch = Number.isSafeInteger(raw.epoch) ? raw.epoch : null;
    return {
      status: entry.status,
      body: {
        schemaVersion: 1, kind: 'C017-typed-failure', error: { code, group: entry.group, reason: entry.reason }, allowedActions: [...entry.actions],
        requested, current: context.current || null, details: context.details || [], effectClaimed: false, journalWritten: false,
      },
    };
  }

  const list = (steps) => (steps.length ? steps.join(', ') : 'none');
  const units = (f) => (f.standingUnitsExact ? `${f.standingUnits}` : `at least ${f.standingUnits}`);

  function describe(outcome, f) {
    if (outcome === 'CANCEL_UNKNOWN') {
      if (!f || f.effectsStanding === null) return 'Cancel not confirmed: the state is UNKNOWN because the journal cannot be read. Nothing is claimed as cancelled, completed or undone.';
      return `Cancel not confirmed: the state is UNKNOWN. Step(s) ${list(f.effectsStanding.map((e) => e.step))} are journaled as taken effect (${units(f)} synthetic units); `
        + `step(s) ${list(f.unknownSteps)} may or may not have taken effect; step(s) ${list(f.stepsNotRun)} never ran. Nothing is claimed as cancelled, completed or undone.`;
    }
    const standing = f.effectsStanding.map((e) => e.step);
    const ran = f.totalSteps - f.stepsNotRun.length;
    if (outcome === 'CANCELLED_BEFORE_EFFECT') return 'Stopped before any step ran. No effect was produced, so there was nothing to undo.';
    if (outcome === 'CANCEL_TOO_LATE') return `Too late: the action had already completed. All ${f.totalSteps} steps took effect and STAND (${f.standingUnits} synthetic units). The cancel was NOT effective.`;
    if (outcome === 'COMPENSATED') {
      return `Stopped after step ${ran} and reversed by journaled compensating steps ${list(f.undone.map((e) => e.step))} (reverse order, each its own journal entry). `
        + 'No effect remains standing (0 units). The original effects stay in the journal.';
    }
    if (f.compensation === 'FAILED') {
      return `Stopped after step ${ran} of ${f.totalSteps}. Compensating step ${f.compensationFailure.step} failed: step(s) ${list(standing)} still STAND (${f.standingUnits} synthetic units); `
        + `step(s) ${list(f.undone.map((e) => e.step))} were reversed by journaled compensating steps; step(s) ${list(f.stepsNotRun)} were NOT run.`;
    }
    return `Stopped after step ${ran} of ${f.totalSteps}. Step(s) ${list(standing)} took effect and STAND (${f.standingUnits} synthetic units); step(s) ${list(f.stepsNotRun)} were NOT run. Nothing was undone or rolled back.`;
  }

  function describeDetermination(determination, f) {
    const known = `Journaled effects of step(s) ${list(f.effectsStanding.map((e) => e.step))} STAND (${units(f)} synthetic units)`;
    const tail = `step(s) ${list(f.stepsNotRun)} never ran. The action did not complete and was not cancelled; nothing was undone.`;
    if (determination === 'INTERRUPTED_KNOWN') return `Interrupted by a restart. ${known}; ${tail}`;
    const unknown = `step(s) ${list(f.unknownSteps)} have an UNKNOWN effect (begun but not recorded as done)`;
    if (determination === 'INTERRUPTED_UNKNOWN') return `Interrupted by a restart. ${known}; ${unknown}; ${tail}`;
    return `A cancel request raced the restart and was never decided: its outcome is UNKNOWN. ${known}; ${unknown}; ${tail}`;
  }

  // Consistency of a cancel answer with its own facts. The page runs it on every answer and refuses to display a claim it fails.
  function claimCheck(body) {
    const problems = [];
    if (!isPlain(body) || !OUTCOMES.includes(body.outcome) || !isPlain(body.facts)) return { ok: false, problems: ['the answer is not one of the five outcomes with facts'] };
    const f = body.facts;
    if (body.effective !== EFFECTIVE.includes(body.outcome)) problems.push('effective contradicts the outcome');
    if (body.statement !== describe(body.outcome, f.effectsStanding === null ? null : f)) problems.push('the statement is not the one the facts allow');
    if (body.outcome === 'CANCEL_UNKNOWN') {
      if (body.actionStopped !== null || body.nothingUndone !== null || body.effective !== false) problems.push('unknown must not claim stopped, nothing undone or effective');
      return { ok: problems.length === 0, problems };
    }
    const steps = (name) => (Array.isArray(f[name]) ? f[name].map((e) => (typeof e === 'number' ? e : e.step)) : null);
    const standing = steps('effectsStanding'); const undone = steps('undone'); const notRun = steps('stepsNotRun'); const unknown = steps('unknownSteps');
    if (!standing || !undone || !notRun || !unknown || !Number.isSafeInteger(f.totalSteps)) return { ok: false, problems: [...problems, 'facts are incomplete'] };
    const all = [...standing, ...undone, ...notRun, ...unknown].sort((a, b) => a - b);
    if (unknown.length || all.some((step, index) => step !== index + 1) || all.length !== f.totalSteps) problems.push('facts do not partition the steps');
    if (f.standingUnits !== f.effectsStanding.reduce((sum, e) => sum + e.units, 0)) problems.push('standing units do not add up');
    if (body.nothingUndone !== (undone.length === 0)) problems.push('nothingUndone contradicts the undone list');
    const rules = {
      CANCELLED_BEFORE_EFFECT: standing.length === 0 && undone.length === 0 && notRun.length === f.totalSteps,
      CANCELLED_PARTIAL: standing.length >= 1 && notRun.length >= 1 && f.compensation !== 'COMPLETE' && (undone.length === 0 || f.compensation === 'FAILED'),
      CANCEL_TOO_LATE: standing.length === f.totalSteps && undone.length === 0 && body.actionCompleted === true,
      COMPENSATED: standing.length === 0 && undone.length >= 1 && f.compensation === 'COMPLETE',
    };
    if (!rules[body.outcome]) problems.push(`the facts do not prove ${body.outcome}`);
    return { ok: problems.length === 0, problems };
  }

  return Object.freeze({ OUTCOMES, EFFECTIVE, HTTP_STATUS, DETERMINATIONS, identity, patterns, schemas, recovery, failures, validateCommand, failure, describe, describeDetermination, claimCheck, isPlain });
}));
