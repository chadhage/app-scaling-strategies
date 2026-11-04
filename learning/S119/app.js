'use strict';

(function runLesson() {
  const api = globalThis.S119;
  const byId = (id) => document.getElementById(id);
  const fixture = byId('fixture-select');
  const percent = byId('cohort-percent');
  const form = byId('cohort-form');
  const error = byId('error');
  let exercise = api.initialState();

  for (const [value, data] of Object.entries(api.FIXTURES)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = data.label;
    fixture.append(option);
  }

  function clearError() {
    error.textContent = '';
    percent.removeAttribute('aria-invalid');
  }

  function render() {
    const summary = api.summarize(exercise);
    for (const key of ['phase', 'restoration', 'synchronization', 'ownership']) {
      byId(key).textContent = exercise[key];
    }
    byId('requested').textContent = `${exercise.requestedPercent}%`;
    byId('effective').textContent = exercise.effectivePercent === null ? 'Unknown (not observed)' : `${exercise.effectivePercent}%`;
    for (const key of ['attempted', 'passed', 'failed', 'unknown']) {
      byId(key).textContent = String(summary.journeys[key]);
    }
    byId('safe-aborts').textContent = String(summary.safeAborts);
    byId('completed').textContent = summary.completed ? 'Yes - synthetic only' : 'No';
    const result = summary.lastResult;
    byId('outcome').textContent = result
      ? `${result.outcome.toUpperCase()} - ${result.message}` : 'No measured return yet.';
    byId('outcome').dataset.outcome = result ? result.outcome : 'unmeasured';
    byId('status').textContent = result ? result.message : 'Choose a fixture and rehearse restore. No journey has returned.';
    byId('observations').textContent = result ? JSON.stringify(result.observations, null, 2) : 'No observations selected.';
    const items = exercise.history.map((item) => {
      const li = document.createElement('li');
      li.dataset.outcome = item.result.outcome;
      const heading = document.createElement('strong');
      heading.textContent = `${item.sequence}. ${item.command.type}${item.command.percent === undefined ? '' : ` ${item.command.percent}%`} - ${item.result.outcome.toUpperCase()}`;
      const detail = document.createElement('p');
      detail.textContent = item.result.message;
      const trace = document.createElement('details');
      const caption = document.createElement('summary');
      caption.textContent = 'Fixed observations and measured journey counts';
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify({ command: item.command, ...item.result }, null, 2);
      trace.append(caption, pre);
      li.append(heading, detail, trace);
      return li;
    });
    byId('history').replaceChildren(...items);
    fixture.disabled = exercise.fixture !== null;
    const bounded = exercise.history.length >= api.MAX_ACTIONS;
    for (const id of ['restore-button', 'sync-button', 'ownership-button', 'return-button']) {
      byId(id).disabled = bounded;
    }
    if (bounded) byId('status').textContent += ' The 24-action limit is reached; history is retained. Reset to continue.';
  }

  function apply(input) {
    try {
      const next = api.transition(exercise, input);
      exercise = next;
      clearError();
      render();
    } catch (failure) {
      error.textContent = `${failure.code || 'ERR_S119_UI'}: ${failure.message}`;
    }
  }

  byId('restore-button').addEventListener('click', () => apply({ type: 'restore', fixture: fixture.value }));
  byId('sync-button').addEventListener('click', () => apply({ type: 'synchronize' }));
  byId('ownership-button').addEventListener('click', () => apply({ type: 'ownership' }));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!/^(25|50|100)$/.test(percent.value)) {
      percent.setAttribute('aria-invalid', 'true');
      error.textContent = 'Invalid cohort: enter exactly 25, 50, or 100. No coercion or state change occurred.';
      percent.focus();
      return;
    }
    apply({ type: 'return', percent: Number(percent.value) });
  });
  byId('reset-button').addEventListener('click', () => {
    exercise = api.initialState();
    HTMLFormElement.prototype.reset.call(form);
    fixture.value = 'aligned';
    clearError();
    render();
    fixture.focus();
  });
  render();
}());
