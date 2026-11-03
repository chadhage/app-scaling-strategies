(function () {
  'use strict';
  const model = globalThis.S036Lesson;
  const byId = (id) => document.getElementById(id);
  const form = byId('rehearsal-controls');
  const controls = ['configuration', 'token', 'observation'].map(byId);
  let state = model.createState();
  function node(tag, text) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function traceList(target, trace) {
    target.replaceChildren(...trace.map((line) => node('li', line)));
  }
  function resultView(target, result) {
    target.replaceChildren();
    target.dataset.status = result ? result.status : 'unmeasured';
    if (!result) {
      target.append(node('p', 'UNKNOWN — no completed submission observation in this rehearsal.'));
      return;
    }
    target.append(node('h3', `Synthetic assertion ${result.status.toUpperCase()}`));
    target.append(node('p', `Submission: ${result.submission.toUpperCase()}. Synthetic HTTP: ${result.httpStatus ?? 'UNKNOWN'}. Valid-prior continuity: ${result.continuity}.`));
    const impact = result.continuity === 'not-tested'
      ? 'Strict rejection succeeded; valid-prior continuity was NOT TESTED.'
      : result.status === 'failure'
        ? 'A valid prior form was interrupted. Do not repair this by disabling validation.'
        : result.status === 'unknown'
          ? 'No submission evidence. Do not infer acceptance, rejection or zero effects.'
          : 'The valid prior form completed once under compatible strict validation.';
    target.append(node('p', impact));
    const metrics = node('dl');
    for (const [name, value] of Object.entries(result.metrics)) {
      metrics.append(node('dt', `Synthetic ${name}`), node('dd', value === null ? 'UNKNOWN' : String(value)));
    }
    target.append(metrics);
    const checks = node('ul');
    for (const [name, value] of Object.entries(result.checks)) checks.append(node('li', `${name}: ${value.toUpperCase()}`));
    target.append(checks);
  }
  function render() {
    const phaseLabels = { empty: 'Choose settings', 'old-page': 'Old form loaded on v1', cutover: 'Cut over to v2; old form retained', complete: 'Submission completed on v2' };
    const locked = state.phase !== 'empty';
    controls.forEach((control) => { control.disabled = locked; });
    byId('load-form').disabled = locked || state.history.length === model.MAX_RUNS;
    byId('cut-over').disabled = state.phase !== 'old-page';
    byId('submit-form').disabled = state.phase !== 'cutover';
    byId('status').textContent = `${phaseLabels[state.phase]}. ${state.history.length}/${model.MAX_RUNS} completed.${state.history.length === model.MAX_RUNS ? ' Limit reached; reload to clear page memory.' : ''}`;
    byId('history-count').textContent = `${state.history.length}/${model.MAX_RUNS} retained. Reset keeps completed history; reload clears it.`;
    resultView(byId('result'), state.phase === 'complete' ? state.history.at(-1).result : null);
    traceList(byId('trace'), model.currentTrace(state));
    byId('history').replaceChildren(...state.history.map((record) => {
      const item = node('li');
      const details = node('details');
      details.append(node('summary', `Run ${record.id}: ${record.result.status.toUpperCase()} / ${record.result.submission.toUpperCase()} — ${record.config.configuration}, ${record.config.token}, ${record.config.observation}`));
      const output = node('div');
      resultView(output, record.result);
      const trace = node('ol');
      traceList(trace, record.trace);
      details.append(output, trace);
      item.append(details);
      return item;
    }));
  }
  function perform(action) {
    try {
      const next = action();
      state = next;
      byId('error').hidden = true;
      byId('error').textContent = '';
      render();
      return true;
    } catch (error) {
      byId('error').textContent = `Rejected without changing the rehearsal: ${error.message}`;
      byId('error').hidden = false;
      byId('error').focus();
      return false;
    }
  }
  byId('load-form').addEventListener('click', () => perform(() => model.loadForm(state, {
    configuration: byId('configuration').value,
    token: byId('token').value,
    observation: byId('observation').value
  })));
  byId('cut-over').addEventListener('click', () => perform(() => model.cutOver(state)));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    perform(() => model.submit(state));
  });
  byId('reset-current').addEventListener('click', () => {
    if (perform(() => model.resetCurrent(state))) {
      HTMLFormElement.prototype.reset.call(form);
      byId('configuration').focus();
    }
  });
  render();
}());
