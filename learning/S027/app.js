(function () {
  'use strict';
  const model = globalThis.S027;
  const byId = (id) => document.getElementById(id);
  const form = byId('exercise');
  const fixture = byId('fixture');
  const prediction = byId('prediction');
  const problem = byId('problem');
  let state = model.createSession();
  let current = null;

  function clearProblem() {
    problem.hidden = true;
    problem.textContent = '';
  }

  function showProblem(error) {
    current = null;
    byId('result').hidden = true;
    problem.textContent = `Check blocked: ${error.message}`;
    problem.hidden = false;
    problem.focus();
  }

  function settings() {
    return { fixture: fixture.value, prediction: prediction.value };
  }

  function cell(row, text) {
    const td = document.createElement('td');
    td.textContent = text;
    row.append(td);
    return td;
  }

  function render() {
    byId('history-count').textContent = `${state.history.length} / 8 retained checks`;
    const fragment = document.createDocumentFragment();
    for (const item of state.history) {
      const result = item.result;
      const row = document.createElement('tr');
      cell(row, String(item.run));
      cell(row, `${item.config.fixture} / ${result.response.status}`);
      cell(row, `${result.checks.status} / ${result.checks.business}`);
      cell(row, `${result.counts.success} / ${result.counts.failure} / ${result.counts.unknown}`);
      cell(row, `${result.readiness} / ${result.decision}`);
      cell(row, `${item.config.prediction} / ${result.verifier}`);
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = `Run ${item.run} synthetic trace`;
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(item, null, 2);
      details.append(summary, pre);
      cell(row, '').append(details);
      fragment.append(row);
    }
    byId('history').replaceChildren(fragment);
    byId('result').hidden = current === null;
    if (!current) return;
    const result = current.result;
    byId('response-status').textContent = String(result.response.status);
    byId('status-check').textContent = result.checks.status;
    byId('business-check').textContent = result.checks.business;
    byId('readiness').textContent = result.readiness;
    byId('gate').textContent = result.decision;
    byId('prediction-verifier').textContent = result.verifier;
    byId('success-count').textContent = String(result.counts.success);
    byId('failure-count').textContent = String(result.counts.failure);
    byId('unknown-count').textContent = String(result.counts.unknown);
    byId('verdict').textContent = `Synthetic readiness ${result.readiness}; eligibility ${result.decision}; prediction ${result.verifier}. No promotion performed.`;
    byId('raw-response').textContent = JSON.stringify(result.response, null, 2);
    const trace = result.trace.map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    });
    byId('trace').replaceChildren(...trace);
  }

  form.addEventListener('change', (event) => {
    if (event.target !== fixture && event.target !== prediction) return;
    try {
      const next = model.configure(state, settings());
      state = next;
      current = null;
      clearProblem();
      render();
      byId('session-status').textContent = `Settings changed; current result invalidated. ${state.history.length} earlier checks retained. Revision ${state.revision} / 32.`;
    } catch (error) {
      showProblem(error);
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const configured = model.configure(state, settings());
      const checked = model.conduct(configured);
      state = checked;
      current = state.history[state.history.length - 1];
      clearProblem();
      render();
      byId('session-status').textContent = `Synthetic check ${current.run} retained. No real user journey was measured.`;
      byId('result-title').focus();
    } catch (error) {
      showProblem(error);
    }
  });

  byId('clear-session').addEventListener('click', () => {
    HTMLFormElement.prototype.reset.call(form);
    state = model.createSession();
    current = null;
    clearProblem();
    render();
    byId('session-status').textContent = 'Lesson reset. History and errors cleared; defaults restored.';
    fixture.focus();
  });

  render();
}());
