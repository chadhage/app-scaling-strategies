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
    INTERNAL: [500, 'server', 'The local server failed; no effect is claimed.', ['reinspect']],
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
      const reversed = f.undone.length ? `step(s) ${list(f.undone.map((e) => e.step))} were reversed by journaled compensating steps` : 'no compensating step took effect';
      return `Stopped after step ${ran} of ${f.totalSteps}. Compensating step ${f.compensationFailure.step} failed: step(s) ${list(standing)} still STAND (${f.standingUnits} synthetic units); `
        + `${reversed}; step(s) ${list(f.stepsNotRun)} were NOT run.`;
    }
    return `Stopped after step ${ran} of ${f.totalSteps}. Step(s) ${list(standing)} took effect and STAND (${f.standingUnits} synthetic units); step(s) ${list(f.stepsNotRun)} were NOT run. Nothing was undone or rolled back.`;
  }

  function describeDetermination(determination, f) {
    const known = `Journaled effects of step(s) ${list(f.effectsStanding.map((e) => e.step))} STAND (${units(f)} synthetic units)`;
    const reversal = f.undone.length ? `step(s) ${list(f.undone.map((e) => e.step))} were reversed by journaled compensating steps before the interruption` : 'nothing was undone';
    const tail = `step(s) ${list(f.stepsNotRun)} never ran. The action did not complete and was not cancelled; ${reversal}.`;
    if (determination === 'INTERRUPTED_KNOWN') return `Interrupted by a restart. ${known}; ${tail}`;
    const unknown = `step(s) ${list(f.unknownSteps)} have an UNKNOWN effect (begun but not recorded as done)`;
    if (determination === 'INTERRUPTED_UNKNOWN') return `Interrupted by a restart. ${known}; ${unknown}; ${tail}`;
    return `A cancel request raced the restart and was never decided: its outcome is UNKNOWN. ${known}; ${unknown}; ${tail}`;
  }

  // The wording a cancel answer may carry, re-derived from its OWN facts (the page prints this, never the server's prose).
  const statementOf = (body) => describe(body.outcome, body.facts.effectsStanding === null ? null : body.facts);

  // Consistency of a cancel answer with its own facts. The page runs it on every answer and refuses to display a claim it fails.
  function claimCheck(body) {
    const problems = [];
    if (!isPlain(body) || !OUTCOMES.includes(body.outcome) || !isPlain(body.facts)) return { ok: false, problems: ['the answer is not one of the five outcomes with facts'] };
    const f = body.facts;
    if (body.effective !== EFFECTIVE.includes(body.outcome)) problems.push('effective contradicts the outcome');
    if (body.statement !== statementOf(body)) problems.push('the statement is not the one the facts allow');
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

  // ---- Checks of every other answer shape (F3, L-0139). The page validates EVERY answer against its own facts and the closed tables and never
  // prints server prose: wording is re-derived from facts or taken from the closed table. A check returns { ok, problems }; a problem is a
  // fixed sentence that never repeats the checked text.
  const STATUSES = Object.freeze(['ACCEPTED', 'RUNNING', 'CANCEL_REQUESTED', 'COMPLETED', 'CANCELLED', 'INTERRUPTED', 'RECONCILED']);
  const LIVE = Object.freeze(['ACCEPTED', 'RUNNING', 'CANCEL_REQUESTED']);
  const COMPENSATION = Object.freeze(['NOT_REQUESTED', 'NOT_ATTEMPTED', 'IN_PROGRESS', 'COMPLETE', 'FAILED', 'INTERRUPTED']);
  const JOURNAL_TYPES = Object.freeze(['boot', 'action-accepted', 'step-intent', 'step-effect', 'action-completed', 'cancel-requested', 'compensation-intent', 'compensation-effect', 'compensation-failed', 'cancel-decided', 'reconciled']);
  const isInt = (v) => Number.isSafeInteger(v) && !Object.is(v, -0);
  const inRange = (v, min, max) => isInt(v) && v >= min && v <= max;
  const stepList = (v) => Array.isArray(v) && v.length <= 8 && v.every((s) => inRange(s, 1, 8));
  const effectList = (v) => Array.isArray(v) && v.length <= 8 && v.every((e) => isPlain(e) && inRange(e.step, 1, 8) && inRange(e.units, 1, 1000));
  const named = (o) => isPlain(o) && ['leaseId', 'runId', 'userId'].every((name) => safe(o[name], name) !== null);
  const sum = (list) => list.reduce((total, e) => total + e.units, 0);
  const collect = () => { const problems = []; return { problems, bad: (text, condition) => { if (condition) problems.push(text); }, verdict: () => ({ ok: problems.length === 0, problems }) }; };

  function factLists(f) {
    if (!isPlain(f) || !inRange(f.totalSteps, 1, 8) || !effectList(f.effectsStanding) || !effectList(f.undone) || !stepList(f.stepsNotRun) || !stepList(f.unknownSteps)) return null;
    return { standing: f.effectsStanding.map((e) => e.step), undone: f.undone.map((e) => e.step), notRun: f.stepsNotRun, unknown: f.unknownSteps };
  }

  // Every listed step is distinct and inside 1..total; a settled action lists all of them, a live one may have a single step in flight.
  function partitionBroken(lists, total, settled) {
    const all = [].concat(lists.standing, lists.undone, lists.notRun, lists.unknown).sort((a, b) => a - b);
    const distinct = all.every((step, index) => step <= total && (index === 0 || step !== all[index - 1]));
    return !distinct || (settled ? all.length !== total : all.length < total - 1);
  }

  function stateOf(lists, live, step) {
    if (lists.unknown.includes(step)) return 'UNKNOWN';
    if (lists.undone.includes(step)) return 'REVERSED';
    if (lists.standing.includes(step)) return 'STANDS';
    if (lists.notRun.includes(step)) return live ? 'PENDING' : 'NOT_RUN';
    return 'IN_FLIGHT';
  }

  const statusFits = (status, cancel, outcome) => ({
    ACCEPTED: cancel === null, RUNNING: cancel === null, CANCEL_REQUESTED: cancel !== null && outcome === null, COMPLETED: cancel === null || outcome === 'CANCEL_TOO_LATE',
    CANCELLED: EFFECTIVE.includes(outcome), INTERRUPTED: cancel === null || outcome === 'CANCEL_UNKNOWN', RECONCILED: cancel === null || outcome === 'CANCEL_UNKNOWN',
  }[status] === true);

  function actionProblems(a, journal) {
    if (!isPlain(a)) return ['the action is missing or malformed'];
    const live = LIVE.includes(a.status);
    const lists = factLists({ totalSteps: a.totalSteps, effectsStanding: a.effectsStanding, undone: a.undone, stepsNotRun: live ? a.stepsPending : a.stepsNotRun, unknownSteps: a.unknownSteps });
    const other = live ? a.stepsNotRun : a.stepsPending;
    if (!lists || !Array.isArray(other) || other.length || !Array.isArray(a.steps) || a.steps.length !== a.totalSteps) return ['the steps and the facts of the action are incomplete or malformed'];
    const { problems, bad } = collect();
    const { cancel, reconciliation } = a;
    const outcome = isPlain(cancel) ? cancel.outcome : null;
    bad('the action names a lease, run, user or action the server cannot have', !named(a) || safe(a.actionId, 'actionId') === null);
    bad('the epoch or the sizing is not valid', !inRange(a.epoch, 1, 1000000) || !inRange(a.unitsPerStep, 1, 1000));
    bad('the status is not a closed status or contradicts live', !STATUSES.includes(a.status) || a.live !== live);
    bad('the steps do not partition the facts', partitionBroken(lists, a.totalSteps, !live));
    bad('a step is shown in a state its facts contradict', a.steps.some((entry, index) => !isPlain(entry) || entry.step !== index + 1 || entry.units !== a.unitsPerStep || entry.state !== stateOf(lists, live, index + 1)));
    bad('the standing units do not add up', a.standingUnits !== sum(a.effectsStanding) || a.effectsStanding.some((e) => e.units !== a.unitsPerStep));
    bad('the exactness of the standing units contradicts the unknown steps', a.standingUnitsExact !== (lists.unknown.length === 0));
    bad('the compensation state is not closed', !COMPENSATION.includes(a.compensation) || (a.compensation === 'FAILED') !== isPlain(a.compensationFailure) || (a.compensationFailure !== null && !inRange(a.compensationFailure.step, 1, 8)));
    bad('the cancel summary is malformed', cancel !== null && !(isPlain(cancel) && typeof cancel.key === 'string' && typeof cancel.compensate === 'boolean' && typeof cancel.decided === 'boolean' && (outcome === null || OUTCOMES.includes(outcome))));
    bad('the status contradicts the cancel summary', !statusFits(a.status, cancel, outcome));
    bad('a completed action must show every step standing', a.status === 'COMPLETED' && lists.standing.length !== a.totalSteps);
    bad('the reconciliation contradicts the status', (a.status === 'RECONCILED') !== (reconciliation !== null) || (reconciliation !== null && !(isPlain(reconciliation) && DETERMINATIONS.includes(reconciliation.determination))));
    bad('the journal shows a decision or a reconciliation the summary does not', journal.some((e) => e.actionId === a.actionId
      && ((e.type === 'cancel-decided' && outcome !== e.outcome) || (e.type === 'reconciled' && !(isPlain(reconciliation) && reconciliation.determination === e.determination)))));
    if (OUTCOMES.includes(outcome)) {
      const unknown = outcome === 'CANCEL_UNKNOWN';
      const claim = { outcome, effective: EFFECTIVE.includes(outcome), actionStopped: unknown ? null : outcome !== 'CANCEL_TOO_LATE', actionCompleted: a.status === 'COMPLETED', nothingUndone: unknown ? null : a.undone.length === 0,
        facts: { totalSteps: a.totalSteps, effectsStanding: a.effectsStanding, stepsNotRun: lists.notRun, unknownSteps: a.unknownSteps, undone: a.undone, standingUnits: a.standingUnits, standingUnitsExact: a.standingUnitsExact,
          compensation: a.compensation, compensationFailure: a.compensationFailure } };
      claim.statement = statementOf(claim);
      problems.push(...claimCheck(claim).problems);
    }
    return problems;
  }

  const journalWindow = (view) => Array.isArray(view.journal) && view.journal.length <= 256 && (view.journalOmitted === undefined || inRange(view.journalOmitted, 0, 1000000))
    && view.journal.every((e) => isPlain(e) && JOURNAL_TYPES.includes(e.type) && (e.step === undefined || inRange(e.step, 1, 8)) && (e.outcome === undefined || OUTCOMES.includes(e.outcome))
      && (e.determination === undefined || DETERMINATIONS.includes(e.determination)) && (e.actionId === undefined || safe(e.actionId, 'actionId') !== null));

  // The /api/state view: identity, epoch, journal window, and an action whose steps, lists, status, cancel summary and reconciliation agree.
  function viewCheck(view) {
    if (!isPlain(view) || view.kind !== 'C017-state' || view.schemaVersion !== 1) return { ok: false, problems: ['the answer is not a state view of this server'] };
    const { problems, bad, verdict } = collect();
    bad('the journal status is not closed', !['READABLE', 'UNREADABLE'].includes(view.journalStatus));
    bad('the lease is not a lease of this server', !named(view.lease));
    bad('the epoch is not valid', !(view.epoch === null || inRange(view.epoch, 0, 1000000)));
    bad('the journal window is malformed', !journalWindow(view));
    bad('an unreadable journal cannot come with an action', view.journalStatus === 'UNREADABLE' && view.action !== null);
    if (!problems.length && view.action !== null) problems.push(...actionProblems(view.action, view.journal));
    return verdict();
  }

  function startCheck(body) {
    if (!isPlain(body) || body.kind !== 'C017-start-result' || body.outcome !== 'ACTION_ACCEPTED' || typeof body.idempotentReplay !== 'boolean') return { ok: false, problems: ['the answer is not an accepted start with its action'] };
    const problems = actionProblems(body.action, []);
    return { ok: problems.length === 0, problems };
  }

  function reconcileCheck(body) {
    const lists = isPlain(body) && body.kind === 'C017-reconcile-result' ? factLists(body.facts) : null;
    if (!lists || !DETERMINATIONS.includes(body.determination)) return { ok: false, problems: ['the answer is not a reconcile result with a closed determination and well-formed facts'] };
    const f = body.facts;
    const { bad, verdict } = collect();
    bad('the answer names a lease, run, user or action the server cannot have', !named(body) || safe(body.actionId, 'actionId') === null);
    bad('the steps do not partition the facts', partitionBroken(lists, f.totalSteps, true));
    bad('the standing units do not add up', f.standingUnits !== sum(f.effectsStanding));
    bad('the exactness of the standing units contradicts the unknown steps', f.standingUnitsExact !== (lists.unknown.length === 0));
    bad('the determination contradicts the unknown steps', (body.determination === 'INTERRUPTED_KNOWN' && lists.unknown.length > 0) || (body.determination === 'INTERRUPTED_UNKNOWN' && lists.unknown.length === 0));
    bad('the statement is not the one the facts allow', body.statement !== describeDetermination(body.determination, f));
    return verdict();
  }

  // A typed failure is the closed table's entry for its code: the reason and the allowed actions are never taken from the answer.
  function failureCheck(body) {
    if (!isPlain(body) || body.kind !== 'C017-typed-failure' || !isPlain(body.error) || typeof body.error.code !== 'string' || !Object.hasOwn(failures, body.error.code)) {
      return { ok: false, problems: ['the answer is not a typed failure of the closed table'] };
    }
    const entry = failures[body.error.code];
    const { bad, verdict } = collect();
    bad('the reason or the group is not the one the closed table gives for this code', body.error.reason !== entry.reason || body.error.group !== entry.group);
    bad('the allowed actions are not the ones the closed table gives for this code', JSON.stringify(body.allowedActions) !== JSON.stringify(entry.actions));
    bad('a typed failure must claim no effect and no journal write', body.effectClaimed !== false || body.journalWritten !== false);
    return verdict();
  }

  return Object.freeze({ OUTCOMES, EFFECTIVE, HTTP_STATUS, DETERMINATIONS, STATUSES, JOURNAL_TYPES, identity, patterns, schemas, recovery, failures, validateCommand, failure, describe, describeDetermination, statementOf, claimCheck,
    viewCheck, startCheck, reconcileCheck, failureCheck, isPlain });
}));
