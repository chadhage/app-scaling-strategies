(function () {
  'use strict';
  const model = globalThis.S126Lesson;
  const form = document.getElementById('plan-form');
  const element = (id) => document.getElementById(id);
  const text = (id, value) => { const target = element(id); if (target) target.textContent = String(value); };
  const unknown = (value) => value === null ? 'unknown' : String(value);
  if (!model || typeof model.createState !== 'function' || typeof model.execute !== 'function') {
    text('phase', 'unavailable');
    text('error', 'Required local lesson model is unavailable; no revision, routing or retirement action was performed. Reload the complete bundle.');
    text('status', 'Safe failure — no synthetic action executed.');
    document.querySelectorAll('button, input, select').forEach((control) => { control.disabled = true; });
    element('error')?.focus();
    return;
  }
  let state = model.createState();
  const archives = [];
  const weightText = (weights) => weights === null ? 'unknown — no current routing observation'
    : `old ${weights[0]}% / canary ${weights[1]}% / preview ${weights[2]}%`;
  function table(id, rows) {
    const body = element(id);
    if (!body) return;
    body.replaceChildren();
    for (const values of rows) {
      const row = document.createElement('tr');
      for (const value of values) {
        const cell = document.createElement('td');
        cell.textContent = unknown(value);
        row.append(cell);
      }
      body.append(row);
    }
  }
  function historyItem(entry) {
    const item = document.createElement('li');
    const line = document.createElement('p');
    line.textContent = `${entry.sequence}. ${entry.command.type}: ${entry.result} / ${entry.verifier}. ${entry.summary} ${entry.userImpact} Retirement: ${entry.retirement}.`;
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Retained typed action and fixed observation evidence';
    const data = document.createElement('pre');
    data.textContent = JSON.stringify(entry, null, 2);
    details.append(summary, data);
    item.append(line, details);
    return item;
  }
  function render() {
    text('phase', state.phase);
    text('readiness', state.readinessResult);
    text('preview', state.previewResult);
    text('desired', weightText(state.desiredWeights));
    text('observed', weightText(state.observedWeights));
    text('last-observed', weightText(state.lastObservedWeights));
    text('routing', state.routeResult);
    text('lifecycle', `${state.lifecycle.old} / ${state.lifecycle.canary} / ${state.lifecycle.preview}`);
    text('canary-result', state.canaryResult);
    text('promotion-result', state.promotionResult);
    text('audit', state.auditResult);
    text('rollback', state.rollbackResult);
    text('attempted', state.metrics.attempted);
    text('journeys', `successful ${state.metrics.successful} / interrupted ${state.metrics.interrupted} / unknown ${state.metrics.unknown}`);
    text('safe-holds', state.safeHolds);
    text('verifier', state.verifier);
    text('user-impact', state.userImpact);
    text('retirement', state.retirement);
    text('history-count', `${state.history.length} / ${model.limit}`);
    text('archived-count', `${archives.length} / 20`);
    text('data', state.lastData === null ? 'No new measurement; baseline and revisions are fictional DATA ONLY.' : JSON.stringify(state.lastData, null, 2));
    element('fixture').disabled = state.fixture !== null;
    const latestPreview = state.history.findLast((entry) => entry.data?.paths);
    const latestRequests = state.history.findLast((entry) => entry.data?.requests);
    table('preview-rows', (latestPreview?.data.paths ?? []).map((row) => [
      row.person, row.path, row.expectedStatus, row.observedStatus, row.observedRevision,
      `${unknown(row.observedIdentity)} / ${unknown(row.observedState)}`,
    ]));
    table('request-rows', (latestRequests?.data.requests ?? []).map((row) => [
      row.id, row.path, row.expectedRevision, row.observedRevision, row.status,
    ]));
    table('journey-rows', (state.latestJourneys?.observations ?? []).map((row) => [
      row.id, `${row.expectedRevision} / ${unknown(row.observedRevision)}`,
      `${unknown(row.observedIdentity)} / ${unknown(row.observedState)}`, row.effectCount,
      `${unknown(row.elapsedMs)} / ${row.originalBudgetMs} ms`, row.outcome,
    ]));
    element('history').replaceChildren(...state.history.map(historyItem));
    const guidance = {
      baseline: 'Next: choose a fixed fixture and record exactly v2.',
      prepared: 'Next: inspect ALL readiness DATA. A failed or unknown result holds exposure; reset to compare another fixture.',
      ready: state.previewResult === 'pass' ? 'Next: record 80/20/0, then separately measure the canary.'
        : 'Next: measure selected and non-selected preview paths; no ordinary split is allowed without authorization evidence.',
      'canary-unmeasured': 'Next: measure request identities and complete canary journeys. Desired weights are not observed traffic.',
      'canary-measured': state.canaryResult === 'pass' ? 'Next: record 0/100/0, then separately measure promotion.'
        : 'Negative or unknown canary: promotion is held. Inspect compatible rollback; earlier outcomes stay counted.',
      'promotion-unmeasured': 'Next: measure actual request revision and complete declared promotion journeys.',
      'promotion-measured': 'Next: independently audit old routes, clients, work/state, artifacts and retention before requesting retirement; fail/unknown gates hold it.',
      retired: 'Only the old teaching record is retired. Native proof remains absent; rollback cannot resurrect retired DATA.',
      'rolled-back': 'Rollback evidence is retained with prior failures/unknowns. Reset archives the current run without rewriting any files.',
    };
    text('next-step', guidance[state.phase]);
  }
  function perform(command, focusId) {
    try {
      state = model.execute(state, command);
      render();
      const latest = state.history.at(-1);
      text('status', latest.summary);
      text('error', latest.result === 'held' || latest.verifier !== 'pass' ? latest.summary : '');
    } catch (error) {
      const typed = ['ERR_INPUT', 'ERR_STATE', 'ERR_LIMIT'].includes(error.code);
      text('error', typed ? `${error.code}: ${error.message}` : 'Unexpected lesson failure; no action was applied. Reload the complete local bundle.');
      text('status', 'Action rejected; state and retained history are unchanged.');
      if (!typed) document.querySelectorAll('button, input, select').forEach((control) => { control.disabled = true; });
      const target = element(error.code === 'ERR_LIMIT' ? 'reset-button' : focusId);
      target?.focus();
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    perform({ type: 'prepare', fixture: element('fixture').value, token: element('token').value }, 'token');
  });
  for (const [id, type] of [
    ['inspect-button', 'inspect'], ['preview-button', 'preview'], ['measure-button', 'measure'],
    ['audit-button', 'audit-old'], ['retire-button', 'retire'], ['rollback-button', 'rollback'],
  ]) element(id).addEventListener('click', () => perform({ type }, id));
  element('split-button').addEventListener('click', () => {
    perform({ type: 'split', allocation: element('allocation').value }, 'allocation');
  });
  element('reset-button').addEventListener('click', () => {
    if (state.history.length > 0 && archives.length === 20) {
      text('error', 'All 20 prior runs are retained without pruning. Reload to explicitly clear in-memory evidence.');
      element('error').focus();
      return;
    }
    if (state.history.length > 0) {
      archives.push(state);
      const item = document.createElement('li');
      const title = document.createElement('p');
      title.textContent = `Run ${archives.length}, ${state.fixture ?? 'no fixture'}: ${state.userImpact} Attempted ${state.metrics.attempted}; successful ${state.metrics.successful}; interrupted ${state.metrics.interrupted}; unknown ${state.metrics.unknown}.`;
      const history = document.createElement('ol');
      history.append(...state.history.map(historyItem));
      item.append(title, history);
      element('archives').append(item);
    }
    HTMLFormElement.prototype.reset.call(form);
    state = model.createState();
    text('error', '');
    text('status', 'Only this in-memory rehearsal reset; prior run evidence retained. No resource or file operation.');
    render();
    element('fixture').focus();
  });
  render();
}());
