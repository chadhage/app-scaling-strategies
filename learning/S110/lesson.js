'use strict';

(function conduct() {
  const { createState, apply, FIXTURES, LIMITS } = EdgePropagationLesson;
  const byId = (id) => document.getElementById(id);
  const form = byId('operator-form');
  const fixture = byId('fixture');
  const error = byId('error');
  let state = createState();
  const text = (id, value) => { byId(id).textContent = value; };
  const upper = (value) => value.toUpperCase();
  const metricsText = (metrics) => `Attempted: ${metrics.attempted}; observed: ${metrics.observed}; successful: ${metrics.successful}; interrupted: ${metrics.interrupted}; unknown: ${metrics.unknown}; pending: ${metrics.pending}; migrated: ${metrics.migrated}/3.`;

  function render() {
    const active = state.active;
    fixture.disabled = Boolean(active && active.phase !== 'complete');
    byId('propagate-edge').disabled = fixture.disabled || state.runs >= LIMITS.maxRuns;
    byId('sample-pops').disabled = !active || active.phase !== 'changed';
    byId('retire-safely').disabled = !active || active.phase === 'complete'
      || (active.phase === 'changed' && active.checkedWithoutSamples);
    const result = active ? active.result : 'unknown';
    byId('status').dataset.result = result;
    text('status', active ? active.reason : 'Ready. Choose a trace. All observations are pending.');
    text('nominal', active ? `Epoch ${active.desiredEpoch}; ${active.desiredPercent}% to ${active.desiredOrigin} (desired DATA ONLY).` : 'No change rehearsed.');
    for (const [id, key] of [['propagation-gate', 'propagation'], ['drain-gate', 'drain'], ['journey-gate', 'journeys']]) {
      text(id, upper(active ? active.gates[key] : 'unknown'));
    }
    text('old-origin', active ? `${upper(active.oldOrigin)} (fictional); observed old work: ${active.oldWork === null ? 'UNKNOWN' : active.oldWork}.` : 'RETAINED (fictional); no work observation.');
    text('decision', active ? upper(active.decision) : 'NOT-CHECKED');
    text('metrics', metricsText(active ? active.metrics
      : { attempted: 0, observed: 0, successful: 0, interrupted: 0, unknown: 0, pending: 3, migrated: 0 }));
    text('history-count', `${state.history.length} events; ${state.runs}/6 runs.`);
    const samples = active && active.samples.length ? active.samples : FIXTURES.converged.samples.map((item) =>
      ({ ...item, effectiveEpoch: null, effectiveOrigin: null, response: null, latencyMs: null }));
    const rows = samples.map((item) => {
      const row = document.createElement('tr');
      row.dataset.pop = item.pop;
      const unknown = [item.effectiveEpoch, item.effectiveOrigin, item.response, item.latencyMs].includes(null);
      const result = unknown ? 'UNKNOWN' : item.response === 200 && item.latencyMs <= LIMITS.latencyBudgetMs ? 'POSITIVE' : 'NEGATIVE';
      const values = [
        `${item.pop} / ${item.cohort}`, item.effectiveEpoch === null ? 'UNKNOWN' : item.effectiveEpoch,
        item.effectiveOrigin === null ? 'UNKNOWN' : item.effectiveOrigin,
        item.response === null ? 'UNKNOWN' : item.response,
        `${item.latencyMs === null ? 'UNKNOWN' : item.latencyMs} / ${LIMITS.latencyBudgetMs}`, result,
      ];
      for (const [index, value] of values.entries()) {
        const cell = document.createElement(index === 0 ? 'th' : 'td');
        if (index === 0) cell.scope = 'row';
        cell.textContent = String(value);
        row.append(cell);
      }
      return row;
    });
    byId('samples').replaceChildren(...rows);
    const events = state.history.map((event) => {
      const item = document.createElement('li');
      const snapshot = event.snapshot;
      item.dataset.result = snapshot.result;
      item.dataset.action = event.command.type;
      item.textContent = `Event ${event.seq}, run ${snapshot.run}: ${event.command.type}; ${FIXTURES[snapshot.fixture].label}. `
        + `Result ${upper(snapshot.result)}; propagation ${upper(snapshot.gates.propagation)}; drain ${upper(snapshot.gates.drain)}; journeys ${upper(snapshot.gates.journeys)}. `
        + `Old origin ${snapshot.oldOrigin}; old work ${snapshot.oldWork === null ? 'UNKNOWN' : snapshot.oldWork}; decision ${snapshot.decision}. `
        + `${metricsText(snapshot.metrics)} ${snapshot.reason}`;
      return item;
    });
    byId('history').replaceChildren(...events);
  }

  function perform(command) {
    try {
      const next = apply(state, command);
      state = next;
      error.hidden = true;
      error.textContent = '';
      render();
      if (state.active.phase === 'complete') {
        (state.runs >= LIMITS.maxRuns ? byId('restart-lesson') : fixture).focus();
      } else {
        (state.active.phase === 'sampled' ? byId('retire-safely') : byId('sample-pops')).focus();
      }
    } catch (failure) {
      error.textContent = `No action applied. ${failure.message}`;
      error.hidden = false;
      error.focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    perform({ type: 'propagate', fixture: fixture.value });
  });
  byId('sample-pops').addEventListener('click', () => perform({ type: 'sample' }));
  byId('retire-safely').addEventListener('click', () => perform({ type: 'check' }));
  byId('restart-lesson').addEventListener('click', () => {
    state = createState();
    form.reset();
    error.hidden = true;
    error.textContent = '';
    render();
    text('status', 'Reset complete. All in-memory runs and history cleared; observations are pending.');
    fixture.focus();
  });
  render();
}());
