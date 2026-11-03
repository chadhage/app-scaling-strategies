(function () {
  'use strict';
  const model = globalThis.S046;
  const byId = (id) => document.getElementById(id);
  const form = byId('rehearsal-form');
  const controls = {
    cursor: byId('cursor'), scenario: byId('scenario'), replayPolicy: byId('replay-policy'),
    reconnectMs: byId('reconnect-ms'), budgetMs: byId('budget-ms'),
  };
  let state = model.create();
  const readInput = () => Object.fromEntries(Object.entries(controls).map(([field, control]) => [field, control.value]));
  const time = (value) => value === null ? 'unverified' : String(value);

  function clearError() {
    byId('input-error').hidden = true;
    byId('input-error').textContent = '';
    Object.values(controls).forEach((control) => control.removeAttribute('aria-invalid'));
    byId('prediction').removeAttribute('aria-invalid');
  }

  function showError(error) {
    byId('input-error').textContent = error.message;
    byId('input-error').hidden = false;
    const control = controls[error.field] || (error.field === 'prediction' ? byId('prediction') : null);
    if (control) {
      control.setAttribute('aria-invalid', 'true');
      control.focus();
    }
  }

  function cell(row, value) {
    const element = document.createElement('td');
    element.textContent = String(value);
    row.append(element);
  }

  function render() {
    const complete = state.phase === 'complete';
    byId('phase').textContent = `Phase: ${state.phase}`;
    byId('configuration').disabled = state.phase !== 'idle';
    byId('start-stream').disabled = state.phase !== 'idle' || state.history.length >= model.MAX_ATTEMPTS;
    byId('cut-over').disabled = state.phase !== 'streaming';
    byId('resume-stream').disabled = state.phase !== 'disconnected';
    byId('new-attempt').disabled = !complete || state.history.length >= model.MAX_ATTEMPTS;
    byId('prediction').disabled = !complete;
    byId('check-prediction').disabled = !complete;
    byId('result-detail').hidden = !complete;
    byId('impact').textContent = complete ? `${state.result.impact} — ${state.result.outcome}.`
      : 'Not evaluated — no completed attempt.';
    byId('trace').textContent = state.trace.length ? state.trace.map((event) =>
      `${event.atMs >= 0 ? '+' : ''}${event.atMs} ms | ${event.kind} | ${event.detail}`).join('\n') : 'No attempt started.';
    byId('checks').replaceChildren();
    byId('evidence-status').textContent = '';
    byId('metrics').textContent = '';
    byId('visible-events').textContent = '';
    if (complete) {
      const result = state.result;
      byId('evidence-status').textContent = `Evidence checks: ${result.outcome === 'success' ? 'PASS' : result.outcome === 'failure' ? 'FAIL' : 'UNKNOWN'}. Stream-open alone is not the verdict.`;
      byId('metrics').textContent = `Last-Event-ID: ${result.requestCursor || 'omitted (tail only)'} · `
        + `first visible gap: ${time(result.firstVisibleGapMs)} ms · recovery: ${time(result.recoveryMs)} ms · `
        + `original budget: ${result.configuration.budgetMs} ms · wire replays: ${result.wireReplays} · suppressed: ${result.suppressedReplays}.`;
      byId('visible-events').textContent = `Visible event IDs: ${result.visibleIds.join(' → ')}`;
      result.checks.forEach((check) => {
        const row = document.createElement('tr');
        row.dataset.check = check.id;
        row.dataset.status = check.status;
        [check.id, check.status, check.detail].forEach((value) => cell(row, value));
        byId('checks').append(row);
      });
    }
    const totals = model.totals(state);
    byId('totals').textContent = `Attempted: ${totals.attempted} · success: ${totals.success} · failure: ${totals.failure} · unknown: ${totals.unknown}`;
    byId('history').replaceChildren();
    if (!state.history.length) {
      const row = document.createElement('tr');
      cell(row, 'No completed attempts.');
      row.firstElementChild.colSpan = 5;
      byId('history').append(row);
    } else {
      state.history.forEach(({ attempt, result }) => {
        const row = document.createElement('tr');
        row.dataset.attempt = String(attempt);
        [
          attempt, `${result.configuration.cursor} / ${result.configuration.scenario}`,
          result.streamOpen ? 'open' : 'rejected', `${result.outcome} — ${result.impact}`,
          `${time(result.firstVisibleGapMs)} / ${time(result.recoveryMs)} / ${result.configuration.budgetMs}`,
        ].forEach((value) => cell(row, value));
        byId('history').append(row);
      });
    }
  }

  function requireUnchangedInput() {
    if (state.input) {
      const current = readInput();
      const changed = Object.keys(controls).find((field) => current[field] !== state.input[field]);
      if (changed) {
        const error = new Error('Configuration is locked; restore it or explicitly reset before changing an active attempt.');
        error.field = changed;
        throw error;
      }
    }
  }

  function act(action, nextFocus, guardInput) {
    clearError();
    try {
      if (guardInput) requireUnchangedInput();
      state = action();
      byId('prediction').value = '';
      byId('prediction-result').textContent = 'Prediction not checked.';
      render();
      if (nextFocus) byId(nextFocus).focus();
    } catch (error) {
      showError(error);
    }
  }

  byId('start-stream').addEventListener('click', () =>
    act(() => model.start(state, readInput()), 'cut-over'));
  byId('cut-over').addEventListener('click', () =>
    act(() => model.cutOver(state), 'resume-stream', true));
  byId('resume-stream').addEventListener('click', () =>
    act(() => model.resume(state), 'prediction', true));
  byId('new-attempt').addEventListener('click', () =>
    act(() => model.another(state), 'start-stream'));
  byId('reset-rehearsal').addEventListener('click', () => act(() => {
    const next = model.reset(state);
    form.reset();
    return next;
  }, 'start-stream'));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    act(() => model.start(state, readInput()), 'cut-over');
  });
  byId('check-prediction').addEventListener('click', () => {
    clearError();
    try {
      if (state.phase !== 'complete') throw new Error('Prediction requires a completed attempt.');
      const prediction = byId('prediction').value;
      if (!['success', 'failure', 'unknown'].includes(prediction)) {
        const error = new Error('Choose a declared prediction: success, failure or unknown.');
        error.field = 'prediction';
        throw error;
      }
      byId('prediction-result').textContent = `Prediction verifier: ${prediction === state.result.outcome ? 'PASS' : 'FAIL'}. `
        + `User outcome remains ${state.result.outcome}: ${state.result.impact}.`;
    } catch (error) {
      showError(error);
    }
  });
  render();
}());
