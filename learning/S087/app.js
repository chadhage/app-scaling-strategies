(function () {
  'use strict';
  const fixtures = globalThis.S087Fixtures;
  const lesson = globalThis.S087Model.createLesson();
  const byId = (id) => document.getElementById(id);
  const text = (id, value) => { byId(id).textContent = value; };
  function rows(id, values) {
    byId(id).replaceChildren(...values.map((cells) => {
      const row = document.createElement('tr');
      for (const value of cells) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      }
      return row;
    }));
  }
  function clearError() {
    byId('input-error').hidden = true;
    text('input-error', '');
    for (const node of document.querySelectorAll('[aria-invalid]')) node.removeAttribute('aria-invalid');
  }
  function resetForms() {
    for (const id of ['settings-form', 'prediction-form']) HTMLFormElement.prototype.reset.call(byId(id));
    for (const id of ['current-detail', 'history-detail']) byId(id).open = false;
  }
  function render(state) {
    const current = state.current;
    const report = current?.observation;
    const complete = state.phase === 'complete';
    const limit = state.history.length >= fixtures.historyLimit;
    byId('settings').disabled = state.phase !== 'idle' || limit;
    byId('request-change').disabled = state.phase !== 'idle' || limit;
    byId('observe-routes').disabled = state.phase !== 'requested';
    byId('release-old').disabled = state.phase !== 'observed';
    byId('prediction-settings').disabled = !complete || Boolean(current.prediction);
    byId('new-attempt').disabled = !complete || limit;
    text('phase', `Phase: ${state.phase}`);
    text('desired', `Desired new-v2: ${current ? `${current.desiredPercent}%` : 'not requested'}`);
    text('effective', `Effective new-v2: ${report
      ? report.effectivePercent === null ? `UNKNOWN (${report.knownNew} known new / 8; ${report.unknownRoutes} unresolved)`
        : `${report.effectivePercent}%` : 'not observed'}`);
    text('convergence', `Convergence: ${report?.convergence || 'NOT_DECIDED'}`);
    text('outcome', `Result: ${current?.outcome || 'NOT_DECIDED'}`);
    const journeys = report?.journeys || { success: 0, failure: 0, unknown: 0 };
    text('journeys', `Journeys: success ${journeys.success} · failure ${journeys.failure} · unknown ${journeys.unknown}`);
    text('migration', `Intended migrations observed: ${report?.migratedIntended || 0} / ${report?.intended || 0}`);
    text('retention', `Old release: ${current?.retention || 'NOT_CHECKED'}`);
    text('old-status', `Old capacity: ${current ? current.oldAvailable ? 'available (synthetic)' : 'unavailable (synthetic)' : 'not evaluated'}`);
    text('gate-reason', current?.retentionReason || 'Observe routing before a release decision.');
    text('prediction-result', current?.prediction
      ? `Learning prediction: ${current.prediction.verdict}. User-impact result remains ${current.outcome}.`
      : 'Learning prediction not checked.');
    rows('client-rows', (report?.clients || []).map((client) => [
      client.id, client.desired, client.route || 'UNKNOWN', client.destination || 'UNKNOWN', client.journey, client.reason,
    ]));
    rows('trace-rows', (current?.trace || []).map((event) => [event.step, event.event, event.detail]));
    rows('history-rows', state.history.map((attempt) => [
      attempt.id, `${attempt.desiredPercent}%`, `${attempt.config.propagation} / ${attempt.config.old}`,
      attempt.outcome, `${attempt.observation.journeys.success}/${attempt.observation.journeys.failure}/${attempt.observation.journeys.unknown}`,
      attempt.retention, attempt.prediction?.verdict || 'not checked',
    ]));
    text('current-proof', current ? JSON.stringify(current, null, 2) : 'No attempt started.');
    text('history-proof', state.history.length ? JSON.stringify(state.history, null, 2) : '');
    const totals = state.totals;
    text('totals', `Attempted: ${totals.attempted} · completed ${totals.completed} · active ${totals.active}`
      + ` · success ${totals.success} · failure ${totals.failure} · unknown ${totals.unknown}`);
    text('history-count', `Retained complete traces: ${state.history.length} / ${fixtures.historyLimit}`);
  }
  function run(action, focus) {
    try {
      const state = action();
      clearError();
      render(state);
      const next = typeof focus === 'function' ? focus(state) : focus;
      if (next) byId(next).focus();
    } catch (error) {
      text('input-error', error.message);
      byId('input-error').hidden = false;
      const field = ['target', 'propagation', 'old', 'prediction'].includes(error.field) ? byId(error.field) : null;
      if (field && !field.disabled && !field.closest('fieldset')?.disabled) {
        field.setAttribute('aria-invalid', 'true');
        field.focus();
      } else byId('input-error').focus();
    }
  }
  byId('settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    run(() => lesson.request(Object.fromEntries(Object.keys(fixtures.defaults).map((id) => [id, byId(id).value]))), 'observe-routes');
  });
  byId('observe-routes').addEventListener('click', () => run(() => lesson.observe(), 'release-old'));
  byId('release-old').addEventListener('click', () => run(() => lesson.releaseOld(), 'prediction'));
  byId('prediction-form').addEventListener('submit', (event) => {
    event.preventDefault();
    run(() => lesson.predict(byId('prediction').value), (state) => state.history.length >= fixtures.historyLimit ? 'reset-lesson' : 'new-attempt');
  });
  byId('new-attempt').addEventListener('click', () => run(() => {
    const state = lesson.newAttempt();
    resetForms();
    return state;
  }, 'request-change'));
  byId('reset-lesson').addEventListener('click', () => run(() => {
    const state = lesson.reset();
    resetForms();
    return state;
  }, 'request-change'));
  render(lesson.snapshot());
  byId('main').dataset.ready = 'true';
}());
