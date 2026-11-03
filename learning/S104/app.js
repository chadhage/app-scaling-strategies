(function () {
  'use strict';

  const lesson = globalThis.S104Lesson;
  const form = document.getElementById('comparison-form');
  const fixture = document.getElementById('fixture');
  const action = document.getElementById('operator-action');
  const error = document.getElementById('input-error');
  const result = document.getElementById('comparison-result');
  const trace = document.getElementById('external-trace');
  const history = document.getElementById('history');
  let state = lesson.createState();

  function text(id, value) {
    document.getElementById(id).textContent = value;
  }

  function render() {
    const active = lesson.current(state);
    const counts = lesson.summary(state);
    text('counts', `Attempts ${counts.total}; success ${counts.success}; failure ${counts.failure}; unknown ${counts.unknown}; remaining ${counts.remaining}.`);
    result.dataset.status = active === null ? 'idle' : active.assessment.status;
    text('assessment', active === null ? 'No current comparison' : `External assessment: ${active.assessment.status}`);
    text('eligibility', active === null ? 'No current eligibility decision.' : active.assessment.eligible
      ? 'Eligible in this synthetic fixture only. Not a live host or Azure approval.'
      : 'Not eligible. Internal health success cannot approve the external path.');
    text('explanation', active === null ? 'Choose an action and inspect its fixed teaching trace. Reset does not remove session history.' : active.assessment.reason);
    text('internal-result', active === null ? 'Internal warm-up: not recorded.' : 'Internal warm-up: success; internal-host-label; warm-up-label; HTTP 200; 32 synthetic ms.');
    text('external-duration', active === null || active.externalMs === null ? 'External journey duration: unknown (not measured).' : `External journey duration: ${active.externalMs} synthetic ms; budget ${lesson.JOURNEY_BUDGET_MS} ms.`);
    trace.replaceChildren();
    if (active !== null) {
      active.checks.forEach(item => {
        const row = document.createElement('tr');
        row.dataset.check = item.name;
        row.dataset.status = item.status;
        for (const value of [item.name, item.status, item.observed, item.durationMs === null ? 'Unknown - not measured' : `${item.durationMs} synthetic ms`]) {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.append(cell);
        }
        trace.append(row);
      });
    }
    history.replaceChildren();
    state.history.forEach(item => {
      const entry = document.createElement('li');
      entry.dataset.sequence = String(item.sequence);
      entry.dataset.status = item.assessment.status;
      const label = lesson.SCENARIOS.find(value => value.id === item.scenarioId).label;
      entry.textContent = `Run ${item.sequence}: ${label}; ${item.actionId}; internal success; external ${item.assessment.status}; ${item.externalMs === null ? 'duration unknown' : `${item.externalMs} synthetic ms`}; ${item.assessment.eligible ? 'synthetic eligible' : 'not eligible'}.`;
      history.append(entry);
    });
    text('history-note', `${counts.total} of ${lesson.MAX_RUNS} session records retained. Reset preserves negative/unknown results and the allowance.`);
  }

  function clearError() {
    error.hidden = true;
    error.textContent = '';
  }

  function showError(caught) {
    error.textContent = `${caught instanceof Error ? caught.message : 'Unexpected lesson error'}. No record added; prior history retained.`;
    error.hidden = false;
    error.focus();
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      state = lesson.run(state, { scenarioId: fixture.value, actionId: action.value });
      clearError();
      render();
    } catch (caught) {
      showError(caught);
    }
  });

  document.getElementById('reset-lesson').addEventListener('click', () => {
    try {
      state = lesson.reset(state);
      form.reset();
      clearError();
      render();
      fixture.focus();
    } catch (caught) {
      showError(caught);
    }
  });

  render();
}());
