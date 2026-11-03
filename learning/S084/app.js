(function () {
  'use strict';
  const lesson = S084Model.createLesson();
  const byId = (id) => document.getElementById(id);
  const text = (id, value) => { byId(id).textContent = value; };
  const fieldIds = { retryPolicy: 'retry-policy', evidence: 'evidence', prediction: 'prediction' };
  function clearError() {
    const error = byId('input-error');
    error.textContent = '';
    error.hidden = true;
    Object.values(fieldIds).forEach((id) => byId(id).removeAttribute('aria-invalid'));
  }
  function row(values) {
    const element = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = value;
      element.append(cell);
    }
    return element;
  }
  function closeDetails() {
    byId('history-detail').open = false;
    text('history-proof', '');
  }
  function restoreForms() {
    byId('settings-form').reset();
    byId('prediction-form').reset();
    closeDetails();
  }
  function render() {
    const state = lesson.snapshot();
    const observation = state.observation;
    const result = state.result;
    byId('settings').disabled = state.phase !== 'idle';
    byId('retry-policy').value = state.settings.retryPolicy;
    byId('evidence').value = state.settings.evidence;
    byId('deliver').disabled = state.phase !== 'idle';
    byId('retry-commands').disabled = state.phase !== 'delivered';
    byId('verify-run').disabled = state.phase !== 'retried';
    byId('prediction-settings').disabled = state.phase !== 'verified';
    byId('prediction').value = state.prediction || '';
    byId('new-attempt').disabled = state.phase !== 'checked' || state.history.length >= state.maxAttempts;
    text('phase', `Phase: ${state.phase}`);
    text('outcome', `Result: ${result ? result.outcome : 'not verified'}`);
    byId('outcome').dataset.verdict = result ? result.outcome : 'unverified';
    text('gates', ['resources', 'swaps', 'state', 'cleanup', 'audit'].map((gate, index) =>
      `${index === 0 ? 'Resources' : gate}: ${result ? result.gates[gate] : 'not verified'}`).join(' · '));
    text('delivery-totals', result
      ? `Delivery outcomes: ${result.deliveries} attempted · ${result.known} known · ${result.unknown} unknown`
      : 'Delivery outcomes: not verified');
    text('evidence-note', observation ? observation.observationPoint : 'No retry evidence inspected.');
    text('inventory', observation
      ? `Last observed resources: ${observation.resources.length} (${observation.resources.join(', ')})`
      : 'Last observed resources: not inspected');
    text('routing', observation
      ? `Last observed route: ${observation.route} (target ${observation.routeTargetPresent ? 'present' : 'MISSING'})`
      : 'Last observed route: not inspected');
    text('metrics', observation
      ? `Observed swaps: ${observation.swaps} · extra swaps: ${observation.extraSwaps} · intended removals: ${observation.removals}`
      : 'Observed swaps: not inspected · intended removals: not inspected');
    text('retry-metrics', state.phase === 'delivered'
      ? 'Original effects: 3 · retry outcomes: not inspected'
      : observation
      ? `Duplicate resources: ${observation.duplicateResources} · known effects: ${observation.knownEffects} · replayed receipts: ${observation.replayed} · cleanup retry errors: ${observation.cleanupErrors === null ? 'UNKNOWN' : observation.cleanupErrors}`
      : 'Duplicate resources: not inspected · retry effects: not inspected');
    byId('audit-rows').replaceChildren(...(observation ? observation.audit : []).map((entry) => row([
      entry.deliveryId, `${entry.operation} / ${entry.operationKey}`, entry.delivery,
      `${entry.actor} / ${entry.payload}`, entry.status, entry.effects === null ? 'UNKNOWN' : entry.effects,
      entry.receipt,
    ])));
    text('trace', state.trace.length ? state.trace.join('\n') : 'No attempt started.');
    text('prediction-result', state.learning
      ? `Prediction ${state.learning.correct ? 'correct' : 'incorrect'}; measured result unchanged: ${result.outcome}.`
      : 'Prediction not checked.');
    text('history-count', `Retained completed attempts: ${state.history.length} / ${state.maxAttempts}`);
    text('totals', `Attempt results: ${['PASS', 'FAIL', 'UNKNOWN'].map((outcome) =>
      `${state.history.filter((entry) => entry.result.outcome === outcome).length} ${outcome}`).join(' · ')}`);
    text('capacity-note', state.history.length >= state.maxAttempts
      ? 'Limit reached; reset all local data to begin again. Earlier evidence has not been evicted.'
      : 'Four attempts maximum; no automatic eviction.');
    byId('history-rows').replaceChildren(...state.history.map((entry) => {
      const element = row([
        entry.attempt, `${entry.settings.retryPolicy} / ${entry.settings.evidence}`, entry.result.outcome,
        entry.result.unknown, `${entry.prediction} (${entry.learning.correct ? 'correct' : 'incorrect'})`,
      ]);
      const cell = document.createElement('td');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `Inspect attempt ${entry.attempt}`;
      button.addEventListener('click', () => {
        text('history-proof', JSON.stringify(entry, null, 2));
        byId('history-detail').open = true;
        byId('history-summary').focus();
      });
      cell.append(button);
      element.append(cell);
      return element;
    }));
  }
  function act(action, nextFocus) {
    try {
      action();
      clearError();
      render();
      const id = typeof nextFocus === 'function' ? nextFocus() : nextFocus;
      if (id) byId(id).focus();
    } catch (error) {
      const element = byId('input-error');
      element.textContent = `${error.code || 'EXERCISE_ERROR'}: ${error.message}`;
      element.hidden = false;
      const field = fieldIds[error.field];
      if (field) byId(field).setAttribute('aria-invalid', 'true');
      (field ? byId(field) : element).focus();
    }
  }
  byId('settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    act(() => lesson.deliver({
      retryPolicy: byId('retry-policy').value, evidence: byId('evidence').value,
    }), 'retry-commands');
  });
  byId('retry-commands').addEventListener('click', () => act(() => lesson.retry(), 'verify-run'));
  byId('verify-run').addEventListener('click', () => act(() => lesson.verify(), 'prediction'));
  byId('prediction-form').addEventListener('submit', (event) => {
    event.preventDefault();
    act(() => lesson.check(byId('prediction').value), () =>
      lesson.snapshot().history.length < S084Model.MAX_ATTEMPTS ? 'new-attempt' : 'reset-all');
  });
  byId('new-attempt').addEventListener('click', () => act(() => {
    lesson.newAttempt();
    restoreForms();
  }, 'deliver'));
  byId('reset-all').addEventListener('click', () => act(() => {
    lesson.reset();
    restoreForms();
  }, 'deliver'));
  render();
  byId('lesson').dataset.ready = 'true';
}());
