(function () {
  'use strict';
  const model = globalThis.CachePayloadLesson;
  const lesson = model.createLesson();
  const byId = (id) => document.getElementById(id);
  const choiceIds = ['layout', 'translation', 'payload', 'observation'];
  const form = byId('cache-controls');
  let state = lesson.snapshot();
  function clearError() {
    byId('input-error').textContent = '';
    byId('input-error').hidden = true;
    [...choiceIds, 'prediction'].forEach((id) => byId(id).removeAttribute('aria-invalid'));
  }
  function showError(error) {
    byId('input-error').textContent = error.message;
    byId('input-error').hidden = false;
    const field = [...choiceIds, 'prediction']
      .find((id) => error.message.startsWith(id[0].toUpperCase() + id.slice(1) + ':'));
    if (field) byId(field).setAttribute('aria-invalid', 'true');
  }
  function cells(values, attribute) {
    const row = document.createElement('tr');
    if (attribute) row.setAttribute(attribute[0], String(attribute[1]));
    values.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.append(cell);
    });
    return row;
  }
  function render() {
    const full = state.history.length >= model.HISTORY_LIMIT;
    const complete = state.phase === 'complete';
    byId('phase').textContent = `Phase: ${state.phase} · two synthetic readers`;
    byId('configuration').disabled = state.phase !== 'idle';
    byId('prepare').disabled = state.phase !== 'idle' || full;
    byId('read-cache').disabled = state.phase !== 'prepared';
    byId('new-attempt').disabled = !complete;
    byId('prediction').disabled = !complete || state.prediction !== null;
    byId('check-prediction').disabled = !complete || state.prediction !== null;
    byId('history-limit').hidden = !full;
    byId('cache-plan').textContent = state.config
      ? state.config.layout === 'shared'
        ? 'Planned shared-key overlap: v1 write → readers v1/v2 → v2 overwrite → readers v1/v2.'
        : 'Planned isolated overlap: pre-populated v1/v2 namespaces → each reader reads its own key twice.'
      : 'No cache prepared.';
    byId('result-detail').hidden = !complete;
    byId('gate').textContent = state.result
      ? `Compatibility gate: ${state.result.gate}` : 'Compatibility gate: not evaluated';
    byId('gate').dataset.state = state.result?.gate || 'NOT_EVALUATED';
    byId('impact').textContent = state.result
      ? `Synthetic read impact: ${state.result.impact}` : 'Synthetic read impact: not evaluated';
    const m = state.result?.metrics;
    byId('metrics').textContent = m
      ? `Started ${m.started} · observed ${m.observed} · correct ${m.success} · failed ${m.failure} · unknown ${m.unknown} · translated ${m.translated}`
      : 'No reads observed.';
    byId('reads').replaceChildren(...(state.result?.reads || []).map((read) => cells([
      read.id, `v${read.reader}`, read.key,
      read.payload === null ? 'UNKNOWN — no received object observed' : JSON.stringify(read.payload),
      read.status.toUpperCase(),
      read.value === null ? 'Not established' : `${read.value.itemId} · ${read.value.currency} · ${read.value.minor} minor units`,
      read.detail,
    ], ['data-read', read.id])));
    byId('prediction-result').textContent = state.prediction
      ? `Prediction verifier: ${state.prediction.verdict} · chosen ${state.prediction.selected}, measured ${state.prediction.actual}. Cache gate and synthetic impact are unchanged.`
      : 'Prediction not checked.';
    const historyRows = state.history.map((entry) => cells([
      entry.attempt,
      `${entry.config.layout} · ${entry.config.translation} · ${entry.config.payload} · ${entry.config.observation}`,
      `${entry.result.metrics.success} / ${entry.result.metrics.failure} / ${entry.result.metrics.unknown}`,
      entry.result.gate, entry.result.impact, entry.prediction?.verdict || 'NOT CHECKED',
    ], ['data-attempt', entry.attempt]));
    if (!historyRows.length) {
      const row = cells(['No completed attempts.']);
      row.cells[0].colSpan = 6;
      historyRows.push(row);
    }
    byId('history').replaceChildren(...historyRows);
    byId('trace').textContent = state.trace.length ? state.trace.join('\n') : 'No attempt started.';
  }
  function perform(action, focus) {
    try {
      state = action();
      clearError();
      render();
      const target = typeof focus === 'function' ? focus() : focus;
      if (target) byId(target).focus();
    } catch (error) {
      showError(error);
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    perform(() => lesson.prepare(Object.fromEntries(choiceIds.map((id) => [id, byId(id).value]))), 'read-cache');
  });
  byId('read-cache').addEventListener('click', () => perform(() => lesson.read(), 'prediction'));
  byId('check-prediction').addEventListener('click', () => perform(
    () => lesson.predict(byId('prediction').value),
    () => state.history.length >= model.HISTORY_LIMIT ? 'reset-rehearsal' : 'new-attempt',
  ));
  byId('new-attempt').addEventListener('click', () => perform(() => {
    const next = lesson.newAttempt();
    byId('prediction').value = '';
    return next;
  }, () => state.history.length >= model.HISTORY_LIMIT ? 'reset-rehearsal' : 'prepare'));
  byId('reset-rehearsal').addEventListener('click', () => perform(() => {
    const next = lesson.reset();
    form.reset();
    choiceIds.forEach((id) => { byId(id).value = model.DEFAULTS[id]; });
    byId('prediction').value = '';
    return next;
  }, 'prepare'));
  render();
}());
