'use strict';

(() => {
  const model = globalThis.S113Model;
  const get = (id) => document.getElementById(id);
  const text = (id, value) => { get(id).textContent = value; };
  const form = get('operator-form');
  const fixture = get('fixture');
  const errorBox = get('error');
  const status = get('status');
  const controlIds = { begin: 'begin-run', warm: 'warm-capacity', sync: 'synchronize-state',
    handoff: 'transfer-writer', migrate: 'migrate-traffic', reset: 'reset-lesson' };
  const display = (value) => value === null ? 'UNKNOWN' : typeof value === 'boolean' ? value ? 'YES' : 'NO' : String(value);
  if (!model) {
    errorBox.textContent = 'The local model did not load. Open the complete bundle; no result is available.';
    errorBox.hidden = false;
    get('begin-run').disabled = true;
    return;
  }
  let state = model.createState();
  const clearError = () => { errorBox.hidden = true; errorBox.textContent = ''; };
  function render() {
    const current = state.current;
    const enabled = model.controls(state);
    fixture.disabled = !enabled.fixture;
    for (const [action, id] of Object.entries(controlIds)) get(id).disabled = !enabled[action];
    text('run-budget', `Runs: ${state.runCount}/${model.CONTRACT.maxRuns}; retained events: ${state.history.length}/${model.CONTRACT.maxHistoryEvents}.`);
    for (const [name, key] of [['capacity', 'capacity'], ['state', 'state'], ['fence', 'fence'],
      ['routes', 'routes'], ['journeys', 'journeys']]) {
      const observation = current && current[key];
      text(`${name}-result`, observation ? observation.result.toUpperCase() : 'UNKNOWN');
      get(`${name}-result`).dataset.result = observation ? observation.result : 'unknown';
      text(`${name}-detail`, observation ? observation.detail : 'Not read — UNKNOWN, not success or zero.');
    }
    text('owner', current
      ? `${current.owner} — epoch ${current.ownerEpoch}; ${current.handoff === 'approved' ? 'exclusive fixture handoff approved' : 'source decision retained; consult measured fence gate'}`
      : 'region-amber — source writer epoch 7 (declared baseline, not measured readiness)');
    text('evacuation', current ? `${current.evacuation} — fixture scope only` : 'UNVERIFIED');
    text('source-origin', current && !current.sourceRetained ? 'EVACUATED in the fixed fixture only' : 'RETAINED');
    text('metrics', current && current.journeys ? current.journeys.detail
      : 'Successful: 0; interrupted: 0; unknown: 2; effects: UNKNOWN. No journey samples read.');
    const samples = current && current.journeys ? current.journeys.samples
      : ['profile-read', 'session-write'].map((id) => ({ id, route: null, response: null,
        latencyMs: null, session: null, effects: null, result: 'unknown' }));
    const rows = samples.map((sample) => {
      const row = document.createElement('tr');
      row.dataset.journey = sample.id;
      row.dataset.result = sample.result;
      for (const value of [sample.id, display(sample.route), display(sample.response),
        sample.latencyMs === null ? 'UNKNOWN' : `${sample.latencyMs} ms`,
        display(sample.session), display(sample.effects), sample.result.toUpperCase()]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    });
    get('samples').replaceChildren(...rows);
    get('history').replaceChildren(...state.history.map((event) => {
      const item = document.createElement('li');
      item.dataset.run = String(event.run);
      item.dataset.action = event.action;
      item.dataset.result = event.result;
      item.textContent = `${event.index}. Run ${event.run} (${event.fixtureId}) · ${model.ACTION_LABELS[event.action]} · ${event.result.toUpperCase()} · ${event.detail}`;
      return item;
    }));
    const last = state.history.at(-1);
    status.dataset.result = last ? last.result : 'unknown';
    status.textContent = last ? last.detail : 'Choose a fixture. No observations yet. Fixed teaching DATA ONLY.';
  }
  function focusNext() {
    const enabled = model.controls(state);
    const next = ['warm', 'sync', 'handoff', 'migrate'].find((action) => enabled[action]);
    (next ? get(controlIds[next]) : enabled.fixture ? fixture : get('reset-lesson')).focus();
  }
  function apply(input) {
    try {
      const next = model.step(state, input);
      state = next;
      clearError();
      render();
      focusNext();
    } catch (error) {
      render();
      errorBox.textContent = error instanceof model.LessonError
        ? error.message : 'The rehearsal could not proceed. Reset and choose a listed fixed trace.';
      errorBox.hidden = false;
      errorBox.focus();
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    apply({ action: 'begin', fixtureId: fixture.value });
  });
  for (const action of ['warm', 'sync', 'handoff', 'migrate']) {
    get(controlIds[action]).addEventListener('click', () => apply({ action }));
  }
  get('reset-lesson').addEventListener('click', () => {
    state = model.createState();
    form.reset();
    clearError();
    render();
    fixture.focus();
  });
  render();
})();
