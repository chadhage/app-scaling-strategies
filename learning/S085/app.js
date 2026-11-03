'use strict';

(function mount() {
  const lesson = globalThis.PromotionLesson.createLesson();
  const byId = (id) => document.getElementById(id);
  const form = byId('lesson-controls');
  const first = byId('first-session');
  const condition = byId('contender-condition');
  const prediction = byId('prediction');
  const error = byId('error');
  const conditions = ['busy-lock', 'stale-epoch', 'serialized', 'missing-owner'];
  const outcomes = ['SUCCESS', 'FAILURE', 'UNKNOWN'];
  const statusText = {
    idle: 'Choose the fixed condition, then Start.',
    'first-ready': 'The first session owns the lock. Submit its fixed promotion.',
    'contender-ready': 'First promotion applied at epoch 8. Submit the competing session.',
    decided: 'Inspect the contender outcome and safety evidence, then check your prediction to retain this attempt.',
    checked: 'Attempt retained. Start a new attempt or explicitly reset all local data.',
  };
  function clearError() {
    error.hidden = true;
    error.textContent = '';
    for (const input of [first, condition, prediction]) input.removeAttribute('aria-invalid');
  }
  function showError(message, input) {
    error.textContent = message;
    error.hidden = false;
    if (input) input.setAttribute('aria-invalid', 'true');
    (input || error).focus();
  }
  function metricText(metrics) {
    return `Submitted: ${metrics.submitted}; applied: ${metrics.applied}; rejected: ${metrics.rejected}; unknown: ${metrics.unknown}; invalid-owner effects: ${metrics.invalidOwnerEffects}; unrelated changes: ${metrics.unrelatedChanges}.`;
  }
  function render(state) {
    const active = state.active;
    first.disabled = condition.disabled = state.phase !== 'idle';
    byId('start').disabled = state.phase !== 'idle' || state.history.length >= 6;
    byId('submit-first').disabled = state.phase !== 'first-ready';
    byId('submit-contender').disabled = state.phase !== 'contender-ready';
    prediction.disabled = byId('check-prediction').disabled = state.phase !== 'decided';
    byId('new-attempt').disabled = state.phase !== 'checked' || state.history.length >= 6;
    byId('status').textContent = state.history.length === 6
      ? 'Six attempts retained; no eviction. Reset all local data to continue.' : statusText[state.phase];
    for (const [prefix, resource] of [['destination', active?.destination], ['other', active?.other]]) {
      for (const key of ['owner', 'epoch', 'version', 'effects']) {
        byId(`${prefix}-${key}`).textContent = resource ? String(resource[key]) : 'Not started';
      }
    }
    byId('current-metrics').textContent = active ? metricText(active.metrics) : 'No active submissions.';
    byId('outcome').textContent = active?.outcome
      ? `Contender outcome: ${active.outcome} — ${active.contender.reason}. Safety verifier: ${active.safety}. ${active.outcome === 'FAILURE' ? 'Safe rejection is not a completed contender migration.' : active.outcome === 'UNKNOWN' ? 'Missing evidence is not successful promotion or verified conflict rejection.' : 'Only this fixed synthetic contender promotion succeeded.'}`
      : 'Contender outcome: not evaluated.';
    byId('outcome').dataset.outcome = active?.outcome || 'NOT_EVALUATED';
    byId('prediction-feedback').textContent = state.phase === 'checked'
      ? `${active.predictionCorrect ? 'Correct' : 'Incorrect'} prediction: ${active.prediction}. The actual contender outcome remains ${active.outcome}.`
      : 'Prediction correctness is separate from the command outcome.';
    const trace = byId('trace');
    trace.replaceChildren();
    for (const entry of active?.trace || []) {
      const item = document.createElement('li');
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(entry, null, 2);
      item.append(pre);
      trace.append(item);
    }
    const history = byId('history');
    history.replaceChildren();
    for (const attempt of state.history) {
      const item = document.createElement('li');
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = `Attempt ${attempt.number}: ${attempt.outcome}; ${attempt.options.first} first; ${attempt.options.condition}; prediction ${attempt.predictionCorrect ? 'correct' : 'incorrect'}.`;
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(attempt, null, 2);
      details.append(summary, pre);
      item.append(details);
      history.append(item);
    }
    const totals = state.totals;
    byId('totals').textContent = `Retained attempts: ${totals.attempts}/6; commands: ${totals.submitted}; applied: ${totals.applied}; rejected: ${totals.rejected}; unknown: ${totals.unknown}; correct predictions: ${totals.correct}/${totals.attempts}. Active, unchecked commands are shown separately above.`;
  }
  function perform(action, focusId) {
    clearError();
    try {
      const state = action();
      render(state);
      byId(typeof focusId === 'function' ? focusId(state) : focusId).focus();
    } catch (failure) {
      showError(failure.name === 'GuardError' ? failure.message : 'Unexpected local error. Reset all local data before continuing.');
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    if (!['alpha', 'bravo'].includes(first.value)) {
      showError('Choose alpha or bravo as the first session.', first);
      return;
    }
    if (!conditions.includes(condition.value)) {
      showError('Choose one of the four fixed conditions.', condition);
      return;
    }
    perform(() => lesson.start({ first: first.value, condition: condition.value }), 'submit-first');
  });
  byId('submit-first').addEventListener('click', () => perform(() => lesson.submitFirst(), 'submit-contender'));
  byId('submit-contender').addEventListener('click', () => perform(() => lesson.submitContender(), 'prediction'));
  byId('check-prediction').addEventListener('click', () => {
    clearError();
    if (!outcomes.includes(prediction.value)) {
      showError('Choose SUCCESS, FAILURE or UNKNOWN before checking.', prediction);
      return;
    }
    perform(() => lesson.checkPrediction(prediction.value),
      (state) => state.history.length < 6 ? 'new-attempt' : 'reset-lesson');
  });
  function restoreForm() {
    HTMLFormElement.prototype.reset.call(form);
  }
  byId('new-attempt').addEventListener('click', () => perform(() => {
    const state = lesson.newAttempt();
    restoreForm();
    return state;
  }, 'start'));
  byId('reset-lesson').addEventListener('click', () => perform(() => {
    const state = lesson.reset();
    restoreForm();
    return state;
  }, 'start'));
  restoreForm();
  render(lesson.snapshot());
})();
