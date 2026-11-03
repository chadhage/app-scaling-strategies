(function (root) {
  'use strict';
  const TRACES = freeze([
    { id: 'failed-before-apply', label: 'Failure before target applied' },
    { id: 'failed-after-apply', label: 'Failure after target applied' },
    { id: 'reconciliation-fails', label: 'Reconciliation also fails' },
    { id: 'routing-unobserved', label: 'Routing snapshot unavailable' }
  ]);
  const ACTIONS = freeze(['blind-repeat', 'inspect-routing', 'reconcile-known-good', 'verify-recovery']);
  const LIMITS = freeze({ maxRuns: 4, maxChoices: 8 });
  const REQUESTED = freeze({ stablePercent: 100, candidatePercent: 0 });
  const FIXTURES = freeze({
    'failed-before-apply': { initial: { stablePercent: 75, candidatePercent: 25 }, reconciled: REQUESTED, reconciliationStatus: 'success' },
    'failed-after-apply': { initial: REQUESTED, reconciled: REQUESTED, reconciliationStatus: 'success' },
    'reconciliation-fails': { initial: { stablePercent: 50, candidatePercent: 50 }, reconciled: { stablePercent: 50, candidatePercent: 50 }, reconciliationStatus: 'failure' },
    'routing-unobserved': { initial: null, reconciled: null, reconciliationStatus: null }
  });

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function exactObject(value, keys) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== keys.length
      || keys.some(key => !Object.hasOwn(value, key)
        || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) {
      throw new TypeError('Invalid state: expected exact plain data objects.');
    }
  }

  function boundedArray(value, maximum) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
      || value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1
      || Array.from({ length: value.length }, (_, i) => i).some(i => !Object.hasOwn(value, i)
        || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, i), 'value'))) {
      throw new TypeError('Invalid state: expected bounded, dense data arrays.');
    }
  }

  function traceGuard(trace) {
    if (typeof trace !== 'string' || !TRACES.some(item => item.id === trace)) {
      throw new RangeError('Invalid trace: choose one of the four fixed synthetic traces.');
    }
  }

  function actionGuard(action) {
    if (typeof action !== 'string' || !ACTIONS.includes(action)) {
      throw new RangeError('Invalid action: choose a listed synthetic operator action.');
    }
  }

  function replay(run) {
    const fixture = FIXTURES[run.trace];
    let effective = fixture.initial;
    let revision = 1;
    let inspectedRevision = null;
    let observation = null;
    let reconcileAttempts = 0;
    let reconciliationStatus = null;
    let recovery = 'unknown';
    let terminal = false;
    const events = [];

    function record(action, result, accepted, message) {
      events.push({
        id: `${run.id}-${events.length}`, runId: run.id, sequence: events.length,
        action, result, accepted, message, commandStatus: 'failure',
        observedRouting: observation, recovery, complete: recovery === 'success',
        knownGoodRetained: true, rollbackAttempts: 1, reconcileAttempts
      });
    }

    record('record-failure', 'failure', true,
      'Synthetic rollback failed. The requested target is not observed routing. Retain known-good service and inspect before claiming recovery.');

    for (const action of run.actions) {
      if (terminal) throw new RangeError('Invalid state: action after terminal verification; reset the current rehearsal.');
      actionGuard(action);
      if (action === 'blind-repeat') {
        record(action, 'failure', false,
          observation === null
            ? 'Blind reversal rejected: effective routing is unknown. No second rollback was issued.'
            : 'Blind reversal rejected: preserve inspected known-good state; use observation-grounded reconciliation, not another reversal.');
      } else if (action === 'inspect-routing') {
        inspectedRevision = revision;
        observation = effective === null ? null : { ...effective, revision };
        record(action, observation === null ? 'unknown' : 'success', true,
          observation === null
            ? 'No usable synthetic routing snapshot. Recovery remains unknown; do not invent effective state.'
            : `Inspected synthetic revision ${revision}: known-good ${observation.stablePercent}%, candidate ${observation.candidatePercent}%. Inspection alone does not declare completion.`);
      } else if (action === 'reconcile-known-good') {
        if (reconcileAttempts === 1) {
          record(action, 'failure', false,
            'A reconciliation was already issued. Blind retry rejected; retain the observation and verify honest incomplete recovery.');
        } else if (observation === null || inspectedRevision !== revision) {
          record(action, 'unknown', false,
            'Reconciliation blocked: inspect a usable current routing snapshot first. No synthetic routing change was issued.');
        } else if (observation.stablePercent === 100 && observation.candidatePercent === 0) {
          record(action, 'success', true,
            'Inspected routing already uses retained known-good service. Preserve it unchanged; no additional command is needed.');
        } else {
          reconcileAttempts = 1;
          reconciliationStatus = fixture.reconciliationStatus;
          effective = fixture.reconciled;
          revision += 1;
          observation = null;
          record(action, reconciliationStatus, true,
            reconciliationStatus === 'failure'
              ? 'Synthetic reconciliation also failed. The old observation is stale; inspect again. Recovery is not complete.'
              : 'Synthetic observation-grounded reconciliation recorded. The old observation is stale; inspect again before verifying recovery.');
        }
      } else if (inspectedRevision !== revision) {
        record(action, 'unknown', false,
          'Recovery check rejected: inspect the current effective routing revision first. A requested target or stale observation cannot prove completion.');
      } else {
        recovery = observation === null ? 'unknown'
          : observation.stablePercent === 100 && observation.candidatePercent === 0 ? 'success' : 'failure';
        terminal = true;
        record(action, recovery, true,
          recovery === 'success'
            ? 'Synthetic recovery verified from current 100% known-good routing. The original rollback command still counts as failure; this is not live continuity proof.'
            : recovery === 'failure'
              ? 'Synthetic recovery failed: observed candidate routing remains. Known-good service is retained, but recovery is not complete.'
              : 'Synthetic recovery unknown: there is no usable effective routing snapshot. An uncertain reversal is not complete.');
      }
    }

    return {
      view: {
        runId: run.id, traceId: run.trace, commandStatus: 'failure', requestedRouting: REQUESTED,
        observedRouting: observation, routingRevision: revision, knownGoodRetained: true,
        recovery, complete: recovery === 'success', terminal, steps: run.actions.length,
        rollbackAttempts: 1, reconcileAttempts, reconciliationStatus, lastEvent: events.at(-1)
      },
      events
    };
  }

  function stateGuard(state) {
    exactObject(state, ['version', 'runs', 'activeRunId']);
    if (state.version !== 1) throw new TypeError('Invalid state version.');
    boundedArray(state.runs, LIMITS.maxRuns);
    if (state.activeRunId !== null
      && (!Number.isInteger(state.activeRunId) || state.activeRunId < 1 || state.activeRunId !== state.runs.length)) {
      throw new TypeError('Invalid state: only the latest started run can be active.');
    }
    state.runs.forEach((run, index) => {
      exactObject(run, ['id', 'trace', 'actions']);
      if (run.id !== index + 1) throw new TypeError('Invalid state: run IDs must be consecutive.');
      traceGuard(run.trace);
      boundedArray(run.actions, LIMITS.maxChoices);
      replay(run);
    });
  }

  function copyRuns(state) {
    return state.runs.map(run => ({ id: run.id, trace: run.trace, actions: run.actions.slice() }));
  }

  function createState() {
    return freeze({ version: 1, runs: [], activeRunId: null });
  }

  function startRun(state, trace) {
    stateGuard(state);
    traceGuard(trace);
    if (state.activeRunId !== null) throw new RangeError('An active rehearsal exists; reset the current rehearsal first.');
    if (state.runs.length === LIMITS.maxRuns) throw new RangeError('The four-rehearsal allowance is full. Reset does not replenish it.');
    const runs = copyRuns(state);
    runs.push({ id: runs.length + 1, trace, actions: [] });
    return freeze({ version: 1, runs, activeRunId: runs.length });
  }

  function act(state, action) {
    stateGuard(state);
    actionGuard(action);
    if (state.activeRunId === null) throw new RangeError('Start a synthetic rehearsal before choosing an action.');
    const run = state.runs.at(-1);
    if (replay(run).view.terminal) throw new RangeError('This verification is terminal; reset the current rehearsal before another action.');
    if (run.actions.length === LIMITS.maxChoices) throw new RangeError('The eight-choice allowance is full. Reset retains this history.');
    const runs = copyRuns(state);
    runs.at(-1).actions.push(action);
    return freeze({ version: 1, runs, activeRunId: state.activeRunId });
  }

  function resetCurrent(state) {
    stateGuard(state);
    return freeze({ version: 1, runs: copyRuns(state), activeRunId: null });
  }

  function current(state) {
    stateGuard(state);
    return state.activeRunId === null ? null : freeze(replay(state.runs.at(-1)).view);
  }

  function history(state) {
    stateGuard(state);
    return freeze(state.runs.flatMap(run => replay(run).events));
  }

  function summary(state) {
    stateGuard(state);
    const views = state.runs.map(run => replay(run).view);
    return freeze({
      started: views.length,
      recoverySuccess: views.filter(view => view.recovery === 'success').length,
      recoveryFailure: views.filter(view => view.recovery === 'failure').length,
      recoveryUnknown: views.filter(view => view.recovery === 'unknown').length,
      rollbackFailures: views.length,
      reconciliationFailures: views.filter(view => view.reconciliationStatus === 'failure').length,
      issuedReconciliations: views.reduce((total, view) => total + view.reconcileAttempts, 0),
      blindRepeatsRejected: state.runs.reduce((total, run) => total + run.actions.filter(action => action === 'blind-repeat').length, 0),
      historyEntries: state.runs.reduce((total, run) => total + run.actions.length + 1, 0)
    });
  }

  const api = freeze({ TRACES, ACTIONS, LIMITS, createState, startRun, act, resetCurrent, current, history, summary });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RollbackFailureLesson = api;
}(typeof globalThis === 'object' ? globalThis : this));
