(function () {
  'use strict';
  const engine = window.WarmHandoffLesson;
  const condition = document.getElementById('condition');
  let state = engine.createExercise(condition.value);

  function text(id, value) {
    document.getElementById(id).textContent = value;
  }

  function format(value) {
    return value === null || value === undefined ? 'MISSING' :
      typeof value === 'string' ? value : JSON.stringify(value);
  }

  function render() {
    const input = engine.fixture(state.condition);
    text('expected', input.expected);
    text('fixture-input', JSON.stringify(input, null, 2));
    text('verdict', state.verdict.replace('_', ' '));
    document.getElementById('verdict').dataset.verdict = state.verdict;
    text('reason', state.reason);
    text('impact-kind', state.userImpact.classification.toUpperCase());
    text('user-impact', state.userImpact.message);
    text('sample-count', 'Attempted: ' + state.attemptedTransitions.length +
      ' · proven successful: ' + state.userImpact.successfulTransitions +
      ' · interrupted: ' + state.userImpact.interruptedJourneys);
    text('cleanup-kind', state.cleanup.status.toUpperCase());
    text('cleanup', state.cleanup.message);
    text('v1-state', state.v1);
    text('v2-state', state.v2);
    text('admission-target', state.admissionTarget);
    text('retention', state.elapsedSinceHandoffMs + ' / 1000 ms');
    text('old-work', JSON.stringify(state.oldJourney, null, 2));
    text('new-work', state.newJourney ? JSON.stringify(state.newJourney, null, 2) : 'No transition attempted.');

    const assertions = document.getElementById('assertions');
    assertions.replaceChildren();
    if (state.checks.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.textContent = 'No observations yet. Empty evidence is not a success.';
      row.appendChild(cell);
      assertions.appendChild(row);
    }
    for (const check of state.checks) {
      const row = document.createElement('tr');
      for (const value of [check.scope, check.id, format(check.expected), format(check.actual), check.status.toUpperCase()]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      }
      row.dataset.result = check.status;
      assertions.appendChild(row);
    }

    const trace = document.getElementById('trace');
    trace.replaceChildren();
    for (const event of state.trace) {
      const item = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = event.event;
      const details = document.createElement('pre');
      details.textContent = JSON.stringify(event.details, null, 2);
      item.append(name, details);
      trace.appendChild(item);
    }
    text('result-announcement', 'Exercise verdict: ' + state.verdict.replace('_', ' ') +
      '. User impact: ' + state.userImpact.classification +
      '. Cleanup: ' + state.cleanup.status + '. Trace steps: ' + state.trace.length + '.');
  }

  for (const button of document.querySelectorAll('button[data-action]')) {
    button.addEventListener('click', function () {
      state = engine.act(state, button.dataset.action);
      render();
    });
  }
  function reset() {
    state = engine.createExercise(condition.value);
    render();
  }
  condition.addEventListener('change', reset);
  document.getElementById('reset').addEventListener('click', reset);
  render();
}());
