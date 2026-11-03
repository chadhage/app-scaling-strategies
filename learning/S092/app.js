'use strict';

(() => {
  const lesson = CanaryModel.createLesson();
  const byId = (id) => document.getElementById(id);
  const form = byId('exercise');
  const error = byId('lesson-error');
  const fields = {
    stage: 'canary-stage', observation: 'canary-observation', rollbackEvidence: 'rollback-evidence',
    transition: 'predict-transition', recovery: 'predict-recovery',
  };
  const text = (id, value) => { byId(id).textContent = String(value); };
  function cells(body, values) {
    const tr = document.createElement('tr');
    for (const value of values) {
      const td = document.createElement('td');
      td.textContent = String(value);
      tr.append(td);
    }
    body.append(tr);
  }
  function clearError() {
    error.hidden = true;
    error.textContent = '';
    for (const field of form.querySelectorAll('[aria-invalid]')) field.removeAttribute('aria-invalid');
  }
  function showError(cause) {
    error.hidden = false;
    error.textContent = `${cause.code || 'ERR_LESSON'}: ${cause.message}`;
    const field = cause.field && byId(fields[cause.field]);
    if (field && !field.disabled && !field.closest('fieldset').disabled) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    } else error.focus();
  }
  function render(state) {
    const current = state.active;
    const phase = state.phase;
    byId('configuration').disabled = phase !== 'IDLE';
    byId('start-canary').disabled = !state.canStart;
    byId('observe-canary').disabled = phase !== 'CANARY_STARTED';
    byId('attempt-expansion').disabled = phase !== 'CANARY_OBSERVED';
    byId('rehearse-rollback').disabled = phase !== 'EXPANSION_REVIEWED' || current.expansion.allowed;
    byId('prediction-fields').disabled = !(phase === 'RECOVERY_REHEARSED'
      || phase === 'EXPANSION_REVIEWED' && current.expansion.allowed);
    byId('new-attempt').disabled = !state.canNewAttempt;
    if (phase === 'IDLE') {
      for (const key of ['stage', 'observation', 'rollbackEvidence']) byId(fields[key]).value = state.config[key];
    }
    text('transition-result', current ? current.transition.verdict : 'NOT_STARTED');
    for (const [name, key] of Object.entries({
      'attempted-count': 'attempted', 'successful-count': 'successful',
      'interrupted-count': 'interrupted', 'unknown-count': 'unknown',
    })) text(name, current ? current.transition[key] : 0);
    text('old-only-count', current ? current.comparison.length : 0);
    text('expansion-result', current ? current.expansion.status : 'NOT_REVIEWED');
    text('admission-result', current ? current.candidateAdmissionOpen ? 'OPEN — current stage only' : 'STOPPED' : 'NOT_STARTED');
    text('desired-routing', `${current ? current.desiredCandidatePercent : 0}%`);
    text('observed-routing', current?.observedCandidatePercent === null ? 'UNKNOWN' : `${current ? current.observedCandidatePercent : 0}%`);
    text('recovery-result', current ? current.recovery.verdict : 'NOT_ATTEMPTED');
    text('recovery-count', current ? current.recovery.attempted : 0);
    text('learning-result', current ? current.prediction.verdict : 'NOT_CHECKED');
    for (const key of ['attempts', 'attempted', 'successful', 'interrupted', 'unknown']) text(`total-${key}`, state.totals[key]);
    text('total-fraction', state.totals.fraction === null ? 'No sample'
      : `${state.totals.successful}/${state.totals.attempted} (${(state.totals.fraction * 100).toFixed(2)}%) — synthetic only`);
    text('lesson-status', current
      ? `${phase}: original canary ${current.transition.verdict}; recovery ${current.recovery.verdict}; ${current.transition.interrupted} interrupted and ${current.transition.unknown} unknown of ${current.transition.attempted} attempted.`
      : 'Ready for a synthetic canary. No current journey result is measured.');
    const journeyBody = byId('journey-body');
    journeyBody.textContent = '';
    if (current) {
      for (const original of [...current.transition.journeys, ...current.comparison]) {
        const recovery = current.recovery.journeys.find((row) => row.clientId === original.clientId);
        cells(journeyBody, [
          original.clientId, original.intendedDestination === 'candidate-v2' ? 'Attempted candidate transition' : 'Old-only comparison (excluded)',
          original.outcome, `${original.syntheticHttpStatus ?? 'UNKNOWN'} / ${original.syntheticLatencyMs ?? 'UNKNOWN'}`,
          recovery ? recovery.observedDestination ?? 'UNKNOWN' : original.observedDestination,
          recovery ? recovery.outcome : 'NOT_ATTEMPTED',
        ]);
      }
    }
    byId('journey-empty').hidden = Boolean(current);
    const trace = byId('trace-list');
    trace.textContent = '';
    for (const entry of current ? current.trace : []) {
      const li = document.createElement('li');
      li.textContent = `${entry.action}: ${entry.message} ${JSON.stringify(entry.detail)}`;
      trace.append(li);
    }
    byId('trace-empty').hidden = Boolean(current?.trace.length);
    const historyBody = byId('history-body');
    historyBody.textContent = '';
    for (const attempt of state.history) {
      cells(historyBody, [
        attempt.number, `${attempt.config.stage}% / ${attempt.config.observation} / rollback ${attempt.config.rollbackEvidence}`,
        attempt.transition.verdict,
        `${attempt.transition.successful} successful; ${attempt.transition.interrupted} interrupted; ${attempt.transition.unknown} unknown / ${attempt.transition.attempted} attempted`,
        attempt.recovery.verdict, attempt.prediction.verdict,
      ]);
    }
    text('history-count', `${state.history.length} of ${CanaryFixtures.MAX_ATTEMPTS} checked attempts retained`);
    byId('history-empty').hidden = state.history.length > 0;
  }
  function perform(action, focus) {
    try {
      const state = action();
      clearError();
      render(state);
      const target = typeof focus === 'function' ? focus(state) : focus;
      if (target) byId(target).focus();
    } catch (cause) {
      clearError();
      showError(cause);
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    perform(() => lesson.start({
      stage: byId('canary-stage').value, observation: byId('canary-observation').value,
      rollbackEvidence: byId('rollback-evidence').value,
    }), 'observe-canary');
  });
  byId('observe-canary').addEventListener('click', () => perform(() => lesson.observe(), 'attempt-expansion'));
  byId('attempt-expansion').addEventListener('click', () => perform(() => lesson.reviewExpansion(),
    (state) => state.active.expansion.allowed ? 'predict-transition' : 'rehearse-rollback'));
  byId('rehearse-rollback').addEventListener('click', () => perform(() => lesson.rollback(), 'predict-transition'));
  byId('check-prediction').addEventListener('click', () => perform(() => lesson.checkPrediction({
    transition: byId('predict-transition').value, recovery: byId('predict-recovery').value,
  }), (state) => state.canNewAttempt ? 'new-attempt' : 'reset-lesson'));
  byId('new-attempt').addEventListener('click', () => perform(() => {
    const state = lesson.newAttempt();
    HTMLFormElement.prototype.reset.call(form);
    return state;
  }, 'canary-stage'));
  byId('reset-lesson').addEventListener('click', () => perform(() => {
    const state = lesson.reset();
    HTMLFormElement.prototype.reset.call(form);
    return state;
  }, 'canary-stage'));
  render(lesson.snapshot());
})();
