'use strict';

(function app() {
  const fixtures = globalThis.S081Fixtures;
  const lesson = globalThis.S081Model.createLesson();
  const byId = (id) => document.getElementById(id);
  const set = (id, value) => { byId(id).textContent = value; };
  function table(id, rows) {
    const body = byId(id);
    body.replaceChildren(...rows.map((values) => {
      const row = document.createElement('tr');
      for (const value of values) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      }
      return row;
    }));
  }
  function clearError() {
    set('input-error', '');
    byId('input-error').hidden = true;
    document.querySelectorAll('[aria-invalid]').forEach((node) => node.removeAttribute('aria-invalid'));
  }
  function render(state) {
    set('phase', `Phase: ${state.phase}`);
    set('desired-state', `Desired: ${state.desired}`);
    set('observed-state', `Observed: ${state.observed}`);
    set('outcome', `Result: ${state.outcome}`);
    set('gate-counts', `Current gate checks: success ${state.gate.success} · failure ${state.gate.failure} · unknown ${state.gate.unknown}`);
    byId('settings').disabled = state.phase !== 'idle';
    byId('start-candidate').disabled = state.phase !== 'idle';
    byId('observe-state').disabled = state.phase !== 'awaiting';
    byId('request-next').disabled = state.phase !== 'advanced';
    byId('prediction').disabled = state.phase !== 'decided';
    byId('check-prediction').disabled = state.phase !== 'decided';
    byId('new-attempt').disabled = state.phase !== 'checked' || state.history.length >= fixtures.maxAttempts;
    const desiredRouting = state.gate.checks.find((entry) => entry.id === 'desired-routing');
    const effectiveRouting = state.gate.checks.find((entry) => entry.id === 'effective-routing');
    const show = (value) => value == null ? 'unknown' : String(value);
    set('routing-metrics', desiredRouting
      ? `Routing percent: desired ${show(desiredRouting.actual)} · effective ${show(effectiveRouting.actual)}`
      : 'Routing: not evaluated at current gate');
    table('gate-rows', state.gate.checks.map((entry) => [entry.label, show(entry.actual), entry.expected, entry.status]));
    table('trace-rows', state.trace.map((event) =>
      [event.sequence, event.action, event.desired, event.observed, event.gate.status, event.outcome]));
    const observedIndex = fixtures.states.indexOf(state.observed);
    byId('lifecycle').replaceChildren(...fixtures.states.map((target, index) => {
      const item = document.createElement('li');
      const observed = index <= observedIndex;
      const requested = target === state.desired && !observed;
      item.textContent = `${target}: ${observed ? 'observed' : requested ? 'requested, not observed' : 'not reached'}`;
      item.className = observed ? 'observed' : requested ? 'requested' : '';
      return item;
    }));
    set('current-proof', state.config ? JSON.stringify({
      deploymentId: fixtures.deploymentId, desiredEpoch: fixtures.desiredEpoch, legacyWarm: fixtures.legacyWarm,
      config: state.config, desired: state.desired, observed: state.observed, outcome: state.outcome,
      gate: state.gate, trace: state.trace,
    }, null, 2) : 'No attempt started.');
    set('prediction-result', state.prediction === null ? 'Learning prediction not checked.'
      : `Prediction ${state.prediction}: ${state.predictionCorrect ? 'correct' : 'incorrect'}; actual ${state.outcome}.`);
    const totals = state.totals;
    set('attempt-totals', `Retained attempts: ${totals.attempted} · success ${totals.success} · failure ${totals.failure} · unknown ${totals.unknown}`);
    set('history-count', `Retained complete traces: ${state.history.length} / ${fixtures.maxAttempts}`);
    table('history-rows', state.history.map((attempt) => [
      attempt.attempt, attempt.outcome, `${attempt.desired} / ${attempt.observed}`, attempt.prediction,
      attempt.predictionCorrect ? 'correct' : 'incorrect', attempt.trace.length,
    ]));
    set('retained-proof', state.history.length ? JSON.stringify(state.history, null, 2) : '');
  }
  function resetForms() {
    for (const id of ['settings-form', 'prediction-form']) HTMLFormElement.prototype.reset.call(byId(id));
    for (const [id, value] of Object.entries(fixtures.defaults)) byId(id).value = value;
    byId('prediction').value = '';
    byId('current-detail').open = false;
    byId('retained-detail').open = false;
  }
  function act(action, focus, reset = false) {
    try {
      const state = action();
      clearError();
      if (reset) resetForms();
      render(state);
      if (focus) byId(typeof focus === 'function' ? focus(state) : focus).focus();
    } catch (error) {
      clearError();
      set('input-error', error.message);
      byId('input-error').hidden = false;
      const field = error.field && byId(error.field);
      if (field) {
        field.setAttribute('aria-invalid', 'true');
        field.focus();
      } else byId('input-error').focus();
    }
  }
  for (const id of ['settings-form', 'prediction-form']) {
    byId(id).addEventListener('submit', (event) => event.preventDefault());
  }
  byId('settings').addEventListener('change', clearError);
  byId('prediction').addEventListener('change', clearError);
  byId('start-candidate').addEventListener('click', () => act(() =>
    lesson.start(Object.fromEntries(Object.keys(fixtures.choices).map((id) => [id, byId(id).value]))), 'observe-state'));
  byId('request-next').addEventListener('click', () => act(() => lesson.requestNext(), 'observe-state'));
  byId('observe-state').addEventListener('click', () => act(() => lesson.observe(),
    (state) => state.phase === 'advanced' ? 'request-next' : 'prediction'));
  byId('check-prediction').addEventListener('click', () => act(() => lesson.retain(byId('prediction').value),
    (state) => state.history.length < fixtures.maxAttempts ? 'new-attempt' : 'reset-lesson'));
  byId('new-attempt').addEventListener('click', () => act(() => lesson.newAttempt(), 'start-candidate', true));
  byId('reset-lesson').addEventListener('click', () => act(() => lesson.reset(), 'start-candidate', true));
  render(lesson.snapshot());
  byId('main').dataset.ready = 'true';
})();
