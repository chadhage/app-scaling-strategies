(function () {
  'use strict';
  const model = globalThis.S067Model;
  const fixture = globalThis.S067Fixture;
  const byId = (id) => document.getElementById(id);
  const fieldIds = Object.keys(fixture.defaults);
  const inputs = byId('lag-controls');
  const predictions = byId('prediction-controls');
  let state = model.initial();

  function text(id, value) { byId(id).textContent = value; }
  function known(value) { return value === null ? 'unknown' : String(value); }
  function tableRow(values) {
    const row = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.append(cell);
    }
    return row;
  }
  function readSettings() {
    return Object.fromEntries(fieldIds.map((id) => [id, byId(id).value]));
  }
  function requireFrozenSettings() {
    const settings = model.configuration(readSettings());
    const changed = fieldIds.find((id) => settings[id] !== state.config[id]);
    if (changed) {
      throw new model.GuardError('FROZEN_INPUT', 'Frozen inputs changed. Start a new attempt or reset.', changed);
    }
  }
  function clearError() {
    byId('input-error').hidden = true;
    text('input-error', '');
    for (const control of [...fieldIds, 'prediction']) byId(control).removeAttribute('aria-invalid');
  }
  function showError(error) {
    const guarded = error instanceof model.GuardError;
    text('input-error', guarded ? error.message : 'Rehearsal error. Reset before trying again.');
    byId('input-error').hidden = false;
    const field = guarded && error.field ? byId(error.field) : null;
    if (field) field.setAttribute('aria-invalid', 'true');
    (field && !field.disabled && !field.closest('fieldset[disabled]') ? field : byId('input-error')).focus();
  }
  function resetInputs() {
    inputs.reset();
    predictions.reset();
    for (const [id, value] of Object.entries(fixture.defaults)) {
      byId(id).value = value;
      byId(id).disabled = false;
    }
    byId('prediction').value = '';
  }
  function render() {
    text('phase', `Phase: ${state.phase}`);
    text('attempt-count', `Attempt: ${state.attempt} / ${fixture.maximumAttempts}`);
    const configuring = state.phase === 'configuring';
    byId('assumptions').disabled = !configuring;
    for (const id of fieldIds) byId(id).disabled = !configuring;
    byId('introduce-lag').disabled = !configuring;
    byId('read-once').disabled = state.phase !== 'lagged';
    byId('prediction').disabled = state.phase !== 'observed';
    byId('check-prediction').disabled = state.phase !== 'observed';
    byId('new-attempt').disabled = state.phase !== 'checked'
      || state.history.length >= fixture.maximumAttempts;

    const lag = state.lagObservation;
    text('lag-observation', lag
      ? `Reader-1 watermark: ${known(lag.readerVersion)} · tick ${known(lag.readerTick)} · observed lag: ${known(lag.lagTicks)} synthetic ticks.`
      : 'Reader watermark and lag: not introduced.');
    text('freshness-declaration', lag
      ? `Declared freshness: at most ${lag.budgetTicks} ticks · minimum version ${fixture.primaryVersion - lag.budgetTicks}.`
      : 'Declared freshness: not frozen.');
    const result = state.result;
    text('gate', result ? `Read freshness: ${result.gate}` : 'Read freshness: not evaluated');
    text('impact', result ? `Synthetic impact: ${result.impact}` : 'Synthetic impact: not evaluated');
    byId('gate').dataset.gate = result ? result.gate : '';
    text('metrics', result
      ? `One read: ${result.correct} correct · ${result.failed} failed · ${result.unknown} unknown.`
      : 'No returned read evaluated.');
    byId('result-detail').hidden = !result;
    text('route-reason', result ? `${result.routingReason} ${result.code}.` : '');
    byId('read-results').replaceChildren(...(result ? [tableRow([
      result.selectedReader, result.requiredVersion, known(result.receivedVersion),
      known(result.observedLagTicks), result.budgetTicks, result.gate,
    ])] : []));
    byId('trace').replaceChildren(...(state.trace.length ? state.trace : ['No attempt started.']).map((message) => {
      const item = document.createElement('li');
      item.textContent = message;
      return item;
    }));
    text('prediction-result', state.prediction
      ? `Learning check: ${state.prediction.matched ? 'MATCH' : 'MISMATCH'} · predicted ${state.prediction.predicted}; actual ${result.gate} / ${result.impact}.`
      : 'Prediction not checked.');
    text('history-count', `Retained attempts: ${state.history.length} / ${fixture.maximumAttempts}`);
    byId('history').replaceChildren(...state.history.map((entry) => tableRow([
      entry.attempt, known(entry.lagObservation.lagTicks), entry.lagObservation.budgetTicks,
      entry.config.routing, entry.result.selectedReader,
      `${known(entry.result.receivedVersion)} / ${entry.result.requiredVersion}`,
      `${entry.result.gate} / ${entry.result.impact}`,
      `${entry.predicted} / ${entry.matched ? 'MATCH' : 'MISMATCH'}`,
    ])));
  }
  function act(transition, focus) {
    try {
      const nextState = transition();
      state = nextState;
      clearError();
      render();
      byId(typeof focus === 'function' ? focus() : focus).focus();
    } catch (error) {
      showError(error);
    }
  }
  inputs.addEventListener('submit', (event) => {
    event.preventDefault();
    act(() => model.introduceLag(state, readSettings()), 'read-once');
  });
  byId('read-once').addEventListener('click', () => act(() => {
    if (state.phase === 'lagged') requireFrozenSettings();
    return model.read(state);
  }, 'prediction'));
  predictions.addEventListener('submit', (event) => {
    event.preventDefault();
    act(() => {
      if (state.phase === 'observed') requireFrozenSettings();
      return model.check(state, byId('prediction').value);
    }, () => state.history.length < fixture.maximumAttempts ? 'new-attempt' : 'reset-rehearsal');
  });
  byId('new-attempt').addEventListener('click', () => act(() => {
    const nextState = model.next(state);
    resetInputs();
    return nextState;
  }, 'introduce-lag'));
  byId('reset-rehearsal').addEventListener('click', () => act(() => {
    const nextState = model.reset();
    resetInputs();
    return nextState;
  }, 'introduce-lag'));
  render();
}());
