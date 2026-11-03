(function () {
  'use strict';
  const model = globalThis.SchemaLesson;
  const get = (id) => document.getElementById(id);
  const form = get('controls');
  let state = model.createState();
  const fields = Object.keys(model.DEFAULTS);

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function readConfig() {
    return Object.fromEntries(fields.map((id) => [id, get(id).value]));
  }
  function pinned() {
    if (state.config && fields.some((id) => get(id).value !== state.config[id])) {
      throw new Error('Invalid input: active configuration differs from its pinned preflight; reset explicitly.');
    }
  }
  function render() {
    const result = model.summarize(state);
    get('configuration').disabled = state.phase !== 'ready';
    get('start').disabled = state.phase !== 'ready' || state.history.length >= model.LIMIT;
    get('step').disabled = state.phase !== 'checking';
    get('introduce').disabled = state.phase !== 'checked';
    get('again').disabled = state.phase !== 'decided';
    const canPredict = state.phase === 'decided' && state.prediction === null;
    get('prediction').disabled = !canPredict;
    get('prediction').value = state.prediction ? state.prediction.choice : '';
    get('check').disabled = !canPredict;
    get('progress').textContent = `Phase ${state.phase} — inspected ${result.checked}/4 — retained ${state.history.length}/${model.LIMIT}.`;
    get('outcome').dataset.outcome = result.outcome;
    get('outcome').textContent = `${result.outcome.toUpperCase()} — ${result.reason} Synthetic evidence only.`;
    get('gate').dataset.decision = state.phase === 'decided' ? state.introduced ? 'introduced' : 'blocked' : 'pending';
    get('gate').textContent = state.phase === 'decided'
      ? state.introduced ? 'INTRODUCED in the synthetic model only; all four compatibility/effect checks passed.'
        : 'BLOCKED before expansion. Failure or unknown evidence cannot introduce the new producer.'
      : state.history.length >= model.LIMIT ? 'Eight attempts retained. Reset explicitly before starting a ninth.'
        : state.phase === 'checked' ? 'Preflight complete; request introduction to apply the compatibility gate.'
          : 'Not introduced. Collect all four preflight receipts before requesting introduction.';
    get('metrics').textContent = `Checks ${result.checked}/4 | Success ${result.success} | Failure ${result.failure} | Unknown ${result.unknown}`
      + ` | Interpretable ${result.interpretable} | Correct effects ${result.correctEffects} | Wrong effects ${result.incorrectEffects}`
      + ` | Measured effects ${result.measuredEffects}/4 | Observed measured test cents ${result.observedCents} / intended ${result.expectedCents}.`;
    get('coverage').textContent = `Old-consumer evidence ${result.oldConsumerCoverage}/2; new-consumer evidence ${result.newConsumerCoverage}/2.`
      + ' Shape-only checks do not measure business effects; excluded or withheld receipts are unknown.';
    get('trace').replaceChildren(...state.rows.map((row) => {
      const tr = element('tr');
      tr.dataset.outcome = row.outcome;
      const payload = element('td');
      payload.append(element('code', JSON.stringify(row.payload)));
      const interpretation = row.interpretable === null ? 'unobserved'
        : row.interpretable ? `interpretable: ${row.interpretedCents} cents` : 'incompatible';
      tr.append(element('td', `${row.producer} → ${row.consumer}`), payload,
        element('td', String(row.expectedCents)), element('td', interpretation),
        element('td', row.appliedCents === null ? 'unmeasured' : `${row.appliedCents} cents`),
        element('td', `${row.outcome}: ${row.reason}`));
      return tr;
    }));
    get('history').replaceChildren(...state.history.map((entry) => {
      const li = element('li');
      li.dataset.outcome = entry.outcome;
      const details = element('details');
      details.append(element('summary', `Attempt ${entry.id}: ${entry.outcome} — ${entry.introduced ? 'introduced' : 'blocked'}`
        + ` — ${entry.config.schema}, ${entry.config.oldReader}, ${entry.config.checks}, ${entry.config.observation}`));
      details.append(element('pre', JSON.stringify(entry, null, 2)));
      li.append(details);
      return li;
    }));
    get('prediction-result').dataset.verdict = state.prediction ? state.prediction.verdict : 'none';
    get('prediction-result').textContent = state.prediction
      ? `${state.prediction.verdict} prediction: chose ${state.prediction.choice}; measured ${result.outcome}. The compatibility result is unchanged.`
      : 'No prediction checked. Prediction accuracy never changes the compatibility result.';
  }
  function act(action, focus) {
    try {
      const next = action();
      state = next;
      get('error').textContent = '';
      render();
      if (focus) get(focus).focus();
    } catch (error) {
      get('error').textContent = error.message;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    act(() => model.start(state, readConfig()), 'step');
  });
  get('step').addEventListener('click', () => act(() => {
    pinned();
    return model.step(state);
  }, state.rows.length === 3 ? 'introduce' : 'step'));
  get('introduce').addEventListener('click', () => act(() => {
    pinned();
    return model.decide(state);
  }, 'prediction'));
  get('again').addEventListener('click', () => act(() => model.another(state), 'schema'));
  get('check').addEventListener('click', () => act(() => model.predict(state, get('prediction').value), 'again'));
  get('reset-all').addEventListener('click', () => {
    form.reset();
    state = model.createState();
    get('error').textContent = '';
    render();
    get('schema').focus();
  });
  render();
}());
