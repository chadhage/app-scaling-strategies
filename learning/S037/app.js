(function () {
  'use strict';
  const api = window.SessionSerialization;
  const lesson = api.createLesson();
  const byId = (id) => document.getElementById(id);
  const form = byId('controls');
  const error = byId('error');
  function text(id, value) { byId(id).textContent = value; }
  function clearError() { error.hidden = true; error.textContent = ''; }
  function render() {
    const state = lesson.snapshot();
    const result = state.current;
    const capped = state.history.length >= state.limits.actions;
    byId('conditions').disabled = state.activeVersion === 'v2' || capped;
    byId('transition').disabled = state.activeVersion !== 'v1' || capped;
    byId('rollback').disabled = state.activeVersion !== 'v2' || capped;
    byId('restart').disabled = state.run >= state.limits.runs;
    text('state', `Run ${state.run} · Active synthetic version ${state.activeVersion} · ${state.history.length}/12 recorded actions.`);
    text('verdict', result ? `${result.verdict.toUpperCase()} — ${result.applied
      ? `${result.action} applied after all required reads matched.`
      : 'transition blocked before exposure; retained fixture unchanged.'}`
      : 'Unknown — no read probes recorded in this run.');
    text('counts', result ? `${result.readCount} read probes: ${result.successful} preserved / ${result.failed} failed / ${result.unknown} unknown. Silent resets detected: ${result.resetSignals}.`
      : '0 read probes: no preservation or migration evidence.');
    text('impact', result ? `User outcome: ${result.userOutcome}. ${result.cleanup}`
      : 'User outcome: unverified. No resources created.');
    text('expected', JSON.stringify(api.EXPECTED, null, 2));
    text('fixture', state.fixturePayload);
    text('existing', result ? result.existingPayload === null ? '(unavailable — unknown)' : result.existingPayload : '(not sampled)');
    text('candidate', result ? result.writerPayload : '(not produced)');
    const rows = byId('probe-rows');
    rows.replaceChildren();
    if (result) {
      for (const probe of result.rows) {
        const row = document.createElement('tr');
        for (const value of [
          probe.name, probe.status,
          `${probe.reason}${probe.observed ? ` Observed: ${JSON.stringify(probe.observed)}` : ''}`,
        ]) {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.append(cell);
        }
        rows.append(row);
      }
    }
    text('totals', `All retained runs: ${state.totals.successful} preserved / ${state.totals.failed} failed / ${state.totals.unknown} unknown read probes; ${state.totals.resetSignals} silent resets detected.`);
    const history = byId('history');
    history.replaceChildren();
    for (const entry of state.history) {
      const item = document.createElement('li');
      const summary = document.createElement('p');
      summary.textContent = `#${entry.attempt} · Run ${entry.run} · ${entry.action} · ${entry.verdict.toUpperCase()} · ${entry.activeBefore} → ${entry.activeAfter} · ${entry.successful}/${entry.failed}/${entry.unknown} preserved/failed/unknown · ${entry.userOutcome}.`;
      const detail = document.createElement('details');
      const title = document.createElement('summary');
      title.textContent = `Configuration and read evidence for action ${entry.attempt}`;
      const data = document.createElement('pre');
      data.textContent = JSON.stringify(entry, null, 2);
      detail.append(title, data);
      item.append(summary, detail);
      history.append(item);
    }
  }
  function execute(action) {
    try {
      action();
      clearError();
      render();
    } catch (problem) {
      error.textContent = problem.message;
      error.hidden = false;
      error.focus();
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    execute(() => lesson.transition({
      reader: byId('reader').value,
      writer: byId('writer').value,
      payload: byId('payload').value,
    }));
  });
  byId('rollback').addEventListener('click', () => execute(() => lesson.rollback()));
  byId('restart').addEventListener('click', () => execute(() => {
    lesson.reset();
    form.reset();
    render();
    byId('reader').focus();
  }));
  render();
}());
