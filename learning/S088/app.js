(function () {
  'use strict';
  const model = globalThis.S088;
  const byId = (id) => document.getElementById(id);
  const form = byId('lesson-form');
  const decision = byId('decision');
  const response = byId('response');
  const run = byId('run-lesson');
  const reset = byId('reset-lesson');
  const error = byId('input-error');
  let state = model.createState();
  const text = (id, value) => { byId(id).textContent = String(value); };

  function clearError() {
    error.textContent = '';
    error.hidden = true;
  }
  function render() {
    const counts = model.totals(state);
    for (const [key, value] of Object.entries(counts)) text(`${key === 'attempted' ? 'attempt' : key}-count`, value);
    const entry = state.history.at(-1);
    const snapshot = entry ? entry.lastKnown : model.BASELINE;
    text('old-route', `${snapshot.routing.old}%`);
    text('candidate-route', `${snapshot.routing.candidate}%`);
    text('required-state', `revision ${snapshot.state.revision} · ${snapshot.state.requiredValue}`);
    const outcome = entry ? entry.operation.outcome : 'not-run';
    const verdict = entry ? entry.verifier.verdict : 'not-run';
    byId('operation-outcome').dataset.outcome = outcome;
    byId('verifier').dataset.verdict = verdict;
    text('operation-outcome', entry ? outcome : 'Not run');
    text('operation-detail', entry ? entry.operation.detail : 'No operation outcome has been observed.');
    text('verifier', entry ? verdict : 'Not run');
    text('verifier-reason', entry ? entry.verifier.reason : 'No migration or preserved-state observation is claimed before a rehearsal.');
    text('observation-label', !entry
      ? 'Baseline fixture only — not a new observation.'
      : entry.observed
        ? 'Observed effective routing and required state in this synthetic trace.'
        : 'Last known only — no new effective-routing or required-state observation.');
    text('response-trace', !entry
      ? 'No response fixture has been produced.'
      : entry.response ? JSON.stringify(entry.response, null, 2) : 'No response or effective-state observation. Outcome unknown.');
    const rows = state.history.map((item) => {
      const row = document.createElement('tr');
      for (const value of [
        item.sequence, item.input.decision, item.input.response,
        item.operation.outcome, item.response ? item.response.status : 'unknown',
        item.verifier.verdict,
        `${item.lastKnown.routing.old}% old / ${item.lastKnown.routing.candidate}% candidate (${item.observed ? 'observed' : 'last known only'})`,
        `revision ${item.lastKnown.state.revision} · ${item.lastKnown.state.requiredValue}`,
      ]) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      }
      return row;
    });
    byId('history').replaceChildren(...rows);
    byId('history-empty').hidden = state.history.length !== 0;
    run.disabled = state.history.length >= model.MAX_ATTEMPTS;
    text('limit-note', run.disabled
      ? 'Six-attempt limit reached. History is retained; reset explicitly to begin again.'
      : `${state.history.length} of six independent attempts recorded; failures and unknowns remain until explicit reset.`);
  }

  decision.addEventListener('change', () => {
    response.value = 'explicit';
    response.disabled = decision.value !== 'denied';
    clearError();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    try {
      state = model.attempt(state, { decision: decision.value, response: response.value });
      render();
    } catch (cause) {
      error.textContent = `Input/state rejected: ${cause.message} No rehearsal was recorded. History is unchanged.`;
      error.hidden = false;
    }
  });
  reset.addEventListener('click', () => {
    form.reset();
    response.disabled = false;
    state = model.createState();
    clearError();
    render();
    decision.focus();
  });
  render();
}());
