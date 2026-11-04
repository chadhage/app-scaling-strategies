(function () {
  'use strict';
  const form = document.getElementById('controls');
  const preset = document.getElementById('preset');
  const error = document.getElementById('error');
  const status = document.getElementById('status');
  const actions = [...form.querySelectorAll('button[data-action]')];
  const api = globalThis.CollaborativeRehearsal;
  const put = (id, value) => { document.getElementById(id).textContent = String(value); };
  const display = (value) => value === null || value === undefined ? 'unobserved / UNKNOWN'
    : typeof value === 'string' ? value : JSON.stringify(value);
  const nativeReset = () => HTMLFormElement.prototype.reset.call(form);
  form.addEventListener('submit', (event) => event.preventDefault());

  if (!api || typeof api.createState !== 'function' || typeof api.execute !== 'function'
      || typeof api.inspect !== 'function') {
    status.textContent = 'Safe hold: local lesson logic unavailable; no outcome certified.';
    error.textContent = 'Local model did not load. Restore the local lesson files and reload. No document result is certified.';
    preset.disabled = true;
    for (const button of actions) button.disabled = button.dataset.action !== 'reset';
    document.getElementById('reset-button').addEventListener('click', () => { nativeReset(); error.focus(); });
    return;
  }

  let state = api.createState();
  const rejections = [];
  const nextAction = {
    idle: 'start', 'old-acked': 'disconnect', disconnected: 'reconnect',
    reconnected: 'observe', observed: 'measure', measured: 'reset',
  };
  function render() {
    const current = state.current;
    const observation = current && current.observation;
    const result = api.inspect(state);
    put('phase', state.phase);
    put('connection', current && current.reconnect ? display(current.reconnect.connected) : 'unobserved');
    put('receipt', current && current.reconnect ? display(current.reconnect.acknowledgmentReceipt) : 'unobserved');
    put('ack-order', observation ? display(observation.acknowledgments && observation.acknowledgments.map((ack) => ack.editId)) : 'unobserved');
    put('applied-order', observation ? display(observation.appliedOrder) : 'unobserved');
    put('document', observation ? display(observation.documentText) : 'unobserved');
    put('version', observation ? display(observation.documentVersion) : 'unobserved');
    put('pending', current ? `${display(current.pending)}; disposition: ${observation ? observation.pendingResolution : 'unobserved'}; merge ACK: ${observation ? display(observation.mergeAcknowledgment) : 'unobserved'}` : 'unobserved');
    put('verdict', `${result.verdict.toUpperCase()}${result.measured ? ' — measured synthetic DATA' : ' — not measured'}`);
    put('verifier', result.matchesPreset === null ? 'not measured' : result.matchesPreset ? 'MATCHES fixed expected outcome; not native proof' : 'MISMATCH — safe hold');
    put('run-count', state.runCount);
    put('history-count', state.history.length);
    put('outcome-count', state.outcomes.length);
    put('rejection-count', rejections.length);
    put('trace', current ? JSON.stringify(current, null, 2) : 'No active trace.');
    const rows = document.getElementById('assertions');
    rows.replaceChildren();
    for (const check of result.checks) {
      const row = document.createElement('tr');
      row.dataset.check = check.id;
      row.dataset.result = check.result;
      for (const value of [check.id, display(check.expected), display(check.observed), check.result.toUpperCase()]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      rows.append(row);
    }
    for (const [id, records, describe] of [
      ['history', state.history, (item) => `${item.step}. ${item.command.type}${item.command.presetId ? ` / ${item.command.presetId}` : ''}`],
      ['outcomes', state.outcomes, (item) => `Run ${item.runId} / ${item.presetId}: ${item.result.verdict.toUpperCase()} — ${item.completion}; native unverified`],
      ['rejections', rejections, (item) => `${item.index}. ${item.type}: ${item.code} — ${item.message}`],
    ]) {
      const list = document.getElementById(id);
      list.replaceChildren();
      for (const item of records) {
        const li = document.createElement('li');
        li.textContent = describe(item);
        list.append(li);
      }
    }
    const exhausted = state.runCount >= api.MAX_RUNS || state.history.length >= api.MAX_HISTORY;
    preset.disabled = state.phase !== 'idle' || exhausted;
    for (const button of actions) {
      button.disabled = button.dataset.action !== 'reset'
        && (button.dataset.action !== nextAction[state.phase] || exhausted && state.phase === 'idle');
    }
    status.textContent = `${state.phase}; ${result.measured ? `synthetic ${result.verdict}` : 'no preserved outcome certified'}; native unverified.${exhausted && state.phase === 'idle' ? ' Teaching run bound reached; reload starts a new nonpersistent page.' : ''}`;
  }
  function operate(type) {
    try {
      const command = type === 'start' ? { type, presetId: preset.value } : { type };
      state = api.execute(state, command);
      error.textContent = '';
      if (type === 'reset') nativeReset();
      render();
      if (type === 'reset') (preset.disabled ? status : preset).focus();
      else document.getElementById(nextAction[state.phase]).focus();
    } catch (cause) {
      const code = cause && typeof cause.code === 'string' && /^ERR_(COMMAND|STATE|PHASE|BOUND)$/.test(cause.code)
        ? cause.code : 'ERR_STATE';
      const message = code === 'ERR_STATE' ? 'State is invalid or local logic failed. No new outcome is certified.'
        : cause.message;
      const safeType = ['start', 'disconnect', 'reconnect', 'observe', 'measure', 'reset'].includes(type) ? type : 'invalid-action';
      if (rejections.length < api.MAX_REJECTIONS) rejections.push({ index: rejections.length + 1, type: safeType, code, message });
      render();
      error.textContent = `${code}: ${message}${rejections.length >= api.MAX_REJECTIONS ? ' Rejected history bound reached; no additional raw input is retained.' : ''}`;
      error.focus();
    }
  }
  for (const button of actions) button.addEventListener('click', () => operate(button.dataset.action));
  render();
}());
