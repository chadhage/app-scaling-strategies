(function () {
  'use strict';

  const lesson = globalThis.ArtifactHandoff.createLesson();
  const byId = (id) => document.getElementById(id);
  const form = byId('controls');
  const error = byId('error');
  const labels = {
    byteLength: 'Required byte count', bytes: 'Exact required bytes',
    checksum: 'Teaching checksum (FNV-1a-32)', checkpoint: 'Required workflow checkpoint',
  };
  const json = (value) => JSON.stringify(value, null, 2);
  function message(text) {
    error.textContent = text;
    error.hidden = false;
    error.focus();
  }
  function render() {
    const state = lesson.snapshot();
    const result = state.result;
    byId('state').textContent = `Run ${state.run}/12 · Owner ${state.owner} · Phase ${state.phase}`;
    byId('conditions').disabled = state.phase !== 'idle' || !state.canPrepare;
    byId('prepare').disabled = !state.canPrepare;
    byId('handoff').disabled = !state.canHandoff;
    byId('verify').disabled = !state.canVerify;
    byId('restart').disabled = !state.canReset;
    byId('verdict').textContent = result ? `${result.verdict.toUpperCase()} — artifact continuity` : 'UNKNOWN — current run not verified';
    byId('counts').textContent = result
      ? `Current: ${result.attempted} attempted / ${result.successful} successful / ${result.failed} failed / ${result.unknown} unknown`
      : 'Current: 0 attempted / 0 successful / 0 failed / 0 unknown';
    byId('response').textContent = result && result.observed
      ? `HTTP-like response ${result.responseStatus} · Bytes ${result.observed.byteLength}/${result.expected.byteLength}`
      : 'HTTP-like response: unobserved · Retrieved bytes: unobserved';
    byId('reason').textContent = result ? result.reason : 'Prepare, handoff and verify before drawing a conclusion.';
    byId('impact').textContent = `User impact: ${result ? result.impact : 'unverified'}`;
    byId('cleanup').textContent = result ? result.cleanup : 'Cleanup: no external resources exist.';
    byId('expected').textContent = state.expected ? json(state.expected) : 'Not prepared.';
    byId('observed').textContent = result && result.observed ? json(result.observed) : 'Not observed.';
    byId('checks').replaceChildren();
    for (const check of result ? result.checks : []) {
      const row = document.createElement('tr');
      for (const text of [labels[check.id], check.status]) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.append(cell);
      }
      byId('checks').append(row);
    }
    byId('trace').replaceChildren();
    for (const entry of state.trace) {
      const item = document.createElement('li');
      item.textContent = `${entry.step} · owner ${entry.owner} · ${entry.detail}`;
      byId('trace').append(item);
    }
    const totals = state.totals;
    byId('totals').textContent = `Lifetime: ${totals.attempted}/12 attempted / ${totals.successful} successful / ${totals.failed} failed / ${totals.unknown} unknown`;
    byId('history').replaceChildren();
    for (const entry of state.history) {
      const item = document.createElement('li');
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      const payload = document.createElement('pre');
      summary.textContent = `Run ${entry.run} · ${entry.verdict.toUpperCase()} · ${entry.config.kind} / ${entry.config.storage} / ${entry.config.observation}`;
      payload.textContent = json(entry);
      details.append(summary, payload);
      item.append(details);
      byId('history').append(item);
    }
  }
  function action(command, after) {
    try {
      command();
      error.hidden = true;
      error.textContent = '';
      render();
      if (after) after();
    } catch (failure) {
      message(failure.message);
    }
  }
  byId('prepare').addEventListener('click', () => action(() => lesson.prepare({
    kind: byId('kind').value, storage: byId('storage').value, observation: byId('observation').value,
  })));
  byId('handoff').addEventListener('click', () => action(() => lesson.handoff()));
  byId('verify').addEventListener('click', () => action(() => lesson.verify()));
  byId('restart').addEventListener('click', () => action(
    () => lesson.reset(), () => { form.reset(); byId('kind').focus(); },
  ));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    message('Use the named Prepare, Handoff or Verify buttons; form navigation is disabled.');
  });
  render();
}());
