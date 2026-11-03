(function () {
  'use strict';
  const lesson = window.S033Affinity.createLesson();
  const form = document.getElementById('lesson-controls');
  const action = document.getElementById('lesson-action');
  const observation = document.getElementById('lesson-observation');
  const error = document.getElementById('input-error');
  const stepButton = document.getElementById('step-lesson');
  const labels = {
    probe: 'Probe current routing',
    externalize: 'Externalize and verify state',
    'remove-affinity': 'Remove worker affinity',
    'restore-affinity': 'Restore worker affinity',
    'preview-unsafe': 'Preview unsafe off + local order (not applied)',
  };

  function text(id, value) {
    document.getElementById(id).textContent = String(value);
  }

  function record(value) {
    return value === null ? 'NO REQUIRED STATE' : `cart=${value.cart}, step=${value.step}, revision=${value.revision}`;
  }

  function synchronizeObservation() {
    observation.disabled = !['probe', 'externalize'].includes(action.value);
    if (observation.disabled) observation.value = 'complete';
    text('observation-hint', observation.disabled
      ? 'This guarded action uses complete evidence; choose Probe or Externalize to inject an observation fault.'
      : 'Mismatch changes one revision; missing withholds one response or migration receipt. Neither repairs stored state.');
  }

  function renderTrace(event) {
    const body = document.getElementById('trace-body');
    const rows = [];
    if (event && event.trace.length) {
      for (const row of event.trace) {
        const tr = document.createElement('tr');
        for (const value of [
          row.client, row.worker, row.httpStatus === undefined ? 'n/a' : row.httpStatus === null ? 'unknown' : row.httpStatus,
          record(row.expected), record(row.observed), `${row.outcome}: ${row.reason}`,
        ]) {
          const cell = document.createElement('td');
          cell.textContent = String(value);
          tr.append(cell);
        }
        rows.push(tr);
      }
    } else {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.textContent = 'No requests issued. A routing guard is not a user-continuity probe.';
      tr.append(td);
      rows.push(tr);
    }
    body.replaceChildren(...rows);
  }

  function renderHistory(snapshot) {
    const list = document.getElementById('history-list');
    const entries = snapshot.history.map((event) => {
      const item = document.createElement('li');
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = `Step ${event.sequence}: ${labels[event.action]} — ${event.verdict} (${event.kind})`;
      const paragraph = document.createElement('p');
      paragraph.textContent = `${event.message} Before: ${event.before.storage}/${event.before.affinity}; after: `
        + `${event.after.storage}/${event.after.affinity}. User impact: ${event.userImpact}. `
        + `${event.metrics.preserved}/${event.metrics.attempted} preserved, ${event.metrics.failed} failed, `
        + `${event.metrics.unknown} unknown ${event.unit}.`;
      const trace = document.createElement('pre');
      trace.textContent = JSON.stringify(event.trace, null, 2);
      details.append(summary, paragraph, trace);
      item.append(details);
      return item;
    });
    list.replaceChildren(...entries);
    text('history-summary', `${snapshot.summary.success} success, ${snapshot.summary.failure} failure, `
      + `${snapshot.summary.unknown} unknown actions retained. Counterexamples are hypothetical, not applied. `
      + 'Later success never erases earlier evidence.');
  }

  function render() {
    const snapshot = lesson.view();
    const event = snapshot.last;
    text('run-state', `Run ${snapshot.runNumber} · affinity ${snapshot.affinity} · ${snapshot.storage} state · `
      + `migration ${snapshot.verified ? 'verified' : 'unverified'} · ${snapshot.stepsRemaining} steps remaining`);
    const result = document.getElementById('result');
    result.dataset.verdict = event ? event.verdict : 'untested';
    result.textContent = event ? `${event.verdict.toUpperCase()} — ${event.message}`
      : 'UNTESTED — Start with a pinned baseline. No state migration or continuity result has been established.';
    text('user-impact', event ? `User impact: ${event.userImpact}. Applied state change: ${event.applied ? 'yes' : 'no'}.`
      : 'User impact: untested. Reset deliberately clears this in-memory run; it is not a migration or repair.');
    const metrics = event ? event.metrics : { attempted: 0, preserved: 0, failed: 0, unknown: 0 };
    for (const name of ['attempted', 'preserved', 'failed', 'unknown']) text(`count-${name}`, metrics[name]);
    text('metric-unit', event ? `Measurement unit: ${event.unit}` : 'Measurement unit: none');
    stepButton.disabled = snapshot.stepsRemaining === 0;
    text('capacity-hint', snapshot.stepsRemaining ? 'Maximum 16 steps. Earlier outcomes stay until an explicit reset.'
      : 'Run full: all 16 steps are retained. Reset deliberately to begin another run.');
    renderTrace(event);
    renderHistory(snapshot);
  }

  function clearError() {
    error.textContent = '';
    error.hidden = true;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      lesson.step({ action: action.value, observation: observation.value });
      clearError();
      render();
    } catch (failure) {
      error.textContent = `Input rejected: ${failure.message} Last valid result and history are unchanged.`;
      error.hidden = false;
      error.focus();
    }
  });

  action.addEventListener('change', synchronizeObservation);
  document.getElementById('reset-lesson').addEventListener('click', () => {
    form.reset();
    lesson.reset();
    clearError();
    synchronizeObservation();
    render();
    action.focus();
  });

  synchronizeObservation();
  render();
}());
