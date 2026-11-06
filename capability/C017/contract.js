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
    EXPECTATION_FAILED: [417, 'input', 'The Expect header is not supported; send the command without it.', ['correct-closed-command']],
    MALFORMED_REQUEST: [400, 'input', 'The request is not valid HTTP and was not read.', ['correct-closed-command']],
    HEADERS_TOO_LARGE: [431, 'input', 'The request headers exceed the small closed size.', ['correct-closed-command']],
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

  // The wording a cancel answer may carry, re-derived from its OWN facts (the page prints this, never the server's prose). Facts the wording cannot be
  // built from yield null, which no statement equals.
  const statementOf = (body) => {
    try {
      return describe(body.outcome, body.facts.effectsStanding === null ? null : body.facts);
    } catch {
      return null;
    }
  };

  // Consistency of a cancel answer with its own facts. The page runs it on every answer and refuses to display a claim it fails.
  function claimCheck(body) {
    const problems = [];
    if (!isPlain(body) || !OUTCOMES.includes(body.outcome) || !isPlain(body.facts)) return { ok: false, problems: ['the answer is not one of the five outcomes with facts'] };
    const f = body.facts;
    if (body.effective !== EFFECTIVE.includes(body.outcome)) problems.push('effective contradicts the outcome');
    if (body.statement !== statementOf(body)) problems.push('the statement is not the one the facts allow');
    const unknownOutcome = body.outcome === 'CANCEL_UNKNOWN';
    if (body.actionStopped !== (unknownOutcome ? null : body.outcome !== 'CANCEL_TOO_LATE')) problems.push('actionStopped contradicts the outcome');
    if (unknownOutcome ? body.actionCompleted !== false && body.actionCompleted !== null : body.actionCompleted !== (body.outcome === 'CANCEL_TOO_LATE')) problems.push('actionCompleted contradicts the outcome');
    if (body.outcome === 'CANCEL_UNKNOWN') {
      if (body.actionStopped !== null || body.nothingUndone !== null || body.effective !== false) problems.push('unknown must not claim stopped, nothing undone or effective');
      return { ok: problems.length === 0, problems };
    }
    const steps = (name) => (Array.isArray(f[name]) ? f[name].map((e) => (typeof e === 'number' ? e : (isPlain(e) ? e.step : NaN))) : null);
    const standing = steps('effectsStanding'); const undone = steps('undone'); const notRun = steps('stepsNotRun'); const unknown = steps('unknownSteps');
    if (!standing || !undone || !notRun || !unknown || !Number.isSafeInteger(f.totalSteps)) return { ok: false, problems: [...problems, 'facts are incomplete'] };
    const all = [...standing, ...undone, ...notRun, ...unknown].sort((a, b) => a - b);
    if (unknown.length || all.some((step, index) => step !== index + 1) || all.length !== f.totalSteps) problems.push('facts do not partition the steps');
    if (f.standingUnits !== f.effectsStanding.reduce((total, e) => total + (isPlain(e) ? e.units : NaN), 0)) problems.push('standing units do not add up');
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
    bad('the compensation state is not closed', !COMPENSATION.includes(a.compensation) || (a.compensation === 'FAILED') !== isPlain(a.compensationFailure) || (a.compensationFailure !== null && !(isPlain(a.compensationFailure) && inRange(a.compensationFailure.step, 1, 8))));
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
  // For a readable journal the window is also REPLAYED (paneOf): the lines shown must be one consistent history that leads to this very action.
  function viewCheck(view) {
    if (!isPlain(view) || view.kind !== 'C017-state' || view.schemaVersion !== 1) return { ok: false, problems: ['the answer is not a state view of this server'] };
    const { problems, bad, verdict } = collect();
    bad('the journal status is not closed', !['READABLE', 'UNREADABLE'].includes(view.journalStatus));
    bad('the lease is not a lease of this server', !named(view.lease));
    bad('the epoch is not valid', !(view.epoch === null || inRange(view.epoch, 0, 1000000)));
    bad('the journal window is malformed', !journalWindow(view));
    bad('an unreadable journal cannot come with an action', view.journalStatus === 'UNREADABLE' && view.action !== null);
    if (!problems.length && view.action !== null) problems.push(...actionProblems(view.action, view.journal));
    if (!problems.length && view.journalStatus === 'READABLE') problems.push(...paneOf(view).problems);
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

  // ---- The ledger: the pure derivation of every fact from the journal entries. It lives here (moved from reconcile.cjs) so that the server and the
  // PAGE run the very same function: the page re-derives the journal pane and the action from the lines it is shown and trusts neither (F13).
  // derive() also validates the journal grammar, so a forged or inconsistent decision makes the whole journal unreadable.
  const ledger = (() => {
    class JournalInconsistent extends Error {
      constructor(index, message) {
        super(`journal entry ${index}: ${message}`);
        this.name = 'JournalInconsistent';
        this.code = 'JOURNAL_INCONSISTENT';
        this.index = index;
      }
    }
    const bad = (index, message) => { throw new JournalInconsistent(index, message); };
    const kinds = {
      s: (v) => typeof v === 'string' && v.length <= 80, i: isInt, b: (v) => typeof v === 'boolean',
      a: (v) => Array.isArray(v) && v.length <= 16 && v.every((e) => isInt(e) || (isPlain(e) && isInt(e.step))),
    };
    const FIELDS = {
      boot: { bootId: 's' },
      'action-accepted': { leaseId: 's', runId: 's', userId: 's', actionId: 's', epoch: 'i', totalSteps: 'i', unitsPerStep: 'i', startKey: 's', startSha256: 's' },
      'step-intent': { actionId: 's', step: 'i' },
      'step-effect': { actionId: 's', step: 'i', units: 'i', standingUnits: 'i' },
      'action-completed': { actionId: 's', standingUnits: 'i' },
      'cancel-requested': { actionId: 's', key: 's', commandSha256: 's', compensate: 'b', observedEffects: 'i', observedInFlight: 'i' },
      'compensation-intent': { actionId: 's', step: 'i' },
      'compensation-effect': { actionId: 's', step: 'i', units: 'i', standingUnits: 'i' },
      'compensation-failed': { actionId: 's', step: 'i', reason: 's' },
      'cancel-decided': { actionId: 's', key: 's', outcome: 's', effectsStanding: 'a', stepsNotRun: 'a', undone: 'a', compensation: 's' },
      reconciled: { actionId: 's', key: 's', commandSha256: 's', determination: 's', effectsStanding: 'a', unknownSteps: 'a', stepsNotRun: 'a' },
    };
    const ENTRY_TYPES = Object.freeze(Object.keys(FIELDS));

    function shape(entry, index) {
      if (!isPlain(entry) || typeof entry.type !== 'string' || !Object.hasOwn(FIELDS, entry.type)) bad(index, 'unknown entry type');
      const spec = FIELDS[entry.type];
      const keys = Object.keys(entry).sort().join();
      if (keys !== ['at', 'type', ...Object.keys(spec)].sort().join()) bad(index, 'fields are not exactly the closed set of the type');
      if (typeof entry.at !== 'string' || entry.at.length > 40) bad(index, 'the timestamp is not a short string');
      for (const [name, kind] of Object.entries(spec)) if (!kinds[kind](entry[name])) bad(index, `field ${name} has the wrong type`);
    }

    const num = (a, b) => a - b;
    const sumOf = (map, skip) => [...map].filter(([step]) => !skip.has(step)).reduce((total, [, amount]) => total + amount, 0);
    const same = (claimed, actual) => JSON.stringify(claimed.map((e) => (typeof e === 'number' ? e : e.step))) === JSON.stringify(actual);
    const standingUnitsOf = (a) => sumOf(a.effects, a.comp.effects);

    function newAction(e) {
      return {
        leaseId: e.leaseId, runId: e.runId, userId: e.userId, actionId: e.actionId, epoch: e.epoch, totalSteps: e.totalSteps, unitsPerStep: e.unitsPerStep,
        effects: new Map(), intents: new Set(), pendingStep: 0, completed: false, cancel: null,
        comp: { intents: new Set(), effects: new Map(), failed: null, pendingStep: 0 }, interrupted: false, reconciled: null, closed: false,
      };
    }

    function lists(a) {
      const unknown = [];
      if (a.interrupted) for (const step of [a.pendingStep, a.comp.pendingStep]) if (step && !unknown.includes(step)) unknown.push(step);
      unknown.sort(num);
      const standing = [...a.effects.keys()].filter((s) => !a.comp.effects.has(s) && !unknown.includes(s)).sort(num);
      const notRun = Array.from({ length: a.totalSteps }, (_, i) => i + 1).filter((s) => !a.intents.has(s));
      return { standing, undone: [...a.comp.effects.keys()], notRun, unknown };
    }

    function compensationOf(a) {
      if (!a.cancel || !a.cancel.compensate) return 'NOT_REQUESTED';
      if (a.comp.failed) return 'FAILED';
      if (a.effects.size > 0 && a.comp.effects.size === a.effects.size) return 'COMPLETE';
      if (a.comp.intents.size > 0) return a.interrupted ? 'INTERRUPTED' : 'IN_PROGRESS';
      return 'NOT_ATTEMPTED';
    }

    function classify(a) {
      const l = lists(a);
      if (a.completed) return 'CANCEL_TOO_LATE';
      if (a.interrupted || l.unknown.length) return 'CANCEL_UNKNOWN';
      if (a.comp.failed) return 'CANCELLED_PARTIAL';
      if (a.cancel && a.cancel.compensate && l.undone.length > 0 && l.standing.length === 0) return 'COMPENSATED';
      if (l.standing.length === 0 && l.undone.length === 0 && a.intents.size === 0) return 'CANCELLED_BEFORE_EFFECT';
      return 'CANCELLED_PARTIAL';
    }

    function determinationOf(a) {
      if (a.cancel && !a.cancel.decided && !a.completed) return 'CANCEL_UNKNOWN';
      return lists(a).unknown.length ? 'INTERRUPTED_UNKNOWN' : 'INTERRUPTED_KNOWN';
    }

    function outcomeOf(a) {
      if (a.cancel && a.cancel.decided) return a.cancel.outcome;
      if (a.completed) return 'CANCEL_TOO_LATE';
      return a.interrupted ? 'CANCEL_UNKNOWN' : null;
    }

    function apply(a, e, i, claim) {
      const live = !a.interrupted && !a.closed && !a.completed;
      switch (e.type) {
        case 'step-intent':
          if (!live || a.cancel || a.pendingStep || e.step !== a.effects.size + 1 || e.step > a.totalSteps) bad(i, 'step intent is out of order');
          a.intents.add(e.step);
          a.pendingStep = e.step;
          break;
        case 'step-effect':
          if (a.interrupted || a.closed || a.pendingStep !== e.step || e.units !== a.unitsPerStep || e.standingUnits !== standingUnitsOf(a) + e.units) bad(i, 'step effect does not match its intent');
          a.effects.set(e.step, e.units);
          a.pendingStep = 0;
          break;
        case 'action-completed':
          if (!live || a.pendingStep || a.effects.size !== a.totalSteps || e.standingUnits !== standingUnitsOf(a)) bad(i, 'completion does not match the effects');
          a.completed = true;
          break;
        case 'cancel-requested':
          if (a.cancel || a.closed || a.interrupted || e.observedEffects !== a.effects.size || e.observedInFlight !== a.pendingStep) bad(i, 'cancel request does not match the state it saw');
          // The last step effect and the completion are ONE append, so no honest journal has a cancel request between them.
          if (a.effects.size === a.totalSteps && !a.completed) bad(i, 'cancel request between the last effect and the completion');
          claim(i, e.key, 'cancel', e.commandSha256, a.actionId);
          a.cancel = { key: e.key, compensate: e.compensate, decided: false, outcome: null };
          break;
        case 'compensation-intent': {
          const next = [...a.effects.keys()].filter((s) => !a.comp.effects.has(s)).sort(num).pop();
          if (!a.cancel || !a.cancel.compensate || a.cancel.decided || !live || a.completed || a.pendingStep || a.comp.failed || a.comp.pendingStep || e.step !== next) bad(i, 'compensation is not allowed here');
          a.comp.pendingStep = e.step;
          a.comp.intents.add(e.step);
          break;
        }
        case 'compensation-effect':
          if (a.interrupted || a.comp.pendingStep !== e.step || e.units !== -a.effects.get(e.step) || e.standingUnits !== standingUnitsOf(a) + e.units) bad(i, 'compensating effect does not match its intent');
          a.comp.effects.set(e.step, a.effects.get(e.step));
          a.comp.pendingStep = 0;
          break;
        case 'compensation-failed':
          if (a.interrupted || a.comp.pendingStep !== e.step || e.reason !== 'SYNTHETIC_FAULT') bad(i, 'compensation failure does not match its intent');
          a.comp.failed = { step: e.step, reason: e.reason };
          a.comp.pendingStep = 0;
          break;
        case 'cancel-decided': {
          if (!a.cancel || a.cancel.key !== e.key || a.cancel.decided || a.pendingStep || a.comp.pendingStep || a.interrupted) bad(i, 'decision without a settled request');
          if (a.cancel.compensate && !a.completed && a.effects.size > 0 && !a.comp.failed && a.comp.effects.size !== a.effects.size) bad(i, 'decision before compensation finished');
          const l = lists(a);
          if (e.outcome !== classify(a) || !same(e.effectsStanding, l.standing) || !same(e.stepsNotRun, l.notRun) || !same(e.undone, l.undone) || e.compensation !== compensationOf(a)) {
            bad(i, 'the recorded decision is not what the journal proves');
          }
          a.cancel.decided = true;
          a.cancel.outcome = e.outcome;
          a.closed = true;
          break;
        }
        case 'reconciled': {
          if (!a.interrupted || a.closed) bad(i, 'only an interrupted action can be reconciled');
          claim(i, e.key, 'reconcile', e.commandSha256, a.actionId);
          const l = lists(a);
          if (e.determination !== determinationOf(a) || !same(e.effectsStanding, l.standing) || !same(e.unknownSteps, l.unknown) || !same(e.stepsNotRun, l.notRun)) bad(i, 'the reconciliation is not what the journal proves');
          a.reconciled = { key: e.key, determination: e.determination };
          a.closed = true;
          break;
        }
        default:
          bad(i, 'unexpected entry type');
      }
    }

    // windowed: the entries are a SUFFIX of a journal that starts at an action-accepted line (the page sees only the last lines), so the
    // first action may carry any epoch; every later rule is the same as for a whole journal.
    function derive(entries, { windowed = false } = {}) {
      const keys = new Map();
      const actions = [];
      let cur = null;
      let boots = 0;
      const claim = (index, key, kind, sha256, actionId) => {
        if (keys.has(key)) bad(index, 'a key may be journaled once');
        keys.set(key, { kind, sha256, actionId });
      };
      entries.forEach((e, index) => {
        shape(e, index);
        if (e.type === 'boot') {
          boots += 1;
          if (cur && !cur.completed && !cur.closed) cur.interrupted = true;
        } else if (e.type === 'action-accepted') {
          if (cur && !(cur.closed || cur.completed)) bad(index, 'a new action began before the previous one settled');
          if (e.leaseId !== identity.leaseId || e.runId !== identity.runId || e.userId !== identity.userId) bad(index, 'the action is not attributed to the lease, run and user of this server');
          const epochOk = windowed && !cur ? e.epoch >= 1 : e.epoch === (cur ? cur.epoch + 1 : 1);
          if (!epochOk || e.totalSteps < 1 || e.totalSteps > 8 || e.unitsPerStep < 1 || e.unitsPerStep > 1000) bad(index, 'epoch or sizing is not valid');
          cur = newAction(e);
          actions.push(cur);
          claim(index, e.startKey, 'start', e.startSha256, e.actionId);
        } else {
          if (!cur || e.actionId !== cur.actionId) bad(index, 'entry does not belong to the current action');
          apply(cur, e, index, claim);
        }
      });
      return { keys, actions, action: cur, boots, epoch: cur ? cur.epoch : 0 };
    }

    function statusOf(a) {
      if (a.reconciled) return 'RECONCILED';
      if (a.cancel && a.cancel.decided) return a.cancel.outcome === 'CANCEL_TOO_LATE' ? 'COMPLETED' : 'CANCELLED';
      if (a.completed) return 'COMPLETED';
      if (a.interrupted) return 'INTERRUPTED';
      if (a.cancel) return 'CANCEL_REQUESTED';
      return a.intents.size ? 'RUNNING' : 'ACCEPTED';
    }

    function factsOf(a) {
      const l = lists(a);
      const unit = (step) => ({ step, units: a.effects.get(step) });
      const standing = l.standing.map(unit);
      return {
        totalSteps: a.totalSteps, effectsStanding: standing, stepsNotRun: l.notRun, unknownSteps: l.unknown, undone: l.undone.map(unit),
        standingUnits: standing.reduce((total, e) => total + e.units, 0), standingUnitsExact: l.unknown.length === 0, compensation: compensationOf(a),
        compensationFailure: a.comp.failed ? { step: a.comp.failed.step, reason: a.comp.failed.reason } : null,
      };
    }

    function actionView(a) {
      const status = statusOf(a);
      const live = ['ACCEPTED', 'RUNNING', 'CANCEL_REQUESTED'].includes(status);
      const facts = factsOf(a);
      const l = lists(a);
      const stepState = (step) => {
        if (l.unknown.includes(step)) return 'UNKNOWN';
        if (a.comp.effects.has(step)) return 'REVERSED';
        if (a.effects.has(step)) return 'STANDS';
        if (a.intents.has(step)) return 'IN_FLIGHT';
        return live ? 'PENDING' : 'NOT_RUN';
      };
      return {
        leaseId: a.leaseId, runId: a.runId, userId: a.userId, actionId: a.actionId, epoch: a.epoch, status, live, totalSteps: a.totalSteps, unitsPerStep: a.unitsPerStep,
        steps: Array.from({ length: a.totalSteps }, (_, i) => ({ step: i + 1, state: stepState(i + 1), units: a.unitsPerStep })),
        effectsStanding: facts.effectsStanding, stepsNotRun: live ? [] : facts.stepsNotRun, stepsPending: live ? facts.stepsNotRun : [], unknownSteps: facts.unknownSteps,
        undone: facts.undone, standingUnits: facts.standingUnits, standingUnitsExact: facts.standingUnitsExact, compensation: facts.compensation, compensationFailure: facts.compensationFailure,
        cancel: a.cancel ? { key: a.cancel.key, compensate: a.cancel.compensate, decided: a.cancel.decided, outcome: outcomeOf(a), compensation: facts.compensation } : null,
        reconciliation: a.reconciled ? { ...a.reconciled } : null,
      };
    }

    return Object.freeze({ JournalInconsistent, ENTRY_TYPES, derive, lists, classify, compensationOf, determinationOf, outcomeOf, statusOf, factsOf, actionView, standingUnitsOf });
  })();

  // Structural equality of two JSON values, independent of key order (a server that merely reorders keys is not lying).
  function sameJson(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => sameJson(value, b[index]));
    if (isPlain(a) && isPlain(b)) {
      const keys = Object.keys(a);
      return keys.length === Object.keys(b).length && keys.every((name) => Object.hasOwn(b, name) && sameJson(a[name], b[name]));
    }
    return Object.is(a, b);
  }

  // The journal pane (F13). A window is the LAST lines of the journal, so it is replayed with the very same state machine the server uses, from
  // the first action-accepted line of the window on: the lines before it belong to an action whose start is not shown, cannot be re-derived and
  // are therefore NOT shown at all. What is shown is one consistent history, and the action it leads to is exactly the action the view claims.
  function paneOf(view) {
    const omitted = view.journalOmitted === undefined ? 0 : view.journalOmitted;
    const lines = view.journal;
    const first = lines.findIndex((e) => e.type === 'action-accepted');
    // Leading boot lines need no state (only their shape is checked); any other line before the first action-accepted belongs to an action
    // whose start is not in the window: it cannot be re-derived, so it is not shown.
    const from = view.action === null || lines.slice(0, Math.max(first, 0)).every((e) => e.type === 'boot') ? 0 : first;
    if (view.action !== null && first < 0) return { shown: [], first: omitted + lines.length, hidden: omitted + lines.length, problems: [] };
    const problems = [];
    try {
      const derived = ledger.derive(lines.slice(from), { windowed: true });
      if (view.action === null ? derived.action !== null : !derived.action || !sameJson(ledger.actionView(derived.action), view.action)) problems.push('the journal does not derive the action the view shows');
      if (view.epoch !== derived.epoch) problems.push('the epoch is not the one the journal derives');
    } catch (error) {
      if (!(error instanceof ledger.JournalInconsistent)) throw error;
      problems.push(`the journal window is not one consistent history of the action: ${error.message}`);
    }
    return { shown: lines.slice(from), first: omitted + from, hidden: omitted + from, problems };
  }

  // The lines of an ACCEPTED view that may be displayed, with their absolute numbers, and how many are not shown.
  function journalPane(view) {
    const pane = paneOf(view);
    return { lines: pane.shown.map((entry, index) => ({ number: pane.first + index + 1, entry })), hidden: pane.hidden };
  }

  // A check never throws: a shape it cannot read is a refusal with a fixed sentence (F15: a delivered malformed answer was reported as "not reachable").
  const total = (check) => (body) => {
    try {
      return check(body);
    } catch {
      return { ok: false, problems: ['the answer has a shape the check cannot read'] };
    }
  };

  return Object.freeze({ OUTCOMES, EFFECTIVE, HTTP_STATUS, DETERMINATIONS, STATUSES, JOURNAL_TYPES, identity, patterns, schemas, recovery, failures, validateCommand, failure, describe, describeDetermination, statementOf,
    claimCheck: total(claimCheck), viewCheck: total(viewCheck), startCheck: total(startCheck), reconcileCheck: total(reconcileCheck), failureCheck: total(failureCheck), journalPane, ledger, isPlain });
}));
