'use strict';

(function bindLesson() {
  const lesson = globalThis.S089Lesson.createLesson();
  const { CONDITIONS, BOUNDS } = globalThis.S089Fixtures;
  const byId = (id) => document.getElementById(id);
  const form = byId('scenario-form');
  const condition = byId('condition');
  const recovery = byId('recovery-evidence');
  const prediction = byId('prediction');
  const text = (id, value) => { byId(id).textContent = String(value); };
  const element = (tag, value) => {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = String(value);
    return node;
  };
  const metricLine = (metrics) => `${metrics.attempted} attempted · ${metrics.success} success · ${metrics.failure} failure · ${metrics.unknown} unknown`;

  function render() {
    const state = lesson.snapshot();
    const readyToCheck = ['recovered', 'recovery-unknown'].includes(state.phase);
    document.documentElement.dataset.phase = state.phase;
    document.documentElement.dataset.verdict = state.verification;
    condition.disabled = state.phase !== 'idle';
    recovery.disabled = state.phase !== 'idle';
    byId('start-run').disabled = state.phase !== 'idle' || state.history.length >= BOUNDS.maxHistory;
    for (const [id, phase] of Object.entries({
      'lose-management': 'prepared', 'sample-journeys': 'outage', 'report-fault': 'sampled', 'recover-control': 'reported',
    })) byId(id).disabled = state.phase !== phase;
    prediction.disabled = !readyToCheck;
    byId('check-prediction').disabled = !readyToCheck || !prediction.value;
    byId('new-attempt').disabled = state.phase !== 'checked' || state.history.length >= BOUNDS.maxHistory;
    text('phase', state.phase);
    text('route-state', `${state.route.deployment} · epoch ${state.route.epoch} · established`);
    text('control-availability', state.controlAvailability);
    text('command-result', state.commandCounts.attempted
      ? '1 synthetic command attempted · 1 rejected-control-unavailable · route unchanged.'
      : 'No synthetic command attempted.');
    text('data-outcome', state.dataOutcome);
    text('policy', state.config ? `Fixture policy: ${CONDITIONS[state.config.condition].policy}` : 'No fixture selected.');
    text('harness-status', `${state.harnessAvailability} — ${state.harnessReport ? 'scoped fault report recorded' : 'separate reporting/recovery path'}`);
    text('recovery-outcome', `Recovery: ${state.recoveryOutcome}`);
    text('verification', `Verification: ${state.verification}`);
    byId('verification').dataset.result = state.verification;
    text('prediction-result', state.prediction === null ? 'Prediction not checked.'
      : `${state.predictionCorrect ? 'Correct' : 'Incorrect'} prediction ${state.prediction}; actual verdict ${state.verification}. Service outcome is unchanged.`);
    for (const [prefix, metrics] of [['active', state.metrics], ['retained', state.retainedMetrics]]) {
      for (const [key, value] of Object.entries(metrics)) text(`${prefix}-${key}`, value);
    }
    const rows = byId('journey-rows');
    rows.replaceChildren();
    if (!state.journeys.length) {
      const row = element('tr');
      const cell = element('td', 'No samples yet.');
      cell.colSpan = 4;
      row.append(cell);
      rows.append(row);
    }
    for (const journey of state.journeys) {
      const row = element('tr');
      for (const value of [`${journey.id} / ${journey.route}`, journey.status,
        journey.latencyMs === null ? 'unknown — no observation' : journey.latencyMs, journey.reason]) {
        row.append(element('td', value));
      }
      rows.append(row);
    }
    const trace = byId('trace');
    trace.replaceChildren();
    if (!state.trace.length) trace.append(element('li', 'No actions yet.'));
    for (const entry of state.trace) trace.append(element('li',
      `${entry.atSyntheticMs} synthetic ms — ${entry.kind} — ${JSON.stringify(entry)}`));
    text('history-note', `${state.history.length}/${BOUNDS.maxHistory} retained attempts. `
      + (state.history.length >= BOUNDS.maxHistory ? 'History full; explicit reset required. No records evicted.'
        : 'No automatic eviction. New attempt keeps all checked records.'));
    const history = byId('history');
    history.replaceChildren();
    if (!state.history.length) history.append(element('p', 'No retained attempts yet.'));
    for (const entry of state.history) {
      const article = element('article');
      article.append(element('h3', `Attempt ${entry.attemptId} — ${entry.verification}`),
        element('p', `${entry.config.condition} · control ${entry.controlAvailability} · service ${entry.dataOutcome} · recovery ${entry.recoveryOutcome}`),
        element('p', metricLine(entry.metrics)),
        element('p', `${entry.predictionCorrect ? 'Correct' : 'Incorrect'} prediction ${entry.prediction}; actual ${entry.verification}.`));
      const detail = element('details');
      detail.append(element('summary', 'Retained trace, report and journeys'),
        element('pre', JSON.stringify(entry, null, 2)));
      article.append(detail);
      history.append(article);
    }
  }

  function operate(action, message, focusId) {
    try {
      action();
      byId('error').hidden = true;
      byId('error').textContent = '';
      render();
      text('status', message);
      if (focusId) byId(focusId).focus();
    } catch (error) {
      render();
      text('status', 'Action rejected; lesson state unchanged.');
      text('error', error.message);
      byId('error').hidden = false;
      byId('error').focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    operate(() => lesson.start({ condition: condition.value, recovery: recovery.value }),
      'Prepared. Only the per-run management path will be lost.', 'lose-management');
  });
  for (const [id, method, message, next] of [
    ['lose-management', 'loseManagement', 'Per-run management unavailable; synthetic command rejected; established route unchanged.', 'sample-journeys'],
    ['sample-journeys', 'sampleJourneys', 'Three fixed established-user observations recorded while management is unavailable.', 'report-fault'],
    ['report-fault', 'reportFault', 'Independent shared harness reported the bounded fault and exact samples.', 'recover-control'],
    ['recover-control', 'recoverControl', 'Recovery evidence recorded. Missing acknowledgement is unknown, not restoration.', 'prediction'],
  ]) byId(id).addEventListener('click', () => operate(() => lesson[method](), message, next));
  prediction.addEventListener('change', render);
  byId('check-prediction').addEventListener('click', () => operate(() => lesson.checkPrediction(prediction.value),
    'Prediction checked. Actual outcomes, including failures and unknowns, retained.', 'reset-lesson'));
  byId('new-attempt').addEventListener('click', () => operate(() => {
    lesson.newAttempt();
    prediction.value = '';
  }, 'New attempt ready; all checked history remains.', 'condition'));
  byId('reset-lesson').addEventListener('click', () => operate(() => {
    lesson.reset();
    condition.value = 'independent';
    recovery.value = 'confirmed';
    prediction.value = '';
  }, 'All local state and history reset. Defaults restored.', 'condition'));
  render();
})();
