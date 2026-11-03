(function () {
  'use strict';
  const lesson = globalThis.RollbackFailureLesson;
  const traceForm = document.getElementById('trace-form');
  const actionForm = document.getElementById('action-form');
  const trace = document.getElementById('failure-trace');
  const action = document.getElementById('operator-action');
  const start = document.getElementById('record-failure');
  const apply = document.getElementById('apply-choice');
  const reset = document.getElementById('reset-current');
  const error = document.getElementById('error');
  let state = lesson.createState();

  function text(id, value) {
    document.getElementById(id).textContent = String(value);
  }

  function routing(observation) {
    return observation === null ? 'Unknown — no current usable snapshot'
      : `Known-good ${observation.stablePercent}%, candidate ${observation.candidatePercent}% — revision ${observation.revision}`;
  }

  function clearError() {
    error.hidden = true;
    error.textContent = '';
  }

  function showError(failure) {
    error.textContent = failure instanceof Error ? failure.message : 'The synthetic input could not be checked.';
    error.hidden = false;
    error.focus();
  }

  function render() {
    const view = lesson.current(state);
    const total = lesson.summary(state);
    const exhausted = total.started === lesson.LIMITS.maxRuns;
    trace.disabled = view !== null;
    start.disabled = view !== null || exhausted;
    action.disabled = view === null || view.terminal || view.steps === lesson.LIMITS.maxChoices;
    apply.disabled = action.disabled;
    text('command-status', view ? 'Failure — original rollback remains failed' : 'No current rehearsal');
    text('observed-routing', view ? routing(view.observedRouting) : 'Unknown — not inspected');
    text('recovery-result', view ? `${view.recovery[0].toUpperCase()}${view.recovery.slice(1)}` : 'Unknown — no current rehearsal');
    document.getElementById('recovery-result').dataset.status = view ? view.recovery : 'unknown';
    text('completion', view && view.complete ? 'Yes — synthetic observed recovery only' : 'No — not complete');
    text('known-good', view ? 'Yes — retained healthy compatible fixture; not measured service health' : 'Fixture precondition; not a live health check');
    text('rollback-attempts', view ? view.rollbackAttempts : 0);
    text('reconcile-attempts', view ? view.reconcileAttempts : 0);
    text('choices-used', `${view ? view.steps : 0} / ${lesson.LIMITS.maxChoices}`);
    text('current-note', view ? view.lastEvent.message : 'Choose a fixed trace and record its synthetic failure.');
    text('started-count', total.started);
    text('success-count', total.recoverySuccess);
    text('failure-count', total.recoveryFailure);
    text('unknown-count', total.recoveryUnknown);
    text('rollback-failure-count', total.rollbackFailures);
    text('reconciliation-failure-count', total.reconciliationFailures);
    text('blind-rejection-count', total.blindRepeatsRejected);
    text('accounting', total.started === 0 ? 'No sample is no evidence.'
      : `Recovery success ${total.recoverySuccess} + failure ${total.recoveryFailure} + unknown ${total.recoveryUnknown} = ${total.started} started synthetic rehearsals.`);
    text('allowance', exhausted
      ? 'Four-rehearsal allowance reached. Current reset retains every result and cannot start a fifth rehearsal.'
      : `Four rehearsals maximum; eight choices each. ${lesson.LIMITS.maxRuns - total.started} starts remain; reset never replenishes them.`);
    const entries = lesson.history(state).map(event => {
      const item = document.createElement('li');
      item.dataset.run = String(event.runId);
      item.dataset.action = event.action;
      item.dataset.result = event.result;
      item.textContent = `Run ${event.runId}, step ${event.sequence}: ${event.action} — ${event.result}; ${event.accepted ? 'recorded' : 'rejected'}. ${event.message} Observed: ${routing(event.observedRouting)}. Recovery: ${event.recovery}; complete: ${event.complete ? 'yes' : 'no'}; known-good retained: yes (fixture). Rollback failure retained; issued rollback ${event.rollbackAttempts}, reconciliation ${event.reconcileAttempts}.`;
      return item;
    });
    document.getElementById('history').replaceChildren(...entries);
  }

  traceForm.addEventListener('submit', function (event) {
    event.preventDefault();
    try {
      state = lesson.startRun(state, trace.value);
      clearError();
      render();
      action.focus();
    } catch (failure) {
      showError(failure);
    }
  });

  actionForm.addEventListener('submit', function (event) {
    event.preventDefault();
    try {
      state = lesson.act(state, action.value);
      clearError();
      render();
      if (apply.disabled) reset.focus();
      else action.focus();
    } catch (failure) {
      showError(failure);
    }
  });

  reset.addEventListener('click', function () {
    try {
      state = lesson.resetCurrent(state);
      traceForm.reset();
      actionForm.reset();
      clearError();
      render();
      trace.focus();
    } catch (failure) {
      showError(failure);
    }
  });

  render();
}());
