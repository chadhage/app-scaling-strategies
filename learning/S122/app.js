'use strict';

(function startLesson() {
  const model = window.S122Lesson;
  const form = document.getElementById('lesson-form');
  const error = document.getElementById('lesson-error');
  const phase = document.getElementById('phase-label');
  const pathControl = document.getElementById('promotion-path');
  const fixtureControl = document.getElementById('fixture-choice');
  const budgetControl = document.getElementById('journey-budget');
  let state = model.initialState();

  function text(id, value) {
    document.getElementById(id).textContent = value;
  }

  function item(tag, value) {
    const element = document.createElement(tag);
    element.textContent = value;
    return element;
  }

  function summary(run) {
    const metrics = run.metrics;
    if (!metrics) return 'No run measured; no migration success percentage.';
    if (!metrics.attempted) {
      return `${run.outcome}: ${metrics.productionSuccesses}/${metrics.productionAttempted} old-only production successes; 0 attempted transitions; no migration percentage.`;
    }
    return `${run.outcome}: ${metrics.successes}/${metrics.attempted} migration successes; ${metrics.interruptions} interruptions; ${metrics.unknowns} unknowns. Synthetic sample only.`;
  }

  function render() {
    const current = state.current;
    document.querySelector('option[value="native-auto-swap"]').disabled = true;
    phase.dataset.phase = state.phase;
    phase.textContent = state.phase;
    text('lesson-status', state.message);
    text('content-placement', current
      ? `production: ${current.productionContent}; staging: ${current.stagingContent}`
      : 'production: old-v1; staging: candidate-v2');
    text('desired-route', current ? current.desiredRoute : 'old-v1');
    text('observed-route', current ? current.observedRoute : 'No crossing journeys observed');
    text('worker-state', current ? current.formerWorkers : 'Not swapped');
    const gates = document.getElementById('readiness-gates');
    gates.replaceChildren();
    if (current) {
      for (const gate of current.gates) gates.append(item('li', `${gate.passed ? 'PASS' : 'BLOCKED'} ${gate.code}: ${gate.detail}`));
      if (current.faultNote) gates.append(item('li', current.faultNote));
    } else {
      gates.append(item('li', 'Not assessed'));
    }
    text('current-result', current ? summary(current) : 'No run measured; no success percentage.');
    const rows = document.getElementById('journey-rows');
    rows.replaceChildren();
    if (current) {
      for (const receipt of current.receipts) {
        const row = document.createElement('tr');
        row.dataset.outcome = receipt.outcome;
        row.append(item('td', `${receipt.journey}; admitted ${receipt.admittedVersion}`));
        row.append(item('td', `frontend ${receipt.frontendVersion || '?'}; API ${receipt.apiVersion || '?'}`));
        row.append(item('td', `HTTP ${receipt.httpStatus === null ? '?' : receipt.httpStatus}; ${receipt.latencyMs === null ? '?' : receipt.latencyMs} / ${receipt.originalBudgetMs} ms; auth ${receipt.authenticationPreserved}; state ${receipt.statePreserved}; effects ${receipt.effects === null ? '?' : receipt.effects}/${receipt.expectedEffects}`));
        row.append(item('td', `${receipt.outcome}: ${receipt.reason}; continuation ${receipt.continuation}`));
        rows.append(row);
      }
    }
    const trace = document.getElementById('action-trace');
    trace.replaceChildren();
    if (current) for (const action of current.actions) trace.append(item('li', action));
    const history = document.getElementById('run-history');
    history.replaceChildren();
    for (const run of state.history) {
      const record = document.createElement('li');
      record.dataset.runId = String(run.runId);
      record.dataset.outcome = run.outcome;
      record.append(item('p', `Run ${run.runId}, ${run.path}, ${run.fixture}, original ${run.budgetMs} ms: ${summary(run)}${run.recoveryRequested ? ' Recovery requested, not verified.' : ''}`));
      const actions = document.createElement('ol');
      for (const action of run.actions) actions.append(item('li', action));
      record.append(actions);
      history.append(record);
    }
    text('history-count', `${state.history.length} / ${model.MAX_RUNS} archived runs`);
    const totals = state.history.reduce((sum, run) => ({
      attempted: sum.attempted + run.metrics.attempted,
      successes: sum.successes + run.metrics.successes,
      interruptions: sum.interruptions + run.metrics.interruptions,
      unknowns: sum.unknowns + run.metrics.unknowns,
    }), { attempted: 0, successes: 0, interruptions: 0, unknowns: 0 });
    text('aggregate-result', totals.attempted
      ? `${totals.attempted} attempted transitions: ${totals.successes} successes; ${totals.interruptions} interruptions; ${totals.unknowns} unknowns. No independent reliability estimate.`
      : '0 attempted transitions; no transition success percentage.');
    for (const control of [pathControl, fixtureControl, budgetControl]) control.disabled = state.phase !== 'idle';
    document.getElementById('assess-candidate').disabled = state.phase !== 'idle' || state.history.length >= model.MAX_RUNS;
    document.getElementById('promote-candidate').disabled = state.phase !== 'ready';
    document.getElementById('measure-journeys').disabled = !['promoted', 'aborted'].includes(state.phase);
    document.getElementById('request-rollback').disabled = state.phase !== 'measured'
      || !current.exposed || !['interrupted', 'unverified'].includes(current.outcome);
  }

  function submit(commandFactory) {
    try {
      const command = typeof commandFactory === 'function' ? commandFactory() : commandFactory;
      state = model.apply(state, command);
      error.hidden = true;
      error.textContent = '';
      if (command.type === 'reset') form.reset();
      render();
      if (command.type === 'reset') pathControl.focus();
    } catch (failure) {
      render();
      error.textContent = `${failure.code || 'LESSON_ERROR'}: ${failure.message}`;
      error.hidden = false;
      error.focus();
    }
  }

  function readInput() {
    if (!/^(?:[1-4][0-9]{2}|500)$/.test(budgetControl.value)) {
      const failure = new Error('Enter an unpadded decimal integer from 100 to 500 ms; no spaces, fractions, signs or exponent notation.');
      failure.code = 'INPUT_FORMAT';
      throw failure;
    }
    return { path: pathControl.value, fixture: fixtureControl.value, budgetMs: Number(budgetControl.value) };
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit(() => ({ type: 'assess', input: readInput() }));
  });
  for (const [id, type] of [
    ['promote-candidate', 'promote'], ['measure-journeys', 'measure'],
    ['request-rollback', 'rollback'], ['reset-lesson', 'reset'],
  ]) {
    document.getElementById(id).addEventListener('click', () => submit({ type }));
  }
  render();
}());
