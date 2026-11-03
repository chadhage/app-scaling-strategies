(function () {
  'use strict';
  const { createState, transition, evaluate, MAX_HISTORY } = window.S059;
  const element = (id) => document.getElementById(id);
  const form = element('configuration-form');
  const controls = { schema: element('schema'), value: element('budget'), reader: element('reader') };
  let state = createState();

  function configText(config) {
    return `retryBudget=${config.value}; ${config.schema}; new code=${config.reader}`;
  }

  function announce(message) {
    element('announcement').textContent = message;
  }

  function readConfig() {
    if (!/^[0-4]$/.test(controls.value.value)) {
      const error = new TypeError('retryBudget must be a single integer 0–4 (1–4 for attempts-v2). No measurement or publication changed.');
      error.field = controls.value;
      throw error;
    }
    const config = {
      schema: controls.schema.value, value: Number(controls.value.value), reader: controls.reader.value,
    };
    try {
      evaluate(config);
    } catch (error) {
      error.field = config.schema === 'attempts-v2' && config.value === 0 ? controls.value : controls.schema;
      throw error;
    }
    return config;
  }

  function clearError() {
    element('input-error').hidden = true;
    element('input-error').textContent = '';
    Object.values(controls).forEach((control) => control.removeAttribute('aria-invalid'));
  }

  function showError(error) {
    const output = element('input-error');
    output.textContent = error.message;
    output.hidden = false;
    if (error.field) {
      error.field.setAttribute('aria-invalid', 'true');
      error.field.focus();
    }
    announce('Action refused. Earlier measured outcomes and the published configuration are retained.');
  }

  function syncDraft() {
    const config = readConfig();
    if (JSON.stringify(config) !== JSON.stringify(state.draft)) {
      state = transition(state, { type: 'edit', config });
    }
  }

  function cell(row, value) {
    const td = document.createElement('td');
    td.textContent = String(value);
    row.appendChild(td);
  }

  function placeholder(body, columns, message) {
    const row = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = columns;
    td.textContent = message;
    row.appendChild(td);
    body.appendChild(row);
  }

  function render() {
    const checked = state.check;
    element('draft-state').textContent = checked
      ? `Inspected exact draft: ${configText(checked.config)}.`
      : 'Not inspected. Publication is blocked; inspect this exact draft.';
    element('verdict').textContent = checked ? checked.verdict : 'NOT CHECKED';
    element('compatibility').textContent = checked ? checked.compatibility : 'NOT CHECKED';
    for (const name of ['attempted', 'successful', 'failed', 'unknown']) {
      element(name).textContent = String(checked ? checked.metrics[name] : 0);
    }
    element('reason').textContent = checked ? checked.reason : 'A configured value alone proves nothing about its readers.';
    element('user-impact').textContent = checked ? checked.userImpact : 'not measured';
    const readings = element('readings');
    readings.replaceChildren();
    if (checked) {
      for (const reading of checked.readings) {
        const row = document.createElement('tr');
        row.dataset.code = reading.code;
        [
          reading.code, `${checked.config.value} (${checked.config.schema})`, reading.meaning,
          reading.totalAttempts === null ? 'not established' : reading.totalAttempts,
          reading.usedAttempts === null ? 'unknown' : reading.usedAttempts,
          `${reading.journey}: ${reading.reason}`,
        ].forEach((value) => cell(row, value));
        readings.appendChild(row);
      }
    } else placeholder(readings, 6, 'Inspect a draft to observe both readers.');
    const trace = element('trace');
    trace.replaceChildren();
    for (const line of checked ? checked.trace : ['No current draft inspection; earlier traces remain in history evidence.']) {
      const item = document.createElement('li');
      item.textContent = line;
      trace.appendChild(item);
    }
    element('published').textContent = state.published
      ? `Published locally: ${configText(state.published)}.` : 'Nothing published.';
    element('history-count').textContent = `${state.history.length} / ${MAX_HISTORY} measured actions. No records are silently evicted.`;
    const history = element('history');
    history.replaceChildren();
    for (const entry of state.history) {
      const row = document.createElement('tr');
      row.dataset.record = String(entry.id);
      const metrics = entry.evaluation ? entry.evaluation.metrics : null;
      [
        `${entry.id} / ${entry.action}`, configText(entry.config), entry.outcome,
        metrics ? `${metrics.successful} / ${metrics.failed} / ${metrics.unknown}` : 'not measured',
        entry.reason,
      ].forEach((value) => cell(row, value));
      history.appendChild(row);
    }
    if (!state.history.length) placeholder(history, 5, 'No measured actions yet.');
  }

  function run(type) {
    try {
      syncDraft();
      const next = transition(state, { type });
      state = next;
      clearError();
      render();
      const latest = state.history.at(-1);
      announce(type === 'inspect'
        ? `Inspection ${latest.outcome}. ${latest.reason}` : latest.reason);
    } catch (error) {
      showError(error);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    run('inspect');
  });
  element('publish-draft').addEventListener('click', () => run('publish'));
  Object.values(controls).forEach((control) => control.addEventListener('change', () => {
    try {
      syncDraft();
      clearError();
      render();
      announce('Draft changed. Inspect this exact draft before publication; earlier outcomes are retained.');
    } catch (error) {
      showError(error);
    }
  }));
  element('start-over').addEventListener('click', () => {
    HTMLFormElement.prototype.reset.call(form);
    state = createState();
    clearError();
    render();
    controls.schema.focus();
    announce('Lesson reset. Local publication and retained history cleared; defaults restored. No external cleanup was needed.');
  });
  render();
}());
