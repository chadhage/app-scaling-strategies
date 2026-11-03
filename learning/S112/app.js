(function () {
  'use strict';

  const fixtures = globalThis.S112Fixtures;
  const lesson = globalThis.S112Lesson;
  let state = lesson.createState();
  const byId = (id) => document.getElementById(id);
  const actionButtons = {
    load: 'load-fixture', 'verify-placement': 'verify-placement', isolate: 'isolate',
    measure: 'measure', restore: 'restore', 'check-recovery': 'check-recovery', reset: 'reset-lesson',
  };
  const nextFocus = {
    idle: 'fixture', prepared: 'verify-placement', 'placement-verified': 'confirm-isolation',
    isolated: 'measure', measured: 'restore', restored: 'check-recovery', recovered: 'reset-lesson',
  };

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function metric(list, label, value) {
    list.append(element('dt', label), element('dd', value));
  }

  function renderResult(target, result) {
    target.replaceChildren();
    target.removeAttribute('data-verifier');
    if (!result) {
      target.append(element('p', 'No measurement yet; no result is inferred.'));
      return;
    }
    target.dataset.verifier = result.verifier;
    const list = element('dl');
    metric(list, 'Verifier (synthetic)', result.verifier);
    metric(list, 'Journey impact (synthetic)', result.userImpact);
    metric(list, 'Expected lesson check', `${result.expectedVerifier}; ${result.expectationMatched ? 'matched' : 'NOT matched'}. This does not relabel a failed verifier.`);
    metric(list, 'Measured fictional compute capacity', `${result.computeCapacity} units / ${result.demand} required`);
    metric(list, 'Observed fictional data capacity', result.dataCapacity === null ? 'unknown; not zero or configured capacity' : `${result.dataCapacity} units / ${result.demand} required`);
    metric(list, 'Observed fictional data replicas', result.dataReplicas === null ? 'unknown' : result.dataReplicas);
    metric(list, 'Fictional available zones', result.survivingZoneIds.join(', '));
    metric(list, 'Attempted / succeeded / interrupted / unknown',
      `${result.counts.attempted} / ${result.counts.succeeded} / ${result.counts.interrupted} / ${result.counts.unknown}`);
    metric(list, 'Budget', `${result.budgetTicks} fixed teaching ticks; not elapsed time`);
    target.append(list);
    const wrap = element('div');
    wrap.className = 'table-wrap';
    const table = element('table');
    table.append(element('caption', 'All four fixed fictional profile journeys; no real requests are sent'));
    const head = element('thead');
    const headings = element('tr');
    ['Journey / profile', 'Fictional route', 'Outcome', 'Data outcome', 'Fixed ticks', 'Reason'].forEach((title) => {
      const cell = element('th', title);
      cell.scope = 'col';
      headings.append(cell);
    });
    head.append(headings);
    const body = element('tbody');
    result.journeys.forEach((journey) => {
      const row = element('tr');
      row.dataset.journeyOutcome = journey.outcome;
      [
        `${journey.id} / ${journey.profileId}`, journey.zoneId ?? 'none',
        journey.outcome, journey.dataOutcome, journey.latencyTicks ?? 'unknown', journey.reason,
      ].forEach((value) => row.append(element('td', value)));
      body.append(row);
    });
    table.append(head, body);
    wrap.append(table);
    target.append(wrap);
  }

  function render() {
    const active = state.active;
    const allowed = lesson.allowedActions(state);
    Object.entries(actionButtons).forEach(([action, id]) => {
      byId(id).disabled = !allowed.includes(action);
    });
    byId('fixture').disabled = state.phase !== 'idle';
    byId('zone').disabled = state.phase !== 'idle';
    byId('confirm-isolation').disabled = state.phase !== 'placement-verified';
    byId('phase').textContent = state.phase;
    byId('phase').dataset.phase = state.phase;
    byId('placement').textContent = active?.placement?.status ?? 'not checked; no real placement verification';
    byId('cleanup').textContent = active?.cleanup ?? 'no-live-resources; no current fictional isolation';
    byId('status').textContent = `Phase ${state.phase}. ${state.history.length} of ${fixtures.historyLimit} fictional runs archived. ${state.history.length === fixtures.historyLimit ? 'History bound reached; reopen the page for a new teaching session.' : `Permitted actions: ${allowed.join(', ')}. Other steps require their preceding phase.`}`;
    byId('topology-description').textContent = active
      ? fixtures.fixtures[active.fixtureId].dataTopology : 'Load a fixture to inspect its teaching records.';
    const topology = byId('topology');
    topology.replaceChildren();
    active?.records.forEach((record) => {
      const row = element('tr');
      row.dataset.zone = record.zoneId;
      row.dataset.available = String(record.available);
      [
        record.zoneId, `${record.workloadId} / ${record.dataId}`, record.computeCapacity,
        record.configuredDataCapacity, record.dataObservation,
        record.available ? 'available fictional record' : 'isolated fictional record',
      ].forEach((value) => row.append(element('td', value)));
      topology.append(row);
    });
    renderResult(byId('measurement'), active?.measurement);
    renderResult(byId('recovery'), active?.recovery);
    byId('trace').replaceChildren();
    active?.events.forEach((entry) => byId('trace').append(element('li', `${entry.sequence}. ${entry.action}: ${entry.detail}`)));
    const history = byId('history');
    history.replaceChildren();
    state.history.forEach((run) => {
      const item = element('li');
      item.dataset.runId = run.id;
      item.dataset.originalVerifier = run.measurement?.verifier ?? 'not-attempted';
      item.append(element('h3', `${run.id} / ${run.fixtureId} / ${run.zoneId} (fictional)`));
      item.append(element('p', `${run.completion}; cleanup: ${run.cleanup}`));
      const original = element('div');
      original.className = 'archived-original';
      renderResult(original, run.measurement);
      item.append(original);
      if (run.recovery) {
        const recovery = element('div');
        recovery.className = 'archived-recovery';
        recovery.append(element('p', 'Separate recovery; original outcome retained.'));
        const result = element('div');
        renderResult(result, run.recovery);
        recovery.append(result);
        item.append(recovery);
      }
      const actions = element('ol');
      run.events.forEach((entry) => actions.append(element('li', `${entry.sequence}. ${entry.action}: ${entry.detail}`)));
      item.append(actions);
      history.append(item);
    });
  }

  function apply(command) {
    try {
      const next = lesson.reduce(state, command);
      state = next;
      byId('error').hidden = true;
      byId('error').textContent = '';
      if (command.type === 'load' || command.type === 'reset') byId('confirm-isolation').checked = false;
      if (command.type === 'reset') {
        byId('fixture').value = 'redundant';
        byId('zone').value = 'zone-a';
      }
      render();
      byId(nextFocus[state.phase]).focus();
    } catch (error) {
      byId('error').textContent = `${error.code ?? 'ERR_LESSON'}: ${error.message}`;
      byId('error').hidden = false;
      byId('error').focus();
    }
  }

  byId('setup-form').addEventListener('submit', (event) => {
    event.preventDefault();
    apply({ type: 'load', fixtureId: byId('fixture').value, zoneId: byId('zone').value });
  });
  ['verify-placement', 'measure', 'restore', 'check-recovery'].forEach((type) => {
    byId(type).addEventListener('click', () => apply({ type }));
  });
  byId('isolate').addEventListener('click', () => apply({
    type: 'isolate', confirmed: byId('confirm-isolation').checked,
  }));
  byId('reset-lesson').addEventListener('click', () => apply({ type: 'reset' }));
  render();
}());
