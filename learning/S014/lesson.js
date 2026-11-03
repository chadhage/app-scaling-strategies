'use strict';

(function conduct() {
  const model = globalThis.S014;
  const byId = (id) => document.getElementById(id);
  const form = byId('schedule-controls');
  let state = model.createState();

  function display(value) {
    if (value === null || value === undefined) return 'unknown / not observed';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  function row(values) {
    const element = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = display(value);
      element.append(cell);
    }
    return element;
  }

  function countsText(clients) {
    const counts = { successful: 0, interrupted: 0, unknown: 0 };
    for (const client of clients) counts[client.outcome] += 1;
    return `${clients.length} total; ${counts.successful} successful; ${counts.interrupted} interrupted; ${counts.unknown} unknown`;
  }

  function renderAssessments(run) {
    const container = byId('assessments');
    container.replaceChildren();
    if (!run?.assessments.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No assessment yet; an empty sample is not 100% success.';
      container.append(empty);
      return;
    }
    for (const assessment of run.assessments) {
      const heading = document.createElement('h4');
      heading.textContent = `Check ${assessment.sequence} at ${assessment.at} s: ${assessment.verdict.toUpperCase()} (synthetic only)`;
      const metrics = document.createElement('p');
      const count = assessment.metrics;
      metrics.textContent = `${count.total} sampled; ${count.successful} successful; ${count.interrupted} interrupted; ${count.unknown} unknown. Known-success fraction: ${count.successFraction === null ? 'not measured (empty sample)' : `${count.successful}/${count.total}`}. Window complete: ${count.windowComplete}.`;
      const list = document.createElement('ul');
      for (const check of assessment.checks) {
        const item = document.createElement('li');
        item.textContent = `${check.status.toUpperCase()} — ${check.label}. Observed: ${display(check.observed)}. Required: ${check.expected}.`;
        list.append(item);
      }
      container.append(heading, metrics, list);
    }
  }

  function render() {
    const run = model.current(state);
    const totals = model.summary(state);
    byId('status').textContent = state.message;
    const invalid = state.actions.at(-1)?.disposition === 'invalid';
    byId('input-errors').hidden = !invalid;
    byId('input-errors').textContent = invalid ? state.message : '';
    byId('advance-clock').disabled = !run || run.finished;
    byId('check-outcome').disabled = !run;
    byId('observed-clock').textContent = `${run?.now || 0} s`;
    byId('requested-units').textContent = run ? String(run.config.target) : '—';
    byId('deployed-units').textContent = display(run?.deployed ?? model.CONTRACT.baseline);
    byId('ready-units').textContent = run ? display(run.ready) : '2';
    byId('eligible-units').textContent = run ? display(run.eligible) : '2';
    byId('first-ready').textContent = run?.firstReadyAt !== null && run ? `${run.firstReadyAt} s` : 'Not observed';
    byId('attempt-plan').textContent = run
      ? `${run.id}: demand ${run.config.demand} requests/s during [${run.config.demandAt}, ${run.endAt}) s. Planned trigger ${run.triggerAt} s; planned ready ${run.plannedReadyAt} s (NOT observed proof). Schedule observation: ${run.scheduleState}.`
      : 'No calendar scheduled.';
    const verdict = !run ? 'No outcome yet.'
      : !run.assessments.length && run.verdict !== 'unsupported' ? 'Not checked — incomplete evidence'
        : `${run.verdict.toUpperCase()} — synthetic only`;
    byId('outcome').textContent = verdict;
    byId('outcome').className = `outcome ${run?.verdict || 'incomplete'}`;
    byId('trace-rows').replaceChildren(...(run?.trace || []).map((item) => row([
      item.at, item.event, item.requested, item.deployed, item.ready,
      item.eligible, item.effectiveRps, item.detail,
    ])));
    byId('client-rows').replaceChildren(...(run?.clients || []).map((item) => row([
      item.id, item.observedAt, item.outcome, item.completed,
      item.latencyMs, item.payloadCorrect, item.stateIntact, item.reason,
    ])));
    renderAssessments(run);
    byId('history-summary').textContent = `History: ${totals.attempts} attempts; ${totals.pass} pass; ${totals.fail} fail; ${totals.unknown} unknown; ${totals.unsupported} unsupported; ${totals.incomplete} incomplete; ${totals.unassessed} not checked. All sampled clients: ${countsText(state.attempts.flatMap((item) => item.clients))}.`;
    byId('attempt-rows').replaceChildren(...state.attempts.map((item) => row([
      item.id, item.config.fixture, `${item.config.demandAt} s`, `${item.triggerAt} s`,
      item.startedAt, item.firstReadyAt,
      item.assessments.length || item.verdict === 'unsupported' ? item.verdict : 'not checked',
      countsText(item.clients),
    ])));
    byId('action-log').replaceChildren(...state.actions.map((item) => {
      const element = document.createElement('li');
      element.textContent = `${item.sequence}. ${item.kind} — ${item.disposition}: ${item.message}`;
      return element;
    }));
    byId('full-record').textContent = JSON.stringify(state, null, 2);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = Object.fromEntries(Object.keys(model.DEFAULTS).map((key) => [
      key, form.elements.namedItem(key).value,
    ]));
    state = model.schedule(state, input);
    render();
  });
  byId('advance-clock').addEventListener('click', () => {
    state = model.advance(state);
    render();
  });
  byId('check-outcome').addEventListener('click', () => {
    state = model.assess(state);
    render();
  });
  byId('restart-rehearsal').addEventListener('click', () => {
    form.reset();
    state = model.reset();
    render();
    byId('restart-rehearsal').focus();
  });
  render();
}());
