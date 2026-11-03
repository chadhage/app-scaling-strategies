(function () {
  'use strict';
  const model = globalThis.S071Model;
  const fixture = globalThis.S071Fixture;
  const byId = (id) => document.getElementById(id);
  const configForm = byId('cache-controls');
  const predictionForm = byId('prediction-controls');
  const fields = {
    targetCapacity: byId('target-capacity'), payloadMode: byId('payload-mode'),
    resizeMode: byId('resize-mode'), coverage: byId('coverage'), budgetMs: byId('budget-ms'),
  };
  let state = model.createRehearsal();
  const text = (id, value) => { byId(id).textContent = value; };
  function clearError() {
    text('input-error', '');
    byId('input-error').hidden = true;
    document.querySelectorAll('[aria-invalid]').forEach((element) => element.removeAttribute('aria-invalid'));
  }
  function guarded(action) {
    clearError();
    try { action(); } catch (error) {
      if (!(error instanceof model.GuardError)) throw error;
      text('input-error', error.message);
      byId('input-error').hidden = false;
      const field = fields[error.field] || (error.field === 'prediction' ? byId('prediction') : null);
      if (field && !field.disabled) {
        field.setAttribute('aria-invalid', 'true');
        field.focus();
      } else byId('input-error').focus();
    }
  }
  function integer(field, value) {
    if (!/^(?:0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value))) {
      throw new model.GuardError('Use a whole-number listed capacity or journey budget.', field);
    }
    return Number(value);
  }
  function input() {
    return {
      targetCapacity: integer('targetCapacity', fields.targetCapacity.value),
      payloadMode: fields.payloadMode.value, resizeMode: fields.resizeMode.value,
      coverage: fields.coverage.value, budgetMs: integer('budgetMs', fields.budgetMs.value),
    };
  }
  function appendRow(target, values) {
    const row = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.append(cell);
    }
    target.append(row);
  }
  function render() {
    const configuring = state.phase === 'configuring';
    const observed = state.phase === 'observed';
    for (const field of Object.values(fields)) field.disabled = !configuring;
    byId('resize-cache').disabled = !configuring;
    byId('probe-mixed').disabled = state.phase !== 'resized';
    byId('prediction').disabled = !observed;
    byId('check-prediction').disabled = !observed;
    byId('new-attempt').disabled = !observed || state.history.length >= fixture.MAX_ATTEMPTS;
    text('phase', `Phase: ${state.phase}`);
    text('attempt-count', `Attempt: ${state.attempt} / ${fixture.MAX_ATTEMPTS}`);
    text('history-count', `Retained attempts: ${state.history.length} / ${fixture.MAX_ATTEMPTS}`);
    const operation = state.operation;
    text('resize-observation', operation
      ? `Resize: ${operation.status}. Requested ${operation.baselineCapacity} → ${operation.requestedCapacity}; applied target: ${operation.appliedCapacity ?? 'not observed'}. ${operation.description}`
      : 'No resize requested.');
    byId('result-detail').hidden = !observed;
    byId('probe-results').replaceChildren();
    byId('reasons').replaceChildren();
    if (observed) {
      const result = state.result;
      const metrics = result.metrics;
      const comparison = result.comparison;
      text('gate', `Synthetic journey result: ${result.gate}`);
      text('impact', result.gate === 'PASS'
        ? 'User impact: all 18 modeled operations valid; no native guarantee.'
        : result.gate === 'FAIL'
          ? 'User impact: known failed or unsupported synthetic journeys; later capacity cannot erase them.'
          : 'User impact: unknown; missing observations or unverified capability prevent a success claim.');
      const ms = (value) => value === null ? 'not observed' : `${value} ms`;
      text('comparison', `Modeled worst latency: ${ms(comparison.beforeWorstMs)} before → ${ms(comparison.afterWorstMs)} after. Incompatible observed reads: ${comparison.beforePayloadFailures} before / ${comparison.afterPayloadFailures} after. Missing reads are not compatibility proof.`);
      text('metrics', `Observed ${metrics.observed}/${metrics.expected}; passed ${metrics.succeeded}; failed ${metrics.failed}; missing ${metrics.missing}. Payload failures ${metrics.payloadFailures}; access failures ${metrics.accessFailures}; original-budget failures ${metrics.budgetFailures}.`);
      for (const reason of result.reasons) {
        const item = document.createElement('li');
        item.textContent = reason;
        byId('reasons').append(item);
      }
      for (const row of result.rows) appendRow(byId('probe-results'), [
        row.phase, row.operation, `${row.client} / ${row.writer}`, row.capacity,
        `${row.latencyMs} / ${row.budgetMs}`, `${row.accessStatus} / ${row.payloadStatus}`, row.outcome,
        row.reasons.length ? row.reasons.join(' ') : row.payloadJSON,
      ]);
      text('trace', result.trace.join('\n'));
    } else {
      text('gate', 'Synthetic journey result: not evaluated');
      text('impact', 'User impact: not evaluated');
      text('comparison', 'Capacity and payload comparison: not observed.');
      text('metrics', 'No synthetic operations observed.');
      text('trace', operation ? operation.description : 'No attempt started.');
    }
    byId('history').replaceChildren();
    for (const record of state.history) appendRow(byId('history'), [
      record.attempt, `${record.operation.baselineCapacity} → ${record.operation.requestedCapacity} (${record.operation.status})`,
      `${record.config.payloadMode} / ${record.config.resizeMode} / ${record.config.coverage}`,
      `${record.config.budgetMs} ms`, record.result.gate,
      `${record.result.metrics.observed} / ${record.result.metrics.failed} / ${record.result.metrics.missing}`,
    ]);
  }
  function clearAttemptView() {
    configForm.reset();
    predictionForm.reset();
    text('prediction-result', 'Prediction not checked.');
    clearError();
    render();
    byId('resize-cache').focus();
  }
  configForm.addEventListener('submit', (event) => {
    event.preventDefault();
    guarded(() => {
      state = model.resizeCache(state, input());
      render();
      byId('probe-mixed').focus();
    });
  });
  byId('probe-mixed').addEventListener('click', () => guarded(() => {
    state = model.probeMixedTraffic(state);
    render();
    byId('prediction').focus();
  }));
  predictionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    guarded(() => {
      text('prediction-result', 'Prediction not checked.');
      if (state.phase !== 'observed') throw new model.GuardError('Probe mixed traffic before checking an interpretation.');
      const prediction = byId('prediction').value;
      if (!['PASS', 'FAIL', 'UNKNOWN'].includes(prediction)) {
        throw new model.GuardError('Choose PASS, FAIL or UNKNOWN after observing the result.', 'prediction');
      }
      text('prediction-result', prediction === state.result.gate
        ? `Correct: synthetic journey gate ${state.result.gate}. This checks your interpretation, not a live Azure result.`
        : `Not yet: observed journey gate is ${state.result.gate}. Capacity alone is not correctness or complete evidence.`);
    });
  });
  byId('new-attempt').addEventListener('click', () => guarded(() => {
    state = model.newAttempt(state);
    clearAttemptView();
  }));
  byId('reset-rehearsal').addEventListener('click', () => guarded(() => {
    state = model.resetRehearsal(state);
    clearAttemptView();
  }));
  render();
}());
