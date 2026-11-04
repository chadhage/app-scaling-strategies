(function () {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const form = byId('controls');
  const model = globalThis.SignInLesson;
  const actionIds = ['start-button', 'cutover-button', 'callback-button', 'finish-button', 'reset-button'];
  if (!model || typeof model.createState !== 'function' || typeof model.execute !== 'function') {
    byId('error').textContent = 'ERR_MODEL: Safe hold: required local model DATA did not load. No sign-in result is measured.';
    byId('status').textContent = 'Unavailable; restore the local lesson bundle.';
    byId('phase').textContent = 'unavailable';
    for (const id of actionIds) byId(id).disabled = true;
    byId('preset').disabled = true;
    byId('budget').disabled = true;
    return;
  }
  let state = model.createState();
  const phaseMessages = {
    idle: 'Ready. Start one fixed fictional original sign-in.',
    started: 'Original v1 start and budget retained. Cut over next; no result measured.',
    cutover: 'Cutover DATA loaded. Deliver the callback next; no result measured.',
    callback: 'Callback is only an intermediate record. Finish and verify the original signed-in journey next.',
    measured: 'Original journey measured. Start another comparison or reset this page.',
  };
  function render() {
    byId('phase').textContent = state.phase;
    byId('history-count').textContent = `${state.history.length} / ${model.MAX_ACTIONS}`;
    byId('run-count').textContent = `${state.runs.length} / ${model.MAX_RUNS} measured runs`;
    const canStart = ['idle', 'measured'].includes(state.phase);
    byId('preset').disabled = !canStart;
    byId('budget').readOnly = !canStart;
    byId('start-button').setAttribute('aria-disabled', String(!canStart || state.history.length >= model.MAX_ACTIONS));
    for (const [id, phase] of [['cutover-button', 'started'], ['callback-button', 'cutover'], ['finish-button', 'callback']]) {
      byId(id).setAttribute('aria-disabled', String(state.phase !== phase));
    }
    byId('trace-description').textContent = state.active
      ? `Run ${state.active.runId}: ${model.SCENARIOS[state.active.scenarioId].description} Pinned original budget: ${state.active.budgetMs} ms.`
      : 'No journey started.';
    byId('trace-data').textContent = state.active ? JSON.stringify(state.active.trace, null, 2) : 'No records loaded.';
    const result = state.active?.result;
    byId('result').textContent = result
      ? `${result.classification.toUpperCase()} - original sign-in; elapsed=${result.elapsedMs === null ? 'UNKNOWN' : `${result.elapsedMs} ms`}; agreed original budget=${result.budgetMs} ms.`
      : 'No measured original sign-in result.';
    byId('claim').textContent = result?.claim || 'No continuous-sign-in claim.';
    byId('checks-body').replaceChildren();
    for (const check of result?.checks || []) {
      const row = document.createElement('tr');
      row.dataset.check = check.id;
      for (const text of [check.id, check.status.toUpperCase(), check.observed, check.expected]) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.append(cell);
      }
      byId('checks-body').append(row);
    }
    byId('history').replaceChildren();
    state.history.forEach((action, index) => {
      const item = document.createElement('li');
      item.textContent = `${index + 1}. ${action.type}${action.type === 'start' ? ` ${action.scenarioId}; original budget ${action.budgetMs} ms` : ''}`;
      byId('history').append(item);
    });
    byId('run-history').replaceChildren();
    for (const run of state.runs) {
      const item = document.createElement('li');
      const summary = document.createElement('p');
      summary.textContent = `Run ${run.runId}: ${run.scenarioId} - ${run.result.classification.toUpperCase()}; original elapsed ${run.result.elapsedMs === null ? 'UNKNOWN' : run.result.elapsedMs} ms / ${run.budgetMs} ms. Negative checks: ${run.result.failedChecks.join(', ') || 'none'}. Unknown checks: ${run.result.unknownChecks.join(', ') || 'none'}.`;
      const details = document.createElement('details');
      const title = document.createElement('summary');
      title.textContent = `Retained fixed DATA and all checks for run ${run.runId}`;
      const records = document.createElement('pre');
      records.textContent = JSON.stringify({ trace: run.trace, result: run.result }, null, 2);
      details.append(title, records);
      item.append(summary, details);
      byId('run-history').append(item);
    }
  }
  function perform(action, focusId) {
    try {
      state = model.execute(state, action);
      byId('error').textContent = '';
      render();
      byId('status').textContent = phaseMessages[state.phase];
    } catch (error) {
      byId('error').textContent = `${error.code || 'ERR_MODEL'}: ${error.message}`;
      byId('status').textContent = 'Safe hold. Original state, records and retained results are unchanged.';
      byId(focusId).focus();
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const rawBudget = byId('budget').value;
    if (!/^(?:[1-4]\d{3}|5000)$/.test(rawBudget)) {
      byId('error').textContent = 'ERR_INPUT: Use an exact integer string from 1000 through 5000 ms; no spaces, signs, decimals or exponent notation.';
      byId('status').textContent = 'Safe hold. Original state, records and retained results are unchanged.';
      byId('budget').focus();
      return;
    }
    perform({ type: 'start', scenarioId: byId('preset').value, budgetMs: Number(rawBudget) }, 'preset');
  });
  for (const type of ['cutover', 'callback', 'finish']) {
    byId(`${type}-button`).addEventListener('click', () => perform({ type }, `${type}-button`));
  }
  byId('reset-button').addEventListener('click', () => {
    HTMLFormElement.prototype.reset.call(form);
    state = model.createState();
    byId('error').textContent = '';
    render();
    byId('status').textContent = 'Reset only this page’s in-memory DATA and retained comparisons.';
    byId('preset').focus();
  });
  render();
}());
