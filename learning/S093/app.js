(function () {
  'use strict';
  const Model = window.S093Model;
  const get = (id) => document.getElementById(id);
  const form = get('rehearsal-controls');
  const scenario = get('scenario');
  const budget = get('budget');
  const action = get('action');
  const error = get('error');
  let state = Model.createState();

  function clearError() {
    error.hidden = true;
    error.textContent = '';
  }

  function showError(problem) {
    error.textContent = `${problem.code || 'ERR_STATE'}: ${problem.message}`;
    error.hidden = false;
    error.focus();
  }

  function textElement(tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
  }

  function render() {
    const totals = Model.summarize(state);
    for (const key of ['runs', 'attempted', 'success', 'interrupted', 'unknown']) {
      get(`total-${key}`).textContent = String(totals[key]);
    }
    const decided = state.phase === 'decided';
    const full = totals.runs === Model.constants.maxAttempts;
    for (const control of [scenario, budget, action]) control.disabled = decided;
    get('apply-decision').disabled = decided || full;
    get('current-status').textContent = full
      ? 'Session full: six decisions are retained. Reset does not erase them or refill the allowance.'
      : decided ? 'Decision complete. Reset the current rehearsal before another attempt.'
        : 'Ready. No current synthetic decision has been checked.';
    get('result').hidden = !decided;
    get('trace').replaceChildren();
    for (const key of ['attempted', 'http200', 'success', 'interrupted', 'unknown']) {
      get(`sample-${key}`).textContent = '';
    }
    if (decided) {
      const record = state.history.at(-1);
      get('result').dataset.acceptance = record.acceptance;
      get('result').dataset.verifier = record.verification;
      get('verdict').textContent = `Journey acceptance: ${record.acceptance}. Decision verifier: ${record.verification}.`;
      get('explanation').textContent = record.explanation;
      get('routing').textContent = `Synthetic expansion: ${record.expansion}. Canary ${record.initialCanaryPercent}% → ${record.nextCanaryPercent}%. No actual routing change.`;
      for (const key of ['attempted', 'http200', 'success', 'interrupted', 'unknown']) {
        get(`sample-${key}`).textContent = String(record.metrics[key]);
      }
      for (const journey of record.journeys) {
        const row = document.createElement('tr');
        for (const value of [
          journey.id, String(journey.status),
          journey.durationMs === null ? 'unknown' : `${journey.durationMs} ms`,
          `${journey.budgetMs} ms`, journey.outcome,
        ]) row.append(textElement('td', value));
        get('trace').append(row);
      }
    } else {
      delete get('result').dataset.acceptance;
      delete get('result').dataset.verifier;
      for (const id of ['verdict', 'explanation', 'routing']) get(id).textContent = '';
    }
    get('history').replaceChildren();
    for (const record of state.history) {
      const item = document.createElement('li');
      item.dataset.acceptance = record.acceptance;
      item.append(textElement('p', `Attempt ${record.id}: ${record.selection.scenario}, ${record.selection.budgetMs} ms, ${record.selection.action}. Journey acceptance ${record.acceptance}; verifier ${record.verification}; expansion ${record.expansion}.`));
      item.append(textElement('p', `Attempted ${record.metrics.attempted}; within-budget successes ${record.metrics.success}; interruptions ${record.metrics.interrupted}; unknown ${record.metrics.unknown}.`));
      get('history').append(item);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    try {
      if (!Model.constants.budgets.map(String).includes(budget.value)) {
        const problem = new Error('Choose exactly 1000 or 1500 milliseconds; numeric coercion is not allowed.');
        problem.code = 'ERR_INPUT';
        throw problem;
      }
      state = Model.decide(state, {
        scenario: scenario.value, budgetMs: Number(budget.value), action: action.value,
      });
      render();
    } catch (problem) {
      showError(problem);
    }
  });

  get('reset-rehearsal').addEventListener('click', () => {
    try {
      state = Model.reset(state);
      HTMLFormElement.prototype.reset.call(form);
      clearError();
      render();
      scenario.focus();
    } catch (problem) {
      showError(problem);
    }
  });
  render();
}());
