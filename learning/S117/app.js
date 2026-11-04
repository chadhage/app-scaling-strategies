(function () {
  'use strict';
  const lesson = globalThis.S117Lesson;
  const byId = id => document.getElementById(id);
  const form = byId('exercise-form');
  const fields = {
    fixtureId: byId('fixture-choice'),
    journey: byId('journey-choice'),
    policy: byId('policy-choice'),
    samples: byId('sample-count')
  };
  const alert = byId('error-message');
  let state;
  try {
    if (!lesson || ['createState', 'parseInput', 'rehearse'].some(name => typeof lesson[name] !== 'function')) {
      throw new Error('Required local model is unavailable. Reopen the complete lesson folder; no measurement was made.');
    }
    state = lesson.createState();
  } catch (failure) {
    alert.textContent = failure.message;
    alert.hidden = false;
    byId('result-status').textContent = 'Startup unavailable. No rehearsal or recovery has been measured.';
    return;
  }

  function text(id, value) {
    byId(id).textContent = value;
  }

  function cell(value) {
    const element = document.createElement('td');
    element.textContent = String(value);
    return element;
  }

  function row(values) {
    const element = document.createElement('tr');
    element.append(...values.map(cell));
    return element;
  }

  function clearError() {
    alert.hidden = true;
    alert.textContent = '';
    for (const field of Object.values(fields)) field.removeAttribute('aria-invalid');
  }

  function showError(failure) {
    alert.textContent = failure instanceof Error ? failure.message : 'Lesson could not run. Reset lesson and try again.';
    alert.hidden = false;
    const field = fields[failure.field];
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    } else {
      byId('reset-button').focus();
    }
  }

  function renderHistory() {
    const entries = state.history.map(result => {
      const item = document.createElement('li');
      item.className = 'history-entry';
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = `Run ${result.id}: ${result.input.fixtureId} / ${result.input.journey} / ${result.input.policy} — ${result.verdict}; ${result.metrics.completed}/${result.metrics.attempted} completed; route ${result.route.selected || 'none'}`;
      const message = document.createElement('p');
      message.textContent = result.message;
      const measured = document.createElement('p');
      measured.textContent = `Diagnosis ${result.diagnosis.status}: ${result.diagnosis.affectedPath}. Failed ${result.metrics.failed}, unknown ${result.metrics.unknown}; shallow samples ${result.probes.map(probe => `${probe.region} HTTP ${probe.httpStatus}`).join(', ')}.`;
      details.append(summary, message, measured);
      item.append(details);
      return item;
    });
    byId('history').replaceChildren(...entries);
    text('history-status', `${state.history.length} / 8 runs. Reset or reload clears this in-memory history.`);
  }

  function render(result) {
    byId('result-panel').hidden = false;
    text('result-status', `Run ${result.id}: ${result.verdict}. ${state.history.length} synthetic run(s) retained; phase ${state.phase}.`);
    text('result-message', result.message);
    text('verdict', result.verdict);
    text('diagnosis', result.diagnosis.status);
    text('affected-path', result.diagnosis.affectedPath);
    text('selected-route', result.route.selected || 'none');
    text('completed-count', `${result.metrics.completed} / ${result.metrics.attempted}`);
    text('failed-count', `${result.metrics.failed} failed / ${result.metrics.unknown} unknown`);
    text('elapsed-time', result.metrics.syntheticElapsedMs === null ? 'unknown (no fabricated latency)' : `${result.metrics.syntheticElapsedMs} synthetic ms`);
    text('route-reason', result.route.reason);
    text('result-limit', result.limit);
    byId('probe-rows').replaceChildren(...result.probes.map(probe => row([
      probe.label, probe.httpStatus, probe.inventory, probe.catalogCache, probe.readiness,
      `${probe.network} / ${probe.authorization} / ${probe.state}`
    ])));
    byId('sample-rows').replaceChildren(...result.samples.map(sample => row([
      sample.sequence, `${sample.region || 'none'} -> ${sample.dependency} -> ${sample.journey}`,
      sample.outcome, sample.latencyMs === null ? 'unknown' : sample.latencyMs,
      `${sample.identity} / version ${sample.stateVersion}`
    ])));
    renderHistory();
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    clearError();
    try {
      const input = lesson.parseInput({
        fixtureId: fields.fixtureId.value,
        journey: fields.journey.value,
        policy: fields.policy.value,
        sampleText: fields.samples.value
      });
      const next = lesson.rehearse(state, input);
      state = next.state;
      render(next.result);
    } catch (failure) {
      showError(failure);
    }
  });

  byId('reset-button').addEventListener('click', () => {
    form.reset();
    state = lesson.createState();
    clearError();
    byId('result-panel').hidden = true;
    for (const id of ['result-message', 'verdict', 'diagnosis', 'affected-path', 'selected-route', 'completed-count', 'failed-count', 'elapsed-time', 'route-reason', 'result-limit']) text(id, '');
    byId('probe-rows').replaceChildren();
    byId('sample-rows').replaceChildren();
    text('result-status', 'No rehearsal run. No measurement or recovery has been claimed.');
    renderHistory();
    fields.fixtureId.focus();
  });
  byId('startup-note').hidden = true;
  byId('run-button').disabled = false;
  byId('reset-button').disabled = false;
})();
