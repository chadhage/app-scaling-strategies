(() => {
  'use strict';
  const lesson = S090Model.createLesson();
  const byId = (id) => document.getElementById(id);
  const fixtureForm = byId('fixture-form');
  const actionForm = byId('action-form');
  const predictionForm = byId('prediction-form');
  const errorBox = byId('input-error');
  const inputs = ['fixture', 'action', 'prediction'];
  const observed = (value) => value === null ? 'UNKNOWN (missing observation)' : String(value);
  const labels = [
    ['newAdmissions', 'New admissions to synthetic-old-v1'],
    ['users', 'Pinned synthetic users'],
    ['work', 'Pending synthetic work items'],
    ['stateOwners', 'Synthetic state ownership units'],
    ['retentionUntil', 'Rollback-retention deadline'],
  ];
  function rows(id, values) {
    byId(id).replaceChildren(...values.map((cells) => {
      const row = document.createElement('tr');
      for (const value of cells) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      }
      return row;
    }));
  }
  function clearErrors() {
    errorBox.hidden = true;
    errorBox.textContent = '';
    for (const id of inputs) byId(id).removeAttribute('aria-invalid');
  }
  function report(error, input) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    if (error.code === 'ERR_INPUT') byId(input).setAttribute('aria-invalid', 'true');
    errorBox.focus();
  }
  function render() {
    const state = lesson.snapshot();
    const current = state.current;
    const last = current && current.lastAttempt;
    const retired = current && current.lifecycle === 'RETIRED';
    byId('fixture-fields').disabled = current !== null || state.history.length >= state.limits.rehearsals;
    byId('start-lesson').disabled = byId('fixture-fields').disabled;
    byId('action-fields').disabled = !current || retired;
    byId('apply-action').disabled = !current || retired || current.trace.length >= state.limits.trace
      || (byId('action').value === 'attempt-retirement' && current.attempts.length >= state.limits.attempts);
    byId('prediction-fields').disabled = !last || current.prediction !== null;
    byId('new-rehearsal').disabled = !current || current.attempts.length === 0;
    byId('phase').textContent = current ? `Teaching lifecycle: ${current.lifecycle}` : 'Lesson: idle';
    byId('outcome').textContent = last ? `Latest attempt ${last.id}: ${last.outcome}` : 'Latest attempt: NOT_ATTEMPTED';
    byId('outcome').dataset.outcome = last ? last.outcome : 'NOT_ATTEMPTED';
    byId('decision').textContent = `Decision: ${last ? last.decision : 'NOT_CHECKED'}`;
    byId('verifier').textContent = `Safety verifier: ${last ? last.verifier : 'NOT_CHECKED'}`;
    byId('capacity').textContent = `Synthetic old capacity: ${current ? current.oldCapacity : 'not evaluated'}`;
    byId('blockers').textContent = `Known blockers: ${last ? last.blockers.join(', ') || 'none at latest attempt' : 'not evaluated'}`;
    byId('unknowns').textContent = `Missing observations: ${last ? last.unknown.join(', ') || 'none at latest attempt' : 'not evaluated'}`;
    byId('impact').textContent = !current ? 'Synthetic user impact: not evaluated'
      : current.inventory.users === null ? 'Synthetic users: unverified; old capacity retained.'
        : `Synthetic pinned users remaining: ${current.inventory.users}. No interrupted journeys are injected; no migration is certified.`;
    const totals = state.totals;
    byId('totals').textContent = `Retirement attempts: ${totals.attempts} · success ${totals.success} · failure ${totals.failure} · unknown ${totals.unknown}`;
    byId('history-count').textContent = `Archived rehearsals: ${state.history.length} / ${state.limits.rehearsals} · active ${current ? 1 : 0}`;
    const prediction = current && current.prediction;
    byId('prediction-result').textContent = prediction
      ? `${prediction.correct ? 'Correct' : 'Not correct'}: chose ${prediction.expected}; observed ${prediction.observed} at attempt ${prediction.attempt}.`
      : 'No prediction checked.';
    byId('prediction-result').dataset.correct = prediction ? String(prediction.correct) : '';
    rows('inventory-rows', current ? labels.map(([key, label]) => {
      const value = current.inventory[key];
      const gate = value === null ? 'HELD · unknown' : (key === 'retentionUntil' ? value > current.tick : value > 0)
        ? 'BLOCKED · dependency remains' : 'CLEAR · observed';
      return [label, key === 'retentionUntil' ? `tick ${current.tick} / ${observed(value)}` : observed(value), gate];
    }) : []);
    rows('trace-rows', current ? current.trace.map((entry) =>
      [entry.step, entry.action, entry.lifecycle, entry.tick, entry.latestOutcome]) : []);
    rows('history-rows', state.history.map((run) => [
      run.id, run.fixture, run.attempts.length,
      ...['SUCCESS', 'FAILURE', 'UNKNOWN'].map((outcome) => run.attempts.filter((entry) => entry.outcome === outcome).length),
      run.lastAttempt.decision,
    ]));
    byId('current-proof').textContent = current ? JSON.stringify(current, null, 2) : 'No rehearsal started.';
    byId('history-proof').textContent = state.history.length ? JSON.stringify(state.history, null, 2) : 'No archived rehearsals.';
  }
  function focusAction() {
    byId(byId('action-fields').disabled ? 'new-rehearsal' : 'action').focus();
  }
  fixtureForm.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      lesson.begin(byId('fixture').value);
      actionForm.reset();
      predictionForm.reset();
      clearErrors();
      render();
      focusAction();
    } catch (error) { report(error, 'fixture'); }
  });
  actionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      lesson.act(byId('action').value);
      if (byId('action').value === 'attempt-retirement') predictionForm.reset();
      clearErrors();
      render();
      focusAction();
    } catch (error) { report(error, 'action'); }
  });
  byId('action').addEventListener('change', render);
  predictionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      lesson.checkPrediction(byId('prediction').value);
      clearErrors();
      render();
      focusAction();
    } catch (error) { report(error, 'prediction'); }
  });
  byId('new-rehearsal').addEventListener('click', () => {
    try {
      lesson.newRehearsal();
      for (const form of [fixtureForm, actionForm, predictionForm]) form.reset();
      clearErrors();
      byId('current-detail').open = false;
      render();
      byId('fixture').focus();
    } catch (error) { report(error, 'fixture'); }
  });
  byId('reset-lesson').addEventListener('click', () => {
    lesson.reset();
    for (const form of [fixtureForm, actionForm, predictionForm]) form.reset();
    clearErrors();
    for (const id of ['current-detail', 'history-detail']) byId(id).open = false;
    render();
    byId('fixture').focus();
  });
  render();
})();
