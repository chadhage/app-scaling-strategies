(function () {
  'use strict';
  const model = globalThis.S050;
  const byId = (id) => document.getElementById(id);
  const fields = Object.keys(model.DEFAULTS);
  let state = model.createState();
  function text(id, value) { byId(id).textContent = String(value); }
  function rows(id, values) {
    const nodes = values.map((valuesInRow) => {
      const row = document.createElement('tr');
      for (const value of valuesInRow) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      }
      return row;
    });
    byId(id).replaceChildren(...nodes);
  }
  function list(id, values, placeholder) {
    byId(id).replaceChildren(...(values.length ? values : [placeholder]).map((value) => {
      const item = document.createElement('li');
      item.textContent = value;
      return item;
    }));
  }
  function clearError() {
    byId('input-error').hidden = true;
    text('input-error', '');
  }
  function render() {
    const reviewed = state.phase === 'reviewed';
    for (const key of fields) byId(key).value = state.config[key];
    byId('config-fields').disabled = state.phase !== 'ready';
    byId('route').disabled = state.phase !== 'ready';
    byId('resolve').disabled = state.phase !== 'routed';
    byId('retire').disabled = state.phase !== 'resolved';
    byId('next-attempt').disabled = !reviewed || state.history.length >= model.MAX_ATTEMPTS;
    byId('prediction').disabled = !reviewed || Boolean(state.prediction);
    byId('check-prediction').disabled = !reviewed || Boolean(state.prediction);
    byId('prediction').value = state.prediction ? state.prediction.choice : '';
    text('phase', `Phase: ${state.phase}`);
    text('route-target', state.newAdmissions);
    text('old-status', state.oldDestination);
    text('dependency-count', state.dependencies.required);
    text('unverified-count', state.dependencies.unknown);
    rows('dependencies', state.dependencies.rows.map((row) => [row.kind, row.client, row.status]));
    rows('clients', state.clients.map((row) => [row.id, row.destination, row.status]));
    for (const [key, value] of Object.entries(state.metrics)) text(key, value);
    text('outcome', state.result ? `Synthetic outcome: ${state.result.outcome}` : 'Not evaluated.');
    text('reason', state.result ? state.result.reason : 'No retirement decision yet.');
    text('user-impact', state.result ? state.result.userImpact : 'not evaluated');
    text('cleanup', state.result ? state.result.cleanup : 'old destination retained');
    text('prediction-result', state.prediction
      ? `Prediction verifier: ${state.prediction.correct ? 'PASS' : 'FAIL'}. Recorded user outcome remains ${state.result.outcome}.`
      : 'Prediction not checked.');
    list('trace', state.trace.map((row) =>
      `${row.step}. ${row.action}: ${row.message} [required=${row.required}; unknown=${row.unknown}; old=${row.oldDestination}]`),
    'No attempt started.');
    list('history', state.history.map((result) =>
      `Attempt ${result.attempt}: ${result.outcome}; attempted ${result.metrics.attempted}, completed ${result.metrics.completed}, interrupted ${result.metrics.interrupted}, unknown ${result.metrics.unknown}, still required ${result.metrics.required}; ${result.cleanup}. ${result.reason}`),
    'No completed attempts.');
    text('history-limit', `${state.history.length} of ${model.MAX_ATTEMPTS} results retained. ${
      state.history.length === model.MAX_ATTEMPTS ? 'Limit reached; reset explicitly. No result was pruned.' :
        'Only explicit reset or page reload clears this in-memory history.'}`);
  }
  function commit(makeState, focus) {
    try {
      const next = makeState();
      state = next;
      clearError();
      render();
      if (focus && !byId(focus).disabled) byId(focus).focus();
    } catch (error) {
      text('input-error', error.message);
      byId('input-error').hidden = false;
      byId('input-error').focus();
    }
  }
  byId('configuration').addEventListener('submit', (event) => {
    event.preventDefault();
    commit(() => {
      const config = Object.fromEntries(fields.map((key) => [key, byId(key).value]));
      return model.step(model.configure(state, config), 'route');
    }, 'resolve');
  });
  byId('resolve').addEventListener('click', () => commit(() => model.step(state, 'resolve'), 'retire'));
  byId('retire').addEventListener('click', () => commit(() => model.step(state, 'retire'), 'prediction'));
  byId('prediction-form').addEventListener('submit', (event) => {
    event.preventDefault();
    commit(() => model.checkPrediction(state, byId('prediction').value), 'next-attempt');
  });
  byId('next-attempt').addEventListener('click', () => commit(() => model.nextAttempt(state), 'connection'));
  byId('reset-rehearsal').addEventListener('click', () => commit(() => model.reset(state), 'connection'));
  render();
}());
