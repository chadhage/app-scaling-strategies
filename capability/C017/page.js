(function () {
  'use strict';

  const C = globalThis.C017Contract;
  const ids = ['lease', 'status', 'steps', 'units', 'start', 'compensate', 'cancel', 'reconcile', 'refresh', 'outcome', 'facts', 'journal'];
  const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  const stepWords = {
    STANDS: 'STANDS (took effect)', IN_FLIGHT: 'IN FLIGHT (begun, effect not yet recorded)', PENDING: 'not yet run', NOT_RUN: 'NOT RUN',
    UNKNOWN: 'UNKNOWN (begun, effect not recorded)', REVERSED: 'REVERSED by its own journaled compensating step',
  };
  const stoppedWords = {
    CANCELLED_BEFORE_EFFECT: 'Stopped before any effect was produced.', CANCELLED_PARTIAL: 'Stopped partway: some effects STAND. See the outcome below.',
    COMPENSATED: 'Stopped, then reversed by journaled compensating steps.', CANCEL_TOO_LATE: 'Completed before the cancel could act.', CANCEL_UNKNOWN: 'UNKNOWN: the cancel is not confirmed.',
  };
  let state = null;
  let cancelAttempt = null;
  let busy = false;
  let timer = null;

  const say = (id, text) => { el[id].textContent = text; };
  const newKey = () => `k-${typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')}`;

  function fill(list, lines) {
    list.replaceChildren(...lines.map((line) => { const item = document.createElement('li'); item.textContent = line; return item; }));
  }

  function statusText(view) {
    if (state && state.journalStatus === 'UNREADABLE') return 'The journal cannot be read. The state is UNKNOWN: nothing is claimed as cancelled, completed or undone.';
    if (!view) return 'No action has been started.';
    const done = view.steps.filter((step) => ['STANDS', 'REVERSED'].includes(step.state)).length;
    const words = {
      ACCEPTED: 'Accepted; no step has run yet.', RUNNING: `In flight: ${done} of ${view.totalSteps} steps have taken effect.`,
      CANCEL_REQUESTED: 'A cancel was received; the server applies it at the next step boundary and has not decided yet.',
      COMPLETED: `Completed: all ${view.totalSteps} steps took effect.`,
      CANCELLED: view.cancel ? stoppedWords[view.cancel.outcome] : 'Stopped.',
      INTERRUPTED: 'Interrupted by a server restart. Not cancelled and not completed. Reconcile to settle the facts.',
      RECONCILED: 'Interrupted and reconciled. The action neither completed nor was cancelled.',
    };
    return words[view.status];
  }

  function factsOf(view) {
    return {
      totalSteps: view.totalSteps, effectsStanding: view.effectsStanding, stepsNotRun: view.stepsNotRun, unknownSteps: view.unknownSteps, undone: view.undone,
      standingUnits: view.standingUnits, standingUnitsExact: view.standingUnitsExact, compensation: view.compensation, compensationFailure: view.compensationFailure,
    };
  }

  function showFacts(facts) {
    const steps = (list) => (list.length ? list.map((e) => (typeof e === 'number' ? e : e.step)).join(', ') : 'none');
    fill(el.facts, [`Steps whose effect STANDS: ${steps(facts.effectsStanding)}`, `Steps NOT RUN: ${steps(facts.stepsNotRun)}`, `Steps with UNKNOWN effect: ${steps(facts.unknownSteps)}`,
      `Steps reversed by journaled compensating steps: ${steps(facts.undone)}`, `Synthetic units standing: ${facts.standingUnitsExact ? '' : 'at least '}${facts.standingUnits}`]);
  }

  function renderOutcome(view) {
    const cancel = view && view.cancel;
    if (!cancel) return;
    if (cancel.outcome === null) { say('outcome', 'Cancel pending: the server has not decided yet. Nothing is claimed.'); return; }
    say('outcome', C.describe(cancel.outcome, factsOf(view)));
    showFacts(factsOf(view));
  }

  function render(next, keepOutcome) {
    state = next;
    const view = next.action;
    say('lease', next.lease.leaseId);
    say('status', statusText(view));
    fill(el.steps, view ? view.steps.map((s) => `Step ${s.step}: ${stepWords[s.state]} (${s.units} synthetic units)`) : []);
    say('units', view ? `Standing synthetic units: ${view.standingUnitsExact ? '' : 'at least '}${view.standingUnits}` : '');
    const omitted = next.journalOmitted > 0 ? [`${next.journalOmitted} earlier entries are not shown; the server keeps all of them.`] : [];
    fill(el.journal, [...omitted, ...next.journal.map((e, i) => `#${i + 1 + (next.journalOmitted || 0)} ${e.type}${e.step ? ` step ${e.step}` : ''}${e.outcome ? ` ${e.outcome}` : ''}${e.determination ? ` ${e.determination}` : ''}`)]);
    const live = Boolean(view && view.live);
    el.cancel.disabled = busy || !live;
    el.compensate.disabled = busy || !live;
    el.reconcile.disabled = busy || !view || view.status !== 'INTERRUPTED';
    el.start.disabled = busy || next.journalStatus !== 'READABLE' || Boolean(view && (live || view.status === 'INTERRUPTED'));
    if (!keepOutcome) renderOutcome(view);
    clearTimeout(timer);
    if (live) timer = setTimeout(() => refresh(), 500);
  }

  async function send(path, command) {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command), cache: 'no-store', credentials: 'omit', redirect: 'error' });
    return { status: response.status, body: await response.json() };
  }

  async function refresh(keepOutcome) {
    try {
      const response = await fetch('/api/state', { cache: 'no-store', credentials: 'omit', redirect: 'error' });
      render(await response.json(), keepOutcome);
    } catch {
      say('status', 'The server is not reachable. What is shown may be stale; nothing new is claimed.');
    }
  }

  function showAnswer(answer) {
    const body = answer.body;
    if (body && body.kind === 'C017-cancel-result') {
      const check = C.claimCheck(body);
      if (!check.ok) { say('outcome', `The server's answer contradicts its own facts (${check.problems.join('; ')}). No cancellation, undo or completion is claimed.`); fill(el.facts, []); return; }
      say('outcome', body.statement);
      showFacts(body.facts);
    } else if (body && body.kind === 'C017-reconcile-result') {
      say('outcome', body.statement);
      showFacts(body.facts);
    } else if (body && body.kind === 'C017-start-result') {
      say('outcome', `Start accepted for epoch ${body.action.epoch}. Nothing has been cancelled or undone.`);
      fill(el.facts, []);
    } else if (body && body.kind === 'C017-typed-failure') {
      say('outcome', `Not applied (${body.error.code}): ${body.error.reason} Allowed next steps: ${body.allowedActions.join(', ')}. No outcome is claimed.`);
      fill(el.facts, []);
    } else say('outcome', 'The answer was not recognized. Nothing is claimed.');
  }

  async function command(kind, build) {
    if (busy || !state || (kind !== 'start' && !state.action)) return;
    busy = true;
    el.cancel.disabled = true;
    el.start.disabled = true;
    el.reconcile.disabled = true;
    let answer = null;
    try {
      answer = await send(`/api/${kind}`, build(state.action));
    } catch {
      say('outcome', 'The request was not delivered or its answer was lost. UNKNOWN: nothing is claimed as cancelled, stopped, started or undone. Press the button again to retry with the same key, or refresh to read the journal.');
      fill(el.facts, []);
    }
    if (answer) {
      showAnswer(answer);
      if (kind === 'cancel' && !(answer.body && answer.body.outcome === 'CANCEL_UNKNOWN')) cancelAttempt = null;
    }
    busy = false;
    el.outcome.focus();
    await refresh(Boolean(answer));
  }

  const identity = (a) => ({ leaseId: a.leaseId, runId: a.runId, userId: a.userId, actionId: a.actionId, epoch: a.epoch });
  el.start.addEventListener('click', () => command('start', () => ({ schemaVersion: 1, kind: 'start', key: newKey(), leaseId: state.lease.leaseId, runId: state.lease.runId, userId: state.lease.userId, expectedEpoch: state.epoch })));
  el.cancel.addEventListener('click', () => command('cancel', (a) => {
    if (!cancelAttempt || cancelAttempt.actionId !== a.actionId) cancelAttempt = { actionId: a.actionId, key: newKey() };
    return { schemaVersion: 1, kind: 'cancel', key: cancelAttempt.key, ...identity(a), compensate: el.compensate.checked };
  }));
  el.reconcile.addEventListener('click', () => command('reconcile', (a) => ({ schemaVersion: 1, kind: 'reconcile', key: newKey(), ...identity(a) })));
  el.refresh.addEventListener('click', () => refresh());
  refresh();
}());
