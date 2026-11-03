(function () {
  'use strict';
  const model = globalThis.S052;
  const byId = (id) => document.getElementById(id);
  const fields = ['routing', 'requirement', 'policy', 'oldCondition'];
  let state = model.createState();
  function text(id, value) { byId(id).textContent = value; }
  function cell(row, value) {
    const element = document.createElement('td');
    element.textContent = value;
    row.append(element);
  }
  function render() {
    const current = state.current;
    const ready = state.phase === 'ready';
    const complete = state.phase === 'complete';
    byId('configuration').disabled = !ready;
    byId('start').disabled = !ready;
    byId('step').disabled = state.phase !== 'running';
    byId('again').disabled = !complete || state.history.length >= 8;
    byId('prediction-controls').disabled = !complete;
    text('progress', ready ? `Ready. ${state.history.length}/8 completed attempts retained.`
      : `Attempt ${current.id}: ${current.cursor}/4 requests attempted; ${state.phase}.`
        + (state.history.length >= 8 ? ' History limit reached: reset explicitly to continue.' : ''));
    const outcome = current && complete ? current.outcome : 'unknown';
    byId('outcome').dataset.outcome = outcome;
    text('outcome', current
      ? `${outcome.toUpperCase()} — ${complete ? 'completed synthetic required journey' : 'incomplete attempt; not a successful result'}.`
      : 'Unknown — no completed attempt.');
    const counts = current ? current.metrics : { attempted: 0, success: 0, failure: 0, unknown: 0, responses200: 0 };
    text('metrics', `Attempted ${counts.attempted}/4 · Success ${counts.success} · Failure ${counts.failure}`
      + ` · Unknown ${counts.unknown} · HTTP 200 ${counts.responses200}`
      + (current ? ` · Old ${counts.oldRequests} · New ${counts.newRequests}`
        + ` · Optional unavailable ${counts.optionalUnavailable} · Silent success rejected ${counts.rejectedSilentSuccess}` : ''));
    text('coverage', current ? `Old API compatibility: ${current.oldCompatibility}.`
      : 'Old API compatibility is not established.');
    byId('trace').replaceChildren();
    for (const item of current ? current.rows : []) {
      const row = document.createElement('tr');
      row.dataset.outcome = item.outcome;
      cell(row, item.requestId);
      cell(row, `${item.frontend} → ${item.deployment} / ${item.contract} (effective ${item.backend})`);
      cell(row, `${item.httpStatus === null ? item.observation : `HTTP ${item.httpStatus}`} · ${item.feature}`
        + ` · ${item.body ? JSON.stringify(item.body) : 'no response body'}`
        + (item.view ? ` · rendered ${JSON.stringify(item.view)}` : ' · no verified rendered view'));
      cell(row, item.frontendResult);
      cell(row, `${item.outcome.toUpperCase()} — ${item.reason}`);
      byId('trace').append(row);
    }
    byId('history').replaceChildren();
    for (const attempt of state.history) {
      const item = document.createElement('li');
      item.dataset.outcome = attempt.outcome;
      item.textContent = `Attempt ${attempt.id}: ${attempt.outcome.toUpperCase()}`
        + ` · ${attempt.config.routing} · ${attempt.config.requirement} · ${attempt.config.policy}`
        + ` · ${attempt.config.oldCondition} · success ${attempt.metrics.success}, failure ${attempt.metrics.failure},`
        + ` unknown ${attempt.metrics.unknown} · old ${attempt.metrics.oldRequests}, new ${attempt.metrics.newRequests}.`;
      byId('history').append(item);
    }
    const prediction = state.prediction;
    text('prediction-result', prediction
      ? `${prediction.verdict} — predicted ${prediction.expected}; actual user outcome ${prediction.actual}. User outcome unchanged.`
      : 'Not checked.');
    byId('prediction-result').dataset.verdict = prediction ? prediction.verdict : 'none';
  }
  function act(action, payload) {
    try {
      state = model.transition(state, action, payload);
      text('error', '');
      if (['start', 'again', 'reset'].includes(action)) byId('prediction').value = '';
      if (action === 'reset') {
        byId('controls').reset();
        for (const field of fields) byId(field).value = model.DEFAULTS[field];
      }
      render();
      if (action === 'start') byId('step').focus();
      if (action === 'step') byId(state.phase === 'complete' ? 'prediction' : 'step').focus();
      if (action === 'again' || action === 'reset') byId('routing').focus();
    } catch (error) {
      text('error', `${error.message} No request or history was advanced.`);
      text('prediction-result', 'Not checked — action rejected.');
      byId('prediction-result').dataset.verdict = 'none';
    }
  }
  byId('controls').addEventListener('submit', (event) => {
    event.preventDefault();
    const config = Object.fromEntries(fields.map((field) => [field, byId(field).value]));
    act('start', config);
  });
  byId('step').addEventListener('click', () => act('step'));
  byId('again').addEventListener('click', () => act('again'));
  byId('check').addEventListener('click', () => act('predict', byId('prediction').value));
  byId('reset-rehearsal').addEventListener('click', () => act('reset'));
  render();
}());
