'use strict';

(function start() {
  const { createRun, act, inspect } = globalThis.S019Lesson;
  const byId = (id) => document.getElementById(id);
  const form = byId('operator-form');
  let state = createRun();
  let archives = [];
  let evicted = 0;
  const text = (id, value) => { byId(id).textContent = String(value); };
  const writes = (values) => values.length ? values.join(', ') : '(empty)';
  const row = (values) => {
    const result = document.createElement('tr');
    values.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      result.append(cell);
    });
    return result;
  };
  const clearError = () => {
    byId('input-error').hidden = true;
    text('input-error', '');
  };
  const error = (cause) => {
    text('input-error', cause.message);
    byId('input-error').hidden = false;
    byId('input-error').focus();
  };

  function render() {
    const summary = inspect(state);
    text('run-number', state.run);
    text('active-tenant', state.tenant);
    text('phase', summary.phase);
    text('verdict', summary.verdict);
    text('verdict-reason', summary.reason);
    text('counters', `${summary.attempts} attempts: ${summary.successful} success / ${summary.failed} failure / ${summary.unknown} unknown. ${summary.blocked} blocked controls; ${summary.fenceChecks} old-writer rejections; ${summary.completedBatches} healthy migrated batches. Actions ${state.trace.length}/48; journey batches ${state.journeys.length / 2}/8.`);
    text('capacity', `Allocated synthetic capacity ${summary.capacity.allocatedRps} rps; ready capacity ${summary.capacity.readyRps === null ? 'unknown (A still has 100 known rps)' : `${summary.capacity.readyRps} rps`}. Distinct workers: ${summary.capacity.workers.join(', ')}. B observation: ${state.observation}.`);
    text('synchronization', `Selected B copy ${summary.synchronized ? 'matches every acknowledged write' : 'is absent or stale'}. A copy retention does not authorize its old writer after fencing.`);
    byId('selected-tenant').value = state.tenant;
    byId('selected-tenant').disabled = state.trace.length > 0;
    byId('target-observation').value = state.observation;
    byId('tenant-rows').replaceChildren(...['alpha', 'beta'].map((tenant) => row([
      `${tenant}${tenant === state.tenant ? ' (selected)' : ' (unaffected)'}`,
      state.routes[tenant], `${state.owners[tenant].cell} / epoch ${state.owners[tenant].epoch}`,
      writes(state.expected[tenant]), writes(state.cells.A[tenant]), writes(state.cells.B[tenant])
    ])));
    byId('journey-rows').replaceChildren(...state.journeys.map((journey) => row([
      journey.batch, journey.tenant, `${journey.route} / ${journey.owner}`, journey.classification,
      journey.httpStatus === null ? 'unknown' : journey.httpStatus,
      `${journey.expectedRevision} / ${journey.observedRevision === null ? 'unknown' : journey.observedRevision}`,
      journey.acknowledgedWrite === null ? 'none' : journey.acknowledgedWrite
    ])));
    byId('trace').replaceChildren(...state.trace.map((event) => {
      const item = document.createElement('li');
      item.textContent = `${event.step}. ${event.action} — ${event.status}: ${event.detail}`;
      return item;
    }));
    text('history-status', `${archives.length}/4 archived runs; ${evicted} older runs evicted. Page memory only.`);
    byId('history').replaceChildren(...archives.map((archive) => {
      const details = document.createElement('details');
      const heading = document.createElement('summary');
      heading.textContent = `Run ${archive.state.run}: ${archive.summary.verdict}; ${archive.summary.failed} failure / ${archive.summary.unknown} unknown; tenant ${archive.state.tenant}`;
      const record = document.createElement('pre');
      record.textContent = JSON.stringify(archive, null, 2);
      details.append(heading, record);
      return details;
    }));
    text('run-evidence', JSON.stringify({
      cardId: 'A-S019', mode: 'synthetic-only', state, summary,
      archivedRuns: archives.length, evictedRuns: evicted,
      nativeProof: false, productionNode24Validated: false, parentComplete: false
    }, null, 2));
  }

  function dispatch(action) {
    try {
      const next = act(state, action);
      state = next;
      clearError();
      render();
      const event = state.trace.at(-1);
      text('action-status', action.type === 'select' && !event
        ? `Selected ${state.tenant}; no migration has been observed.`
        : `${event.status}: ${event.detail}`);
    } catch (cause) {
      render();
      error(cause);
    }
  }

  form.addEventListener('submit', (event) => event.preventDefault());
  byId('selected-tenant').addEventListener('change', (event) => dispatch({ type: 'select', tenant: event.target.value }));
  byId('target-observation').addEventListener('change', (event) => dispatch({ type: 'observe', value: event.target.value }));
  for (const button of form.querySelectorAll('button[data-action]')) {
    button.addEventListener('click', () => dispatch({ type: button.dataset.action }));
  }
  byId('archive-run').addEventListener('click', () => {
    try {
      const next = createRun({ run: state.run + 1 });
      archives = [{ state, summary: inspect(state) }, ...archives];
      if (archives.length > 4) {
        archives = archives.slice(0, 4);
        evicted += 1;
      }
      state = next;
      form.reset();
      clearError();
      render();
      text('action-status', 'Previous run archived with all observations; fresh source-only run is unknown.');
      byId('selected-tenant').focus();
    } catch (cause) {
      error(cause);
    }
  });
  render();
}());
