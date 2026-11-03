'use strict';

(() => {
  const lesson = globalThis.S106Lesson;
  const form = document.getElementById('probe-form');
  const condition = document.getElementById('condition');
  const action = document.getElementById('operator-action');
  const error = document.getElementById('input-error');
  const history = document.getElementById('history');
  const trace = document.getElementById('private-checks');
  const assessment = document.getElementById('assessment');
  let state = lesson.initialState();

  function text(id, value) {
    document.getElementById(id).textContent = value;
  }

  function clearError() {
    error.hidden = true;
    error.textContent = '';
  }

  function probeLabel(probe) {
    return probe.status === 'unknown' ? 'Unknown - not measured'
      : `${probe.status} - HTTP ${probe.httpStatus}; ${probe.latencyMs} synthetic ms; ${probe.scope}`;
  }

  function render() {
    const totals = lesson.summarize(state);
    text('counts', `Attempts ${totals.attempts}/${lesson.MAX_RUNS} | Private success ${totals.privateSuccesses} | Private failure ${totals.privateFailures} | Private unknown ${totals.privateUnknowns}`);
    text('separate-probes', `Public successes ${totals.publicSuccesses}; internal successes ${totals.internalSuccesses}. Neither is the private-path success numerator.`);
    history.replaceChildren();
    for (const entry of state.history) {
      const item = document.createElement('li');
      const result = entry.result;
      item.dataset.status = result.privateProbe.status;
      item.textContent = `#${entry.sequence} ${entry.input.condition} / ${entry.input.action}: private ${result.privateProbe.status}; public ${result.publicProbe.status}; internal ${result.internalProbe.status}; ${result.eligible ? 'synthetic fixture eligible' : 'not eligible'}.`;
      history.append(item);
    }
    trace.replaceChildren();
    if (!state.current) {
      assessment.dataset.status = 'idle';
      text('private-outcome', 'No comparison recorded');
      text('eligibility', 'Not eligible - no private teaching comparison');
      text('explanation', 'Record an operator action. Public and internal successes cannot certify the application private path.');
      text('public-result', 'Not recorded');
      text('internal-result', 'Not recorded');
      text('private-duration', 'Unknown - not measured');
      text('observed-client', 'Unknown - not measured');
      return;
    }
    const result = state.current.result;
    assessment.dataset.status = result.privateProbe.status;
    text('private-outcome', `Actual private path in the teaching trace: ${result.privateProbe.status}`);
    text('eligibility', result.eligible
      ? 'Eligible in the synthetic fixture only - native private path unverified'
      : 'Not eligible - actual private-path or management-safety gate not satisfied');
    text('explanation', result.conclusion);
    text('public-result', probeLabel(result.publicProbe));
    text('internal-result', probeLabel(result.internalProbe));
    text('private-duration', result.privateProbe.latencyMs === null
      ? 'Unknown - not measured on the required private path'
      : `${result.privateProbe.latencyMs} synthetic ms; budget ${lesson.BUDGET_MS} synthetic ms`);
    text('observed-client', result.privateProbe.observations?.client || 'Unknown - not measured');
    for (const check of result.privateProbe.checks) {
      const row = document.createElement('tr');
      row.dataset.check = check.id;
      row.dataset.status = check.status;
      for (const value of [check.label, check.status, check.detail]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      trace.append(row);
    }
  }

  function showError(caught) {
    error.textContent = caught.message;
    error.hidden = false;
    error.focus();
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const next = lesson.record(state, { condition: condition.value, action: action.value });
      state = next;
      clearError();
      render();
    } catch (caught) {
      showError(caught);
    }
  });

  document.getElementById('reset-lesson').addEventListener('click', () => {
    try {
      state = lesson.reset(state);
      HTMLFormElement.prototype.reset.call(form);
      clearError();
      render();
      condition.focus();
    } catch (caught) {
      showError(caught);
    }
  });
  condition.addEventListener('change', clearError);
  action.addEventListener('change', clearError);
  render();
})();
