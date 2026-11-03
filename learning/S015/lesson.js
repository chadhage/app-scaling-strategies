(function () {
  'use strict';
  const model = globalThis.ScaleInLesson;
  const byId = (id) => document.getElementById(id);
  const form = byId('fixture-form');
  let state = model.createRehearsal();
  const numericFields = {
    requestTicks: ['request-ticks', 8], jobTicks: ['job-ticks', 8],
    drainBudget: ['drain-budget', 10], workBudget: ['work-budget', 12]
  };
  const display = (value) => value === null ? 'UNKNOWN' : String(value);

  function rows(id, values) {
    const body = byId(id);
    body.replaceChildren();
    for (const cells of values) {
      const row = document.createElement('tr');
      for (const value of cells) {
        const cell = document.createElement('td');
        cell.textContent = display(value);
        row.appendChild(cell);
      }
      body.appendChild(row);
    }
  }

  function readConfig() {
    const config = { mechanism: byId('mechanism').value, condition: byId('condition').value };
    for (const [key, [id, max]] of Object.entries(numericFields)) {
      const field = byId(id);
      const raw = field.value;
      const valid = /^[1-9]\d?$/.test(raw) && Number(raw) <= max;
      field.setAttribute('aria-invalid', String(!valid));
      config[key] = valid ? Number(raw) : NaN;
    }
    return config;
  }

  function render() {
    byId('fixture-fields').disabled = state.phase !== 'IDLE';
    byId('start-rehearsal').disabled = state.phase !== 'IDLE';
    for (const [id, value] of Object.entries({
      clock: state.tick, capacity: state.actualCapacity, admission: state.admission,
      retirement: state.retiring, verdict: state.result.verifier,
      'work-outcome': state.result.workOutcome, cleanup: state.result.cleanup
    })) byId(id).textContent = display(value);
    const m = state.metrics;
    byId('work-metrics').textContent = `Original admitted work: ${m.attempted}. Successful: ${m.succeeded}; failed: ${m.failed}; unknown: ${m.unknown}; pending: ${m.pending}. Observed success fraction: ${m.observedSuccessRate === null ? 'not reported' : `${m.observedSuccessRate}%`}.`;
    byId('routing-metrics').textContent = `Fresh probes: ${state.probes.length}. Unintended new admissions to retiring-A: ${m.newToRetiring}. Rejected stale routes to retiring-A: ${m.rejectedToRetiring}.`;
    byId('action-status').textContent = `${state.lastAction.verdict}: ${state.lastAction.reason} Current verifier: ${state.result.verifier}; original work: ${state.result.workOutcome}.`;
    const error = byId('input-error');
    error.hidden = state.lastAction.verdict !== 'INVALID';
    error.textContent = error.hidden ? '' : state.lastAction.reason;
    rows('work-rows', state.work.map((item) => [
      item.id, item.owner, item.deadline, item.lifecycle, item.outcome, item.completedAt,
      item.effects, item.checkpoint ? `durable epoch ${item.checkpoint.epoch}, progress ${item.checkpoint.progress}` : item.checkpointProof
    ]));
    rows('assertion-rows', state.assertions.map((item) => [item.name, item.verdict, item.detail]));
    rows('probe-rows', state.probes.map((probe) => [
      probe.id, probe.tick, probe.owner, probe.accepted, probe.retirementState, probe.violation
    ]));
    rows('event-rows', state.events.map((event) => [
      event.sequence, event.tick, event.action, event.verdict, event.reason
    ]));
    byId('archive-summary').textContent = `Attempt ${state.run}; ${state.archives.length} of 4 previous attempts archived in this session.`;
    rows('archive-rows', state.archives.map((record) => [
      record.run, record.result.verifier, record.result.workOutcome,
      `${record.metrics.succeeded} / ${record.metrics.failed} / ${record.metrics.unknown}`
    ]));
    byId('run-evidence').textContent = JSON.stringify(state, null, 2);
  }

  function conduct(action, payload) {
    try {
      state = model.transition(state, action, payload);
      if (action === 'reset' && state.lastAction.verdict === 'PASS') {
        form.reset();
        byId('fault-consent').checked = false;
        for (const [id] of Object.values(numericFields)) byId(id).removeAttribute('aria-invalid');
      }
      render();
    } catch (error) {
      byId('verdict').textContent = 'ERROR';
      byId('input-error').hidden = false;
      byId('input-error').textContent = `Safety error: ${error.message}. No new result was verified.`;
      byId('action-status').textContent = 'The action failed; inspect retained evidence and reset.';
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    conduct('start', readConfig());
  });
  for (const button of document.querySelectorAll('button[data-action]')) {
    button.addEventListener('click', () => conduct(button.dataset.action,
      button.dataset.action === 'force-retire' ? { confirmed: byId('fault-consent').checked } : undefined));
  }
  render();
}());
