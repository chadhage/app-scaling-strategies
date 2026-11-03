(function () {
  'use strict';
  const api = globalThis.ConnectionPoolsLesson;
  const get = (id) => document.getElementById(id);
  const form = get('controls');
  const keys = Object.keys(api.DEFAULTS);
  let state = api.createState();
  const text = (tag, content) => {
    const node = document.createElement(tag);
    node.textContent = content;
    return node;
  };
  const value = (number) => number === null ? 'unknown' : String(number);

  function clearPrediction() {
    get('prediction-result').dataset.verdict = 'none';
    get('prediction-result').textContent = 'Prediction not checked.';
  }

  function render() {
    const view = api.inspect(state);
    get('configuration').disabled = view.phase !== 'draft';
    if (view.config) {
      for (const key of keys) get(key).value = String(view.config[key]);
    }
    get('baseline').disabled = view.phase !== 'draft';
    get('scale').disabled = view.phase !== 'baseline';
    get('again').disabled = view.phase !== 'complete' || view.history.length >= api.MAX_ATTEMPTS;
    get('check').disabled = view.phase !== 'complete';
    get('progress').textContent = `Attempt ${view.attempt} · ${view.phase}. Baseline: 1 frontend + 1 API instance.`;
    get('outcome').dataset.outcome = view.outcome;
    get('outcome').textContent = `Synthetic measured result: ${view.outcome}.`;
    const m = view.metrics;
    get('metrics').textContent = `Required 2 · Attempted ${m.attempted} · Success ${m.success} · Failure ${m.failure} · Unknown ${m.unknown} (pending ${m.pending}).`;
    get('trace').replaceChildren(...view.samples.map((item) => {
      const row = document.createElement('tr');
      row.dataset.outcome = item.outcome;
      row.dataset.checkpoint = item.checkpoint;
      const label = text('th', `${item.checkpoint}: ${value(item.frontendInstances)} × ${value(item.frontendPool)} frontend + ${value(item.apiInstances)} × ${value(item.apiPool)} API`);
      label.scope = 'row';
      row.append(label,
        text('td', `${value(item.demand)} requested / ${value(item.connectionLimit)} limit · forecast ${item.forecast}`),
        text('td', `${value(item.accepted)} accepted · ${value(item.refused)} refused · ${value(item.headroom)} signed headroom`),
        text('td', `${value(item.latencyMs)} ms / ${value(item.journeyBudget)} ms budget`),
        text('td', `${item.outcome}: ${item.reason}`));
      return row;
    }));
    get('history-bound').textContent = `Retained ${view.history.length} of ${api.MAX_ATTEMPTS} completed attempts. ${view.history.length >= api.MAX_ATTEMPTS ? 'History limit reached; reset explicitly to continue.' : 'No records are pruned.'}`;
    get('history').replaceChildren(...view.history.map((run) => {
      const c = run.config;
      const item = text('li', `Attempt ${run.attempt}: ${run.outcome}. Target frontend/API ${c.frontendInstances}/${c.apiInstances}; pools ${c.frontendPool}/${c.apiPool}; limit ${c.connectionLimit}; budget ${c.journeyBudget} ms; observations ${c.observation}. `
        + run.samples.map((s) => `${s.checkpoint}: demand ${s.demand}, accepted ${value(s.accepted)}, refused ${value(s.refused)}, latency ${value(s.latencyMs)} ms, ${s.outcome}`).join('; ')
        + `. Success ${run.metrics.success}; failure ${run.metrics.failure}; unknown ${run.metrics.unknown} of 2.`);
      item.dataset.outcome = run.outcome;
      return item;
    }));
  }

  function conduct(action) {
    try {
      const input = action === 'baseline'
        ? Object.fromEntries(keys.map((key) => [key, get(key).value])) : undefined;
      const next = api.transition(state, action, input);
      state = next;
      get('error').textContent = '';
      clearPrediction();
      render();
      const view = api.inspect(state);
      const focus = view.phase === 'baseline' ? 'scale'
        : view.phase === 'complete' ? (get('again').disabled ? 'reset-lesson' : 'again') : 'frontendInstances';
      get(focus).focus();
    } catch (error) {
      get('error').textContent = error.message;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    conduct('baseline');
  });
  for (const action of ['scale', 'again']) get(action).addEventListener('click', () => conduct(action));
  get('reset-lesson').addEventListener('click', () => {
    state = api.transition(state, 'reset');
    form.reset();
    get('prediction').value = '';
    get('error').textContent = '';
    clearPrediction();
    render();
    get('frontendInstances').focus();
  });
  get('prediction').addEventListener('change', clearPrediction);
  get('check').addEventListener('click', () => {
    const view = api.inspect(state);
    if (view.phase !== 'complete' || !['success', 'failure', 'unknown'].includes(get('prediction').value)) {
      get('error').textContent = 'Complete an attempt and choose a prediction first.';
      return;
    }
    get('error').textContent = '';
    const correct = get('prediction').value === view.outcome;
    get('prediction-result').dataset.verdict = correct ? 'pass' : 'retry';
    get('prediction-result').textContent = `${correct ? 'PASS' : 'RETRY'}: prediction only; measured result remains ${view.outcome}.`;
  });
  render();
}());
