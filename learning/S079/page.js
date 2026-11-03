(function () {
  'use strict';
  const model = window.BacklogSurge;
  const session = model.createSession();
  const byId = (id) => document.getElementById(id);
  const fields = {
    burstSize: 'burst-size', addedWorkers: 'added-workers', scheduling: 'scheduling',
    deadline: 'deadline', evidence: 'evidence',
  };
  const settings = byId('settings');
  const predictionForm = byId('prediction-form');
  const errorBox = byId('error');
  function readConfig() {
    const config = {};
    for (const [field, id] of Object.entries(fields)) {
      const raw = byId(id).value;
      const value = model.CHOICES[field].find((choice) => String(choice) === raw);
      if (value === undefined) {
        const error = new RangeError(`Invalid ${field}: choose a declared value.`);
        error.field = field;
        throw error;
      }
      config[field] = value;
    }
    return config;
  }
  function cell(row, value) {
    const element = document.createElement('td');
    element.textContent = String(value);
    row.append(element);
  }
  const observed = (value) => value === null ? 'Unknown' : String(value);
  const decision = (value) => value === null ? 'Unknown' : value ? 'Yes' : 'No';
  function describe(event) {
    if (event.type === 'burst') return `Tick 0: burst ${event.jobs} jobs; one baseline worker.`;
    if (event.type === 'expand') return `Tick 0: capacity now ${event.consumers} workers.`;
    if (event.type === 'evidence-gap') return `Tick ${event.tick}: ${event.jobId} completion observation unavailable; do not infer success.`;
    return `Tick ${event.tick}: worker ${event.worker} ${event.type === 'start' ? 'starts' : 'commits'} ${event.jobId}.`;
  }
  function render(state) {
    for (const id of Object.values(fields)) byId(id).disabled = state.phase !== 'idle';
    const available = { burst: 'idle', expand: 'burst', drain: 'expanded', verify: 'drained', check: 'verified', next: 'recorded' };
    for (const [id, phase] of Object.entries(available)) {
      byId(id).disabled = state.phase !== phase || (id === 'next' && state.history.length >= model.MAX_HISTORY);
    }
    byId('prediction').disabled = state.phase !== 'verified';
    byId('phase').textContent = `Phase: ${state.phase}. Workers: ${state.consumers}. Observation tick: ${state.observationTick}. Retained: ${state.history.length}/6.`;
    const result = state.result;
    byId('result').dataset.outcome = result ? result.outcome : 'PENDING';
    byId('result').textContent = result
      ? `${result.outcome} — ${result.success} successful / ${result.failure} failed / ${result.unknown} unknown of ${result.total} synthetic jobs. ${result.overdue} overdue; ${result.orderingViolations} ordering failures.`
      : 'Not verified. Complete the four ordered steps.';
    byId('impact').textContent = !result ? 'No completed synthetic journey has been claimed.'
      : result.outcome === 'PASS' ? 'Synthetic contract met for every observed job; not a native result.'
        : result.outcome === 'FAIL' ? 'Interrupted synthetic jobs remain failures, even after eventual drain.'
          : 'Unverified synthetic jobs remain unknown, not successful.';
    byId('diagnostic').textContent = result
      ? `${result.completed}/${result.total} observed completions by tick ${state.observationTick}; ${result.observedBacklog} jobs without observed completion. Throughput ${result.throughput.toFixed(2)} jobs/tick is diagnostic only.`
      : 'Throughput is diagnostic only; missing completion evidence is never success.';
    byId('jobs').replaceChildren();
    for (const job of state.jobs) {
      const row = document.createElement('tr');
      [job.id, observed(job.startTick), observed(job.completionTick), job.deadline,
        decision(job.ordered), decision(job.onTime), job.outcome].forEach((value) => cell(row, value));
      byId('jobs').append(row);
    }
    byId('trace').replaceChildren();
    for (const event of state.trace) {
      const item = document.createElement('li');
      item.textContent = describe(event);
      byId('trace').append(item);
    }
    const current = state.phase === 'recorded' ? state.history.at(-1) : null;
    byId('learning').textContent = current
      ? `${current.predictionCorrect ? 'Correct' : 'Incorrect'} prediction: ${current.prediction}. Measured outcome stays ${current.result.outcome}.`
      : 'No prediction checked.';
    const totals = { PASS: 0, FAIL: 0, UNKNOWN: 0, success: 0, failure: 0, unknown: 0 };
    byId('history').replaceChildren();
    for (const record of state.history) {
      totals[record.result.outcome] += 1;
      for (const field of ['success', 'failure', 'unknown']) totals[field] += record.result[field];
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = `Attempt ${record.attempt} — ${record.result.outcome} — prediction ${record.predictionCorrect ? 'correct' : 'incorrect'}`;
      const body = document.createElement('pre');
      body.textContent = JSON.stringify(record, null, 2);
      details.append(summary, body);
      byId('history').append(details);
    }
    byId('totals').textContent = state.history.length
      ? `Retained attempts: ${state.history.length}. PASS: ${totals.PASS}; FAIL: ${totals.FAIL}; UNKNOWN: ${totals.UNKNOWN}. Jobs: ${totals.success} successful / ${totals.failure} failed / ${totals.unknown} unknown.`
      : 'No retained attempts.';
  }
  function act(action, payload) {
    try {
      const state = session.dispatch(action, payload);
      errorBox.textContent = '';
      errorBox.hidden = true;
      if (action === 'next' || action === 'reset') {
        settings.reset();
        predictionForm.reset();
        document.querySelectorAll('details').forEach((details) => { details.open = false; });
      }
      render(state);
      const focus = {
        burst: 'expand', expand: 'drain', drain: 'verify', verify: 'prediction',
        check: state.history.length >= model.MAX_HISTORY ? 'clear-data' : 'next',
        next: 'burst', reset: 'burst',
      };
      byId(focus[action]).focus();
    } catch (error) {
      showError(error);
    }
  }
  function showError(error) {
    errorBox.textContent = error instanceof Error ? error.message : 'Operation rejected.';
    errorBox.hidden = false;
    const target = byId(fields[error.field] || error.field || 'error');
    (target && !target.disabled ? target : errorBox).focus();
  }
  settings.addEventListener('submit', (event) => {
    event.preventDefault();
    try { act('burst', readConfig()); } catch (error) { showError(error); }
  });
  predictionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    act('check', byId('prediction').value);
  });
  for (const action of ['expand', 'drain', 'verify', 'next']) {
    byId(action).addEventListener('click', () => act(action));
  }
  byId('clear-data').addEventListener('click', () => act('reset'));
  render(session.snapshot());
}());
