(function () {
  'use strict';
  const element = (id) => document.getElementById(id);
  const form = element('controls');
  const model = globalThis.FlexLesson;
  function unavailable() {
    element('error').textContent = 'Lesson unavailable: required local model DATA did not load. No result measured.';
    element('status').textContent = 'Safe hold. Restore the local lesson files before rehearsing.';
    element('phase').textContent = 'unavailable';
    for (const control of form.elements) control.disabled = true;
    form.addEventListener('submit', (event) => event.preventDefault());
  }
  if (!model || typeof model.createState !== 'function' || typeof model.execute !== 'function' || typeof model.view !== 'function') {
    unavailable();
    return;
  }
  let state;
  const text = (id, value) => { element(id).textContent = value; };
  function table(id, rows) {
    const body = element(id);
    body.replaceChildren();
    for (const values of rows) {
      const row = document.createElement('tr');
      for (const value of values) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      }
      body.append(row);
    }
  }
  function list(id, values) {
    const target = element(id);
    target.replaceChildren();
    for (const value of values) {
      const item = document.createElement('li');
      item.textContent = value;
      target.append(item);
    }
  }
  const known = (value) => value === null ? 'unknown' : String(value);
  function render() {
    const observed = model.view(state);
    const fixed = observed.fixture;
    text('phase', state.phase);
    text('history-count', `${state.history.length} / 12`);
    text('trace-description', fixed ? `${fixed.label}. ${fixed.plan}; ${fixed.strategy}; ${fixed.instancesBefore} initial instance(s). ${fixed.logEstimate}.` : 'No trace loaded.');
    text('grace', fixed ? `Grace DATA: documented reference ${known(fixed.documentedGraceSeconds)} s; observed ${known(fixed.observedGraceSeconds)} s. ${fixed.graceContext}.` : 'Grace: unobserved.');
    text('completion', 'Fleet update completion: unknown — no authoritative platform completion signal.');
    table('capacity-body', fixed ? fixed.trace.map((point) => [point.point, point.instances.join('; '), `${point.readyUnits} / ${point.demandUnits}`, point.restarts.join('; ') || 'none recorded']) : []);
    table('execution-body', observed.inspected ? fixed.journeys.map((row) => [`${row.executionId} / ${row.instance}`, `${row.remainingSeconds} / ${known(fixed.observedGraceSeconds)}`, row.execution]) : []);
    text('work-summary', observed.inspected
      ? `Observed executions: ${fixed.journeys.filter((row) => row.execution === 'completed').length} completed, ${fixed.journeys.filter((row) => row.execution === 'terminated').length} terminated, ${fixed.journeys.filter((row) => row.execution === 'unknown').length} unknown. A grace reference does not prove a job completed.`
      : 'Inspect the loaded trace before measuring. A documented window is not proof of completion.');
    const result = observed.result;
    table('outcomes-body', result ? result.journeys.map((row) => [
      `${row.id} / ${row.beforeVersion} -> ${row.afterVersion}`,
      `${known(row.pollingStatus)} / state ${row.state} / ${known(row.effects)} effects / ${known(row.latencyMs)} ms (budget ${fixed.budgetMs})`,
      `${row.outcome}: ${row.reasons.join('; ') || 'observed v2, preserved state, one effect, completed work and latency within original budget'}`,
    ]) : []);
    text('sample-summary', result
      ? `${result.attempted} attempted: ${result.uninterrupted} uninterrupted, ${result.interrupted} interrupted, ${result.unknown} unknown. Outcome: ${result.outcome}; fixed sample only.`
      : '0 attempted in current trace; no measured result.');
    list('history', state.history.map((command, index) => `${index + 1}. ${command.type}${command.type === 'load' ? ` ${command.presetId} / ${command.version}` : ''}`));
    list('run-history', state.runs.map((run, index) => `Run ${index + 1}: ${run.presetId}; ${run.attempted} attempted / ${run.uninterrupted} uninterrupted / ${run.interrupted} interrupted / ${run.unknown} unknown; fleet completion unknown; not certified.`));
    text('status', `Phase ${state.phase}. Retained ${observed.totals.runs} run(s), ${observed.totals.attempted} attempted, ${observed.totals.interrupted} interrupted, ${observed.totals.unknown} unknown. More instances or a grace window cannot certify completion.`);
    element('load-button').setAttribute('aria-disabled', String(!['empty', 'measured'].includes(state.phase) || state.history.length >= model.MAX_ACTIONS));
    element('inspect-button').setAttribute('aria-disabled', String(state.phase !== 'loaded' || state.history.length >= model.MAX_ACTIONS));
    element('measure-button').setAttribute('aria-disabled', String(state.phase !== 'inspected' || state.history.length >= model.MAX_ACTIONS));
  }
  function act(command, control) {
    try {
      const next = model.execute(state, command);
      state = next;
      text('error', '');
      render();
    } catch (error) {
      text('error', `${error.code || 'ERR_LESSON'}: ${error.message}`);
      text('status', 'No action recorded and no result changed. Correct the input or follow load -> inspect -> measure.');
      const focus = error.field === 'version' ? element('software-token') : error.field === 'presetId' ? element('preset') : control;
      focus.focus();
    }
  }
  try {
    state = model.createState();
    render();
    text('error', '');
  } catch {
    unavailable();
    return;
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    act({ type: 'load', presetId: element('preset').value, version: element('software-token').value }, element('load-button'));
  });
  element('inspect-button').addEventListener('click', () => act({ type: 'inspect' }, element('inspect-button')));
  element('measure-button').addEventListener('click', () => act({ type: 'measure' }, element('measure-button')));
  element('reset-button').addEventListener('click', () => {
    HTMLFormElement.prototype.reset.call(form);
    state = model.createState();
    text('error', '');
    render();
    text('status', 'Reset complete. Only this page’s in-memory rehearsal was cleared.');
    element('preset').focus();
  });
}());
