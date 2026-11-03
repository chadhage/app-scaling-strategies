(function () {
  'use strict';
  const model = globalThis.IndexBuildLesson;
  const fixture = globalThis.IndexBuildFixture;
  const byId = (id) => document.getElementById(id);
  const form = byId('build-form');
  const controls = {
    operation: byId('operation'), capability: byId('capability'),
    budgetMs: byId('budget-ms'), guard: byId('guard-policy'), coverage: byId('coverage'),
  };
  const prediction = byId('prediction');
  let state = model.createState();
  function readConfiguration() {
    return Object.fromEntries(Object.entries(controls).map(([key, control]) => [key, control.value]));
  }
  function clearError() {
    byId('error').hidden = true;
    byId('error').textContent = '';
    [...Object.values(controls), prediction].forEach((control) => control.removeAttribute('aria-invalid'));
  }
  function showError(error) {
    const control = error.field === 'prediction' ? prediction : controls[error.field];
    byId('error').textContent = error.message;
    byId('error').hidden = false;
    if (control) {
      control.setAttribute('aria-invalid', 'true');
      (control.disabled ? byId('reset-rehearsal') : control).focus();
    } else byId('reset-rehearsal').focus();
  }
  function frozenConfigurationGuard() {
    if (!state.config) return;
    for (const [field, control] of Object.entries(controls)) {
      if (control.value !== state.config[field]) {
        const error = new Error('Configuration changed after assessment. Reset, or finish and start a new attempt.');
        error.field = field;
        throw error;
      }
    }
  }
  function line(text) {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }
  function render() {
    const configuring = state.phase === 'configure';
    Object.values(controls).forEach((control) => { control.disabled = !configuring; });
    byId('assess-build').disabled = !configuring;
    byId('run-load').disabled = state.phase !== 'ready';
    prediction.disabled = !['observed', 'terminal'].includes(state.phase);
    byId('check-outcome').disabled = prediction.disabled;
    byId('new-attempt').disabled = state.phase !== 'checked';
    byId('status').textContent = state.history.length >= fixture.historyLimit && configuring
      ? 'Six attempts retained. Reset before assessing another build.'
      : `Attempt ${state.attempt} of ${fixture.historyLimit} · phase ${state.phase}.`;
    byId('plan').textContent = state.plan
      ? `Plan ${state.plan.disposition} · predicted peak latency: ${state.plan.predictedMaxLatencyMs === null
        ? 'unverified' : `${state.plan.predictedMaxLatencyMs} synthetic ms (not measured)`}. ${state.plan.reason}`
      : 'No build assessed. No measurements.';
    byId('result').textContent = state.result
      ? `${state.result.verdict} / ${state.result.impact}` : 'No result yet.';
    byId('reason').textContent = state.result
      ? state.result.reason : 'A zero-request plan is never a successful load observation.';
    const metrics = state.result?.metrics;
    for (const field of ['attempted', 'observed', 'failed', 'unknown']) {
      byId(field).textContent = String(metrics?.[field] ?? 0);
    }
    byId('max-latency').textContent = String(metrics?.maxLatencyMs ?? 'Not observed');
    byId('max-lock').textContent = String(metrics?.maxLockWaitMs ?? 'Not observed');
    byId('receipts').replaceChildren(...(state.result?.receipts || []).map((receipt) => {
      const row = document.createElement('tr');
      for (const value of [receipt.id, receipt.lockWaitMs ?? 'Unknown', receipt.latencyMs ?? 'Unknown',
        receipt.withinBudget === null ? 'UNKNOWN' : receipt.withinBudget ? 'WITHIN' : 'OVER BUDGET']) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      }
      return row;
    }));
    const trace = [];
    if (state.config) {
      trace.push(`Configured ${state.config.operation}; synthetic online capability ${state.config.capability}; budget ${state.config.budgetMs} synthetic ms; guard ${state.config.guard}.`);
      trace.push(state.plan.reason);
      if (state.result) {
        trace.push(`Actual synthetic result ${state.result.verdict}; impact ${state.result.impact}; ${metrics.observed}/${metrics.attempted} receipts; ${metrics.failed} failures; ${metrics.unknown} unknown.`);
      }
    }
    byId('trace').replaceChildren(...trace.map(line));
    byId('feedback').textContent = state.feedback
      ? `${state.feedback.matches ? 'Prediction matches' : 'Prediction mismatch'}: predicted ${state.feedback.prediction}; actual ${state.feedback.actual}. Actual user impact is unchanged.`
      : 'Prediction does not change the actual outcome.';
    byId('history').replaceChildren(...state.history.map((item) => line(
      `Attempt ${item.attempt}: ${item.config.operation}, capability ${item.config.capability}, budget ${item.config.budgetMs}, guard ${item.config.guard}, receipts ${item.config.coverage} · ${item.result.verdict} / ${item.result.impact} · observed ${item.result.metrics.observed}/${item.result.metrics.attempted}, failed ${item.result.metrics.failed}, unknown ${item.result.metrics.unknown}, max latency ${item.result.metrics.maxLatencyMs ?? 'unobserved'}, max lock ${item.result.metrics.maxLockWaitMs ?? 'unobserved'} synthetic ms · predicted ${item.prediction} (${item.matches ? 'match' : 'mismatch'}).`,
    )));
  }
  function act(transition, focusId) {
    clearError();
    try {
      frozenConfigurationGuard();
      state = transition(state);
      render();
      byId(typeof focusId === 'function' ? focusId() : focusId).focus();
    } catch (error) {
      showError(error);
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    act((current) => model.assessBuild(current, readConfiguration()),
      () => state.phase === 'ready' ? 'run-load' : 'prediction');
  });
  byId('run-load').addEventListener('click', () => act(model.runLoad, 'prediction'));
  byId('check-outcome').addEventListener('click', () => act(
    (current) => model.checkPrediction(current, prediction.value), 'new-attempt',
  ));
  byId('new-attempt').addEventListener('click', () => {
    clearError();
    try {
      state = model.newAttempt(state);
      form.reset();
      prediction.value = '';
      render();
      byId('assess-build').focus();
    } catch (error) {
      showError(error);
    }
  });
  byId('reset-rehearsal').addEventListener('click', () => {
    state = model.createState();
    form.reset();
    prediction.value = '';
    clearError();
    render();
    byId('assess-build').focus();
  });
  render();
}());
