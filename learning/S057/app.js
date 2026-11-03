(function () {
  'use strict';
  const model = globalThis.StaticAssetLesson;
  const get = (id) => document.getElementById(id);
  const form = get('controls');
  let state = model.createState();
  function clearPrediction() {
    get('prediction').value = '';
    get('prediction-result').textContent = '';
    get('prediction-result').dataset.verdict = 'none';
  }
  function render() {
    const view = model.inspect(state);
    get('configuration').disabled = view.phase !== 'ready';
    const enabled = {
      start: view.phase === 'ready', deploy: view.phase === 'cached', retire: view.phase === 'deployed',
      'load-old': ['deployed', 'retired'].includes(view.phase), 'load-new': view.phase === 'old-loaded',
      again: view.phase === 'complete' && view.retainedCount < model.MAX_ATTEMPTS,
      check: view.phase === 'complete', prediction: view.phase === 'complete',
    };
    for (const [id, value] of Object.entries(enabled)) get(id).disabled = !value;
    get('progress').textContent = `Phase: ${view.phase}. ${view.phase === 'complete' ? 'Both page loads observed; inspect unknowns and failures.' : 'Follow the next enabled step; deploying alone proves no page result.'}`;
    get('html-state').textContent = `Cached HTML: ${view.cachedHtml || 'not yet cached'}. Published HTML: ${view.publishedHtml}. Cached v1 always references app.a17c.js and site.a17c.css; v2 references app.b28d.js and site.b28d.css.`;
    get('retirement').textContent = `Retired old paths: ${view.retiredPaths.length ? view.retiredPaths.join(', ') : 'none'}.`;
    get('assets').replaceChildren(...view.assets.map((asset) => {
      const item = document.createElement('li');
      item.textContent = `${asset.html} ${asset.kind}: ${asset.path} — ${asset.available ? 'available' : asset.html === 'v2' && view.publishedHtml === 'v1' ? 'not yet published' : 'retired'}`;
      return item;
    }));
    get('outcome').dataset.outcome = view.outcome;
    get('outcome').textContent = `Overall synthetic result: ${view.outcome}.`;
    get('pages').textContent = `Cached old page: ${view.oldOutcome}. Current new page: ${view.newOutcome}.`;
    const metrics = view.metrics;
    get('metrics').textContent = `Required assets ${metrics.planned} · Attempted ${metrics.attempted} · Success ${metrics.success} · Failure ${metrics.failure} · Unknown ${metrics.unknown} (pending ${metrics.pending}).`;
    get('trace').replaceChildren(...view.rows.map((row) => {
      const element = document.createElement('tr');
      element.dataset.outcome = row.outcome;
      for (const value of [row.html === 'v1' ? 'cached v1' : 'current v2', row.path, row.status, row.outcome]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        element.append(cell);
      }
      return element;
    }));
    get('history-bound').textContent = `${view.retainedCount} / ${model.MAX_ATTEMPTS} completed attempts retained. ${view.retainedCount === model.MAX_ATTEMPTS ? 'History limit reached; explicit reset is required, nothing was pruned.' : 'Failures and unknowns are never silently pruned.'}`;
    get('history').replaceChildren(...view.history.map((attempt) => {
      const item = document.createElement('li');
      item.dataset.outcome = attempt.outcome;
      item.textContent = `Attempt ${attempt.id}: ${attempt.outcome}; old ${attempt.oldOutcome}, new ${attempt.newOutcome}; success ${attempt.metrics.success}/4, failure ${attempt.metrics.failure}, unknown ${attempt.metrics.unknown}; ${attempt.config.observation}; retired ${attempt.retiredPaths.join(', ') || 'none'}.`;
      return item;
    }));
  }
  function handled(error) {
    get('error').textContent = error.message;
    get('error').focus();
  }
  function perform(action, payload) {
    try {
      state = model.transition(state, action, payload);
      get('error').textContent = '';
      clearPrediction();
      if (action === 'again' || action === 'reset') form.reset();
      render();
      const focus = {
        start: 'deploy', deploy: 'retire', retire: 'load-old',
        'load-old': 'load-new', 'load-new': 'prediction', again: 'observation', reset: 'observation',
      }[action];
      if (focus) get(focus).focus();
    } catch (error) {
      handled(error);
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    perform('start', { observation: get('observation').value, retireTarget: get('retireTarget').value });
  });
  for (const action of ['deploy', 'retire', 'load-old', 'load-new', 'again']) {
    get(action).addEventListener('click', () => perform(action));
  }
  get('reset-lesson').addEventListener('click', () => perform('reset'));
  get('check').addEventListener('click', () => {
    try {
      const view = model.inspect(state);
      if (view.phase !== 'complete') throw new RangeError('Complete both page loads before checking a prediction');
      const prediction = get('prediction').value;
      if (!['success', 'failure', 'unknown'].includes(prediction)) throw new RangeError('Choose a valid prediction');
      const verdict = prediction === view.outcome ? 'PASS' : 'RETRY';
      get('prediction-result').dataset.verdict = verdict;
      get('prediction-result').textContent = `${verdict}: predicted ${prediction}; measured synthetic outcome ${view.outcome}.`;
      get('error').textContent = '';
    } catch (error) {
      handled(error);
    }
  });
  render();
}());
