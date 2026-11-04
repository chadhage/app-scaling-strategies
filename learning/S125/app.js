(function () {
  'use strict';
  const model = globalThis.AcaRevisionLesson;
  const field = (id) => document.getElementById(id);
  const form = field('candidate-form');
  if (!model) {
    field('error').textContent = 'Lesson data could not load. Reload this local lesson; no update was performed.';
    for (const control of document.querySelectorAll('button, input, select')) control.disabled = true;
    field('phase').textContent = 'unavailable';
    field('status').textContent = 'Local data unavailable; no readiness, traffic or continuity claim.';
    return;
  }
  let state = model.createState();
  function render() {
    field('phase').textContent = state.phase;
    field('candidate').textContent = state.candidate
      ? `${state.candidate.revision} / ${state.candidate.image}` : 'None recorded';
    field('readiness').textContent = state.readiness;
    field('traffic-result').textContent = state.trafficResult;
    field('traffic').textContent = state.traffic
      ? `old ${state.traffic.old}% / candidate ${state.traffic.candidate}%` : 'unknown';
    field('last-traffic').textContent = `old ${state.lastTraffic.old}% / candidate ${state.lastTraffic.candidate}%`;
    field('old-lifecycle').textContent = state.oldLifecycle;
    field('candidate-lifecycle').textContent = state.candidateLifecycle;
    field('sessions').textContent = state.sessions;
    field('work').textContent = state.work;
    field('attempted').textContent = String(state.journeys.attempted);
    field('journeys').textContent = `${state.journeys.passed} / ${state.journeys.failed} / ${state.journeys.unknown}`;
    field('safe-holds').textContent = String(state.safeHolds);
    field('completed').textContent = String(state.completed);
    field('outcome').textContent = state.outcome;
    field('status').textContent = state.message;
    field('observations').textContent = state.data ? JSON.stringify(state.data, null, 2) : 'No candidate observations inspected.';
    field('history-count').textContent = `${state.history.length} / ${model.HISTORY_LIMIT}`;
    const rows = state.history.map((entry) => {
      const row = document.createElement('li');
      row.textContent = `${entry.sequence}. ${entry.command.type}: ${entry.outcome.toUpperCase()} — ${entry.message}`;
      return row;
    });
    field('history').replaceChildren(...rows);
    field('fixture').disabled = state.candidate !== null;
    field('candidate-version').disabled = state.candidate !== null;
  }
  function run(command, focusId) {
    try {
      state = model.execute(state, command);
      field('error').textContent = state.data && state.data.guard ? state.message : '';
      render();
    } catch (error) {
      field('error').textContent = error.message;
      field(error.code === 'ERR_HISTORY_LIMIT' ? 'reset-button' : focusId).focus();
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    run({
      type: 'update', fixture: field('fixture').value, version: field('candidate-version').value,
    }, 'candidate-version');
  });
  for (const [id, type] of [
    ['readiness-button', 'readiness'], ['traffic-button', 'traffic'], ['continuity-button', 'continuity'],
  ]) field(id).addEventListener('click', () => run({ type }, id));
  field('reset-button').addEventListener('click', () => {
    HTMLFormElement.prototype.reset.call(form);
    state = model.createState();
    field('error').textContent = '';
    render();
    field('fixture').focus();
  });
  render();
}());
