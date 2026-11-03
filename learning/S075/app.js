(function () {
  'use strict';
  const fixtures = globalThis.S075Fixtures;
  const lesson = globalThis.S075Model.createLesson();
  const byId = (id) => document.getElementById(id);
  const text = (id, value) => { byId(id).textContent = value; };
  const display = (value) => value === null ? 'unknown' : String(value);
  function rows(id, values) {
    const fragment = document.createDocumentFragment();
    for (const cells of values) {
      const row = document.createElement('tr');
      for (const value of cells) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      }
      fragment.append(row);
    }
    byId(id).replaceChildren(fragment);
  }
  function clearError() {
    const alert = byId('input-error');
    alert.hidden = true;
    alert.textContent = '';
    document.querySelectorAll('[aria-invalid]').forEach((element) => element.removeAttribute('aria-invalid'));
  }
  function showError(error) {
    text('input-error', error.message);
    byId('input-error').hidden = false;
    const field = byId(error.field || (error.message.startsWith('Invalid prediction') ? 'prediction' : 'input-error'));
    if (field.tagName === 'SELECT') field.setAttribute('aria-invalid', 'true');
    field.focus();
  }
  function render() {
    const state = lesson.snapshot();
    const result = state.result;
    const full = state.history.length >= fixtures.maxAttempts;
    text('phase', `Phase: ${state.phase}`);
    byId('settings').disabled = state.phase !== 'idle' || full;
    byId('process-batch').disabled = state.phase !== 'expanded';
    byId('verify-run').disabled = state.phase !== 'processed';
    byId('prediction-controls').disabled = state.phase !== 'verified';
    byId('new-attempt').disabled = state.phase !== 'checked' || full;
    text('consumer-metrics', state.config
      ? `Consumers: 1 → ${state.consumers.length} · ${state.consumers.join(', ')}`
      : 'Consumers: 1 (not expanded)');
    text('outcome', `Result: ${result ? result.verdict : 'not verified'}`);
    byId('outcome').dataset.verdict = result ? result.verdict : '';
    text('ownership-result', `Ownership: ${result ? result.ownership : 'not verified'}`);
    text('impact', result ? result.impact : 'No batch has been verified.');
    const metrics = result && result.metrics;
    text('ownership-metrics', metrics
      ? `Duplicate owner partitions: ${display(metrics.duplicateOwnerPartitions)} · invalid lock claims: ${display(metrics.invalidLockClaims)}`
      : 'Duplicate owner partitions: not checked · invalid lock claims: not checked');
    text('delivery-metrics', metrics
      ? `Deliveries: ${display(metrics.deliveryCount)} · repeated deliveries: ${display(metrics.deliveryDuplicates)}`
      : 'Deliveries: not observed · repeated deliveries: not checked');
    text('effect-metrics', metrics
      ? `Effects: ${display(metrics.effectCount)} · duplicate business effects: ${display(metrics.duplicateEffects)} · suppressed deliveries: ${display(metrics.suppressedDeliveries)}`
      : 'Effects: not observed · duplicate business effects: not checked · suppressed deliveries: not checked');
    text('coverage-metrics', metrics
      ? `Missing events: ${display(metrics.missingEvents)} · new-consumer event coverage: ${display(metrics.newConsumerEvents)}`
      : 'Missing events: not checked · new-consumer event coverage: not checked');
    text('event-totals', metrics
      ? `Events: attempted ${metrics.attemptedEvents} · success ${metrics.success} · failure ${metrics.failure} · unknown ${metrics.unknown}`
      : 'Events: six declared · not verified');
    rows('assignment-rows', fixtures.partitions.map((partition) => {
      const entry = state.assignments.find((assignment) => assignment.partition === partition);
      const claims = !entry ? 'consumer-0 · epoch 1 (initial reference only)'
        : entry.claims === null ? 'unobserved'
          : entry.claims.map((claim) => `${claim.consumer} · epoch ${claim.epoch} · ${claim.lock}`).join(' / ');
      const verdict = !result ? 'not verified' : entry.claims === null ? 'UNKNOWN'
        : entry.claims.length !== 1 || entry.claims.some((claim) => claim.epoch !== entry.expectedEpoch || claim.lock !== 'held') ? 'FAIL' : 'PASS';
      return [partition, claims, verdict];
    }));
    rows('event-rows', fixtures.events.map((event) => {
      const observed = result && result.events.find((entry) => entry.eventId === event.id);
      return [event.id, event.partition, observed ? display(observed.deliveries) : 'not checked',
        observed ? display(observed.effects) : 'not checked', observed ? `${observed.verdict} · ${observed.reason}` : 'not verified'];
    }));
    text('trace', state.trace.length ? state.trace.join('\n') : 'No attempt started.');
    text('prediction-result', state.prediction
      ? `Learning check: ${state.prediction.correct ? 'correct' : 'incorrect'} · predicted ${state.prediction.expected} · measured ${state.prediction.observed}`
      : 'Learning prediction not checked.');
    text('history-count', `Retained completed attempts: ${state.history.length} / ${fixtures.maxAttempts}`);
    text('totals', `Decided attempts: success ${state.totals.success} · failure ${state.totals.failure} · unknown ${state.totals.unknown}`);
    text('history-limit', full ? 'History full: six attempts retained. Reset all local data to begin again.' : '');
    rows('history-rows', state.history.map((attempt) => [
      attempt.attempt, Object.entries(attempt.config).map(([key, value]) => `${key}=${value}`).join(' · '),
      `${attempt.result.verdict} · ownership ${attempt.result.ownership}`,
      `${attempt.result.metrics.success}/${attempt.result.metrics.failure}/${attempt.result.metrics.unknown}`,
      attempt.prediction.correct ? 'correct' : 'incorrect',
    ]));
    text('retained-proof', state.history.length ? JSON.stringify(state.history, null, 2) : '');
  }
  function act(action, next) {
    clearError();
    try {
      action();
      render();
      byId(typeof next === 'function' ? next() : next).focus();
    } catch (error) { showError(error); }
  }
  byId('settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    act(() => lesson.expand(Object.fromEntries(Object.keys(fixtures.choices).map((key) => [key, byId(key).value]))), 'process-batch');
  });
  byId('process-batch').addEventListener('click', () => act(() => lesson.processBatch(), 'verify-run'));
  byId('verify-run').addEventListener('click', () => act(() => lesson.verify(), 'prediction'));
  byId('prediction-form').addEventListener('submit', (event) => {
    event.preventDefault();
    act(() => lesson.checkPrediction(byId('prediction').value),
      () => lesson.snapshot().history.length === fixtures.maxAttempts ? 'reset-lesson' : 'new-attempt');
  });
  function restoreForms() {
    byId('settings-form').reset();
    byId('prediction-form').reset();
    byId('retained-detail').open = false;
  }
  byId('new-attempt').addEventListener('click', () => act(() => { lesson.newAttempt(); restoreForms(); }, 'add-consumers'));
  byId('reset-lesson').addEventListener('click', () => act(() => { lesson.reset(); restoreForms(); }, 'add-consumers'));
  render();
  byId('main').dataset.ready = 'true';
}());
