'use strict';
(function () {
  const model = globalThis.S035;
  const get = (id) => document.getElementById(id);
  const form = get('exercise');
  const configuration = get('configuration');
  const error = get('error');
  const status = get('status');
  const start = get('startLogin');
  const switchButton = get('cutover');
  const callback = get('deliverCallback');
  let state = model.createLesson();
  let current = null;
  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function number(id) {
    const raw = get(id).value;
    if (!/^\d+$/.test(raw)) throw new Error(`${id} requires a whole number; empty or fractional input is not allowed`);
    return Number(raw);
  }
  function readConfig() {
    return {
      storeMode: get('storeMode').value, callbackPath: get('callbackPath').value,
      callbackState: get('callbackState').value, observations: get('observations').value,
      budgetMs: number('budgetMs'), delayMs: number('delayMs'), prediction: get('prediction').value,
    };
  }
  function clearError() { error.hidden = true; error.textContent = ''; }
  function showError(problem) {
    error.textContent = `Cannot advance: ${problem.message}. Existing history is unchanged.`;
    error.hidden = false;
    error.focus();
  }
  function traceTable(events, label) {
    const region = element('div');
    region.className = 'trace';
    region.tabIndex = 0;
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', label);
    const table = element('table');
    const caption = element('caption', label);
    const head = element('thead');
    const headings = element('tr');
    for (const title of ['Time from login', 'Version', 'Path / event', 'Observation']) {
      const th = element('th', title);
      th.scope = 'col';
      headings.append(th);
    }
    head.append(headings);
    const body = element('tbody');
    for (const event of events) {
      const row = element('tr');
      for (const text of [
        event.atMs === null ? 'UNOBSERVED' : `${event.atMs} ms`,
        event.version === null ? 'UNOBSERVED' : event.version,
        `${event.path} / ${event.event}`, event.detail,
      ]) row.append(element('td', text));
      body.append(row);
    }
    table.append(caption, head, body);
    region.append(table);
    return region;
  }
  function configurationText(config) {
    return `Store ${config.storeMode}; callback ${config.callbackPath}; marker ${config.callbackState}; `
      + `observations ${config.observations}; original budget ${config.budgetMs} ms; `
      + `delay ${config.delayMs} ms; prediction ${config.prediction}.`;
  }
  function renderHistory() {
    get('historyCount').textContent = `${state.history.length} of ${model.MAX_HISTORY} runs retained.`;
    const history = get('history');
    history.replaceChildren();
    for (const result of state.history) {
      const details = element('details');
      details.dataset.runId = String(result.id);
      details.append(
        element('summary', `Run ${result.id} — ${result.outcome}; verifier ${result.verifier}`),
        element('p', configurationText(result.config)),
        element('p', `Reasons: ${result.reasons.join(', ') || 'none'}. `
          + `Success ${result.counts.success} / Failure ${result.counts.failure} / Unknown ${result.counts.unknown}.`),
        traceTable(result.trace, `Retained synthetic trace for run ${result.id}`),
      );
      history.append(details);
    }
  }
  function render() {
    const active = state.active;
    configuration.disabled = Boolean(active);
    start.disabled = Boolean(active) || state.history.length >= model.MAX_HISTORY;
    switchButton.disabled = !active || active.stage !== 'started';
    callback.disabled = !active || active.stage !== 'cutover';
    const metrics = get('metrics');
    const trace = get('currentTrace');
    metrics.replaceChildren();
    trace.replaceChildren();
    get('outcome').removeAttribute('data-outcome');
    if (current) {
      const result = current;
      get('outcome').dataset.outcome = result.outcome;
      get('outcome').textContent = `${result.outcome} — ${result.reasons.join(', ') || 'original login completed within budget'}.`;
      get('verifier').textContent = `${result.verifier} — prediction ${result.config.prediction}; observed ${result.outcome}. `
        + 'Verifier accuracy is not a live user result.';
      get('journeyCounts').textContent = `Success ${result.counts.success} / Failure ${result.counts.failure} / Unknown ${result.counts.unknown} (one synthetic journey).`;
      for (const [key, label] of [
        ['callbackVersion', 'Observed callback destination'], ['elapsedMs', 'Elapsed from original login (ms)'],
        ['budgetMs', 'Original budget (ms)'], ['loginCompleted', 'Login completed'],
        ['correlationMatched', 'Original correlation matched'], ['returnPath', 'Restored return path'],
        ['redirectHops', 'Observed redirect hops'], ['restartRequired', 'Forced restart needed (not executed)'],
      ]) {
        const value = result[key];
        const text = value === null ? result.outcome === 'UNKNOWN' ? 'UNOBSERVED' : 'Not restored'
          : typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value);
        const dd = element('dd', text);
        dd.dataset.metric = key;
        metrics.append(element('dt', label), dd);
      }
      trace.append(traceTable(result.trace, `Current synthetic trace for run ${result.id}`));
    } else {
      get('outcome').textContent = active
        ? `Login ${active.id} pending — started on v1 at 0 ms; ${active.stage === 'cutover' ? 'routing now v2 at 40 ms' : 'routing still v1'}.`
        : 'No current checked journey. Prior runs, if any, remain below.';
      get('verifier').textContent = 'Verifier not run. Prediction accuracy and user impact are separate.';
      get('journeyCounts').textContent = 'Success 0 / Failure 0 / Unknown 0 (no current terminal observation).';
    }
    renderHistory();
  }
  function advance(action, message, focus) {
    try {
      const next = action();
      state = next;
      current = state.active ? null : state.history.at(-1) || null;
      clearError();
      render();
      status.textContent = message;
      get(focus).focus();
    } catch (problem) { showError(problem); }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    advance(() => model.startLogin(state, readConfig()), 'Login started on v1 at 0 ms. Cut over while it is pending.', 'cutover');
  });
  switchButton.addEventListener('click', () => {
    advance(() => model.cutover(state), 'Routing cut over to v2 at 40 ms. The original login and budget are retained.', 'deliverCallback');
  });
  callback.addEventListener('click', () => {
    advance(() => model.deliverCallback(state), 'Callback exercise checked. Inspect the journey result and retained trace.', 'resultHeading');
  });
  function controlsChanged() {
    if (state.active) return;
    current = null;
    clearError();
    render();
    status.textContent = 'Controls changed. Prior run history is retained; start a new login to check these conditions.';
  }
  configuration.addEventListener('input', controlsChanged);
  configuration.addEventListener('change', controlsChanged);
  get('resetLesson').addEventListener('click', () => {
    HTMLFormElement.prototype.reset.call(form);
    state = model.createLesson();
    current = null;
    clearError();
    render();
    status.textContent = 'Lesson reset. History cleared; defaults restored.';
    get('storeMode').focus();
  });
  render();
}());
