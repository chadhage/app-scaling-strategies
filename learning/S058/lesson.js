(function () {
  'use strict';
  const model = globalThis.WorkflowReplay;
  const form = document.querySelector('#replay-form');
  const error = document.querySelector('#error');
  const verdict = document.querySelector('#verdict');
  const impact = document.querySelector('#impact');
  const metrics = document.querySelector('#metrics');
  const histories = document.querySelector('#histories');
  const attempts = document.querySelector('#attempts');
  const capacity = document.querySelector('#capacity');
  let state = model.createState();

  function node(tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
  }

  function showError(reason) {
    error.textContent = `${reason} Previous results and retained history are unchanged.`;
    error.hidden = false;
    error.focus();
  }

  function clearError() {
    error.hidden = true;
    error.textContent = '';
  }

  function render(result) {
    verdict.textContent = `Synthetic verifier: ${result.verdict}`;
    verdict.dataset.verdict = result.verdict;
    impact.textContent = `Synthetic user impact: ${result.impact}`;
    metrics.replaceChildren();
    const names = {
      started: 'Started histories', matched: 'Modeled continuations', mismatches: 'Recorded-command mismatches',
      blocked: 'Blocked continuations', unknown: 'Unknown observations', replayedEvents: 'Matching recorded commands',
      externalEffects: 'Actual external effects',
    };
    for (const [key, label] of Object.entries(names)) {
      const value = node('dd', String(result.metrics[key]));
      value.id = `metric-${key}`;
      metrics.append(node('dt', label), value);
    }
    histories.replaceChildren();
    for (const history of result.rows) {
      const row = document.createElement('tr');
      row.dataset.outcome = history.outcome;
      row.append(
        node('td', `${history.id} / recorded version ${history.version}`),
        node('td', `worker ${history.worker || 'unavailable'} / definition ${history.definition}`),
        node('td', `Recorded: ${history.recorded ? history.recorded.join(' → ') : 'unobserved'}\nExpected: ${history.expected.join(' → ')}`),
        node('td', `${history.outcome}; next: ${history.next || 'not permitted'}\n${history.explanation}`),
      );
      histories.append(row);
    }
    attempts.replaceChildren();
    for (const entry of state.attempts) {
      const previous = entry.result;
      attempts.append(node('li', `Attempt ${previous.attempt}: ${entry.input.strategy} / ${entry.input.workers} / ${entry.input.historyEvidence} — ${previous.verdict}; matched ${previous.metrics.matched}/${previous.metrics.started}, mismatches ${previous.metrics.mismatches}, blocked ${previous.metrics.blocked}, unknown ${previous.metrics.unknown}.`));
    }
    capacity.textContent = `${state.attempts.length}/${model.MAX_ATTEMPTS} comparisons retained${state.attempts.length === model.MAX_ATTEMPTS ? ' — reset required for another comparison' : ''}`;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const outcome = model.conduct(state, {
        strategy: form.elements.namedItem('strategy').value,
        workers: form.elements.namedItem('workers').value,
        historyEvidence: form.elements.namedItem('historyEvidence').value,
      });
      state = outcome.state;
      clearError();
      render(outcome.result);
    } catch (reason) { showError(reason.message); }
  });

  document.querySelector('#restart').addEventListener('click', () => {
    try {
      state = model.reset(state);
      form.reset();
      clearError();
      verdict.textContent = 'Synthetic verifier: NOT RUN';
      delete verdict.dataset.verdict;
      impact.textContent = 'Synthetic user impact: not observed';
      metrics.replaceChildren();
      histories.replaceChildren();
      attempts.replaceChildren();
      capacity.textContent = '0/6 comparisons retained';
      document.querySelector('#strategy').focus();
    } catch (reason) { showError(reason.message); }
  });
}());
