(function () {
  'use strict';
  const api = globalThis.LongWork;
  const byId = (id) => document.getElementById(id);
  const controls = byId('lessonControls');
  let state = api.createSession();

  function element(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function readNumber(id) {
    const value = byId(id).value;
    return /^\d+$/.test(value) ? Number(value) : NaN;
  }

  function metric(label, key, value) {
    const term = element('dt', label);
    const detail = element('dd', String(value));
    detail.dataset.key = key;
    return [term, detail];
  }

  function render() {
    const current = state.history.find((record) => record.id === state.activeId);
    byId('errorNotice').textContent = state.error;
    byId('checkPrediction').disabled = state.phase !== 'observed';
    byId('metrics').replaceChildren();
    byId('checks').replaceChildren();
    byId('trace').replaceChildren();
    byId('userResult').className = current ? current.result.status : 'unknown';
    byId('userResult').textContent = current
      ? `${current.result.status.toUpperCase()} — synthetic user result for run ${current.id}.`
      : 'UNKNOWN — no valid current run. Earlier records, if any, remain below.';
    byId('currentConfig').textContent = current
      ? `Run snapshot: ${current.result.input.mode} / ${current.result.input.condition}; original budget ${current.result.input.budgetMs} ms; drain ${current.result.input.drainMs} ms; HTTP limit ${current.result.input.hostLimitMs} ms.`
      : 'Results are snapshots of a run. Editing controls clears the current result, not history.';
    byId('verification').textContent = current && current.verification
      ? `${current.verification.verdict.toUpperCase()} — predicted ${current.verification.prediction.toUpperCase()}; user result stays ${current.result.status.toUpperCase()}.`
      : 'NOT CHECKED';
    if (current) {
      const result = current.result;
      byId('metrics').replaceChildren(...[
        ...metric('Operation', 'operation', result.operationId),
        ...metric('Original start (ms)', 'start', result.originalStartMs),
        ...metric('Original absolute deadline (ms)', 'deadline', result.originalDeadlineMs),
        ...metric('Original elapsed / observation (ms)', 'elapsed', result.elapsedMs),
        ...metric('Retry-only duration (ms)', 'retry', result.retryElapsedMs === null ? 'not a retry' : result.retryElapsedMs),
        ...metric('Proved completed units / 12', 'units', result.completedUnits === null ? 'UNKNOWN' : result.completedUnits),
        ...metric('Proved durable checkpoint units', 'checkpoint', result.persistedUnits),
        ...metric('Native Azure result', 'native', 'UNKNOWN'),
      ]);
      byId('checks').replaceChildren(...result.checks.map((item) => {
        const node = element('li', `${item.verdict.toUpperCase()} — ${item.detail}`, item.verdict);
        node.dataset.check = item.id;
        return node;
      }));
      byId('trace').replaceChildren(...result.trace.map((item) => element('li',
        `${item.atMs} ms — ${item.text} [operation ${item.operationId}; original deadline ${item.originalDeadlineMs} ms]`)));
    }
    const counts = { completed: 0, interrupted: 0, unknown: 0 };
    for (const record of state.history) counts[record.result.status]++;
    byId('historySummary').textContent = `${state.history.length} attempted; ${counts.completed} completed; ${counts.interrupted} interrupted; ${counts.unknown} unknown.`;
    byId('history').replaceChildren(...state.history.map((record) => element('li',
      `Run ${record.id} — ${record.result.input.mode} / ${record.result.input.condition} — ${record.result.status.toUpperCase()}; original elapsed ${record.result.elapsedMs} ms / deadline ${record.result.originalDeadlineMs} ms; prediction ${record.verification ? record.verification.verdict.toUpperCase() : 'NOT CHECKED'}.`,
      record.result.status)));
  }

  function apply(action) {
    state = api.dispatch(state, action);
    render();
    if (state.errorField) byId(state.errorField).focus();
  }

  controls.addEventListener('submit', (event) => {
    event.preventDefault();
    apply({
      type: 'RUN',
      input: {
        mode: byId('mode').value,
        condition: byId('condition').value,
        budgetMs: readNumber('budgetMs'),
        drainMs: readNumber('drainMs'),
        hostLimitMs: readNumber('hostLimitMs'),
      },
    });
  });
  function edited() {
    apply({ type: 'EDIT' });
  }
  controls.addEventListener('input', edited);
  controls.addEventListener('change', edited);
  byId('checkPrediction').addEventListener('click', () => {
    apply({ type: 'CHECK', prediction: byId('prediction').value });
  });
  byId('restoreDefaults').addEventListener('click', () => {
    for (const [key, value] of Object.entries(api.DEFAULT_INPUT)) byId(key).value = String(value);
    byId('prediction').value = 'completed';
    apply({ type: 'RESET' });
    byId('mode').focus();
  });
  render();
}());
