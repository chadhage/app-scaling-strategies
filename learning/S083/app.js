'use strict';

(function () {
  const lesson = window.RestartRehearsal.createLesson();
  const byId = (id) => document.getElementById(id);
  const setup = byId('setup-form');
  const predictionForm = byId('prediction-form');
  const policyNames = {
    reconcile: 'Reconcile durable receipt',
    'unsafe-replay': 'Unsafe checkpoint replay'
  };
  const fixtureNames = {
    complete: 'Complete receipts',
    'missing-effect-receipt': 'Missing effect receipt',
    'missing-user-outcome': 'Missing journey-B outcome',
    'recorded-user-failure': 'Recorded journey-B failure'
  };

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function fillRows(body, rows) {
    body.replaceChildren(...rows.map((values) => {
      const row = element('tr');
      values.forEach((value) => row.append(element('td', String(value))));
      return row;
    }));
  }

  function traceTable(trace) {
    const table = element('table');
    table.append(element('caption', 'Retained trace — DATA ONLY effects'));
    const head = element('thead');
    const heading = element('tr');
    for (const label of ['Step', 'Kind', 'Effect identity', 'Observation']) {
      const cell = element('th', label);
      cell.scope = 'col';
      heading.append(cell);
    }
    head.append(heading);
    const body = element('tbody');
    fillRows(body, trace.map((event) => [event.seq, event.kind, event.effectId || '—', event.detail]));
    table.append(head, body);
    return table;
  }

  function renderHistory(history) {
    byId('history-count').textContent = `${history.length} / 6 retained. No evidence is silently evicted.${history.length === 6 ? ' Limit reached; explicitly reset to start over.' : ''}`;
    byId('history').replaceChildren(...history.map((attempt) => {
      const item = element('li');
      const details = element('details');
      details.append(element('summary', `Attempt ${attempt.attempt}: ${attempt.result.outcome} — ${policyNames[attempt.config.policy]} — ${fixtureNames[attempt.config.evidence]}`));
      details.append(element('p', `Prediction ${attempt.prediction}: ${attempt.correct ? 'correct' : 'incorrect'}. Measured result remains ${attempt.result.outcome}.`));
      const m = attempt.result.metrics;
      details.append(element('p', `Checkpoint ${attempt.result.checkpoint}; console AVAILABLE; effect receipt ${attempt.result.effectReceipt}. Executions ${m.destructiveExecutions}; duplicates ${m.duplicateDestructiveActions}; users ${m.userSucceeded} successful, ${m.userFailed} failed, ${m.userUnknown} unknown / ${m.userAttempted} attempted.`));
      details.append(element('p', attempt.result.userOutcomes.map((user) => `${user.id}: ${user.outcome}`).join('; ')));
      const reasons = element('ul');
      attempt.result.reasons.forEach((reason) => reasons.append(element('li', reason)));
      const wrap = element('div');
      wrap.className = 'table-wrap';
      wrap.append(traceTable(attempt.trace));
      details.append(reasons, wrap);
      item.append(details);
      return item;
    }));
  }

  function render() {
    const state = lesson.getState();
    const idle = state.phase === 'idle';
    const resumable = state.phase === 'crashed';
    const assessable = state.phase === 'resumed';
    byId('configuration').disabled = !idle || state.history.length >= 6;
    byId('restart-trace').disabled = !resumable;
    byId('prediction').disabled = !assessable;
    byId('check-prediction').disabled = !assessable;
    byId('new-attempt').disabled = state.phase !== 'checked' || state.history.length >= 6;
    byId('phase').textContent = `Phase: ${state.phase}.${idle ? ' No attempt has run.' : ' Inputs are locked until a new attempt or reset.'}`;
    fillRows(byId('trace-body'), state.trace.map((event) => [event.seq, event.kind, event.effectId || '—', event.detail]));
    const result = state.result;
    byId('result').textContent = result ? `Trace result: ${result.outcome} (synthetic)` : 'NOT RUN - no successful sample is claimed.';
    byId('result').dataset.outcome = result ? result.outcome : 'NOT_RUN';
    byId('checkpoint').textContent = `Recovered checkpoint: ${result ? result.checkpoint : 'not observed'}`;
    byId('effect-receipt').textContent = `Durable effect receipt: ${result ? result.effectReceipt : 'not inspected'}`;
    const metricIds = {
      'destructive-count': 'destructiveExecutions',
      'duplicate-count': 'duplicateDestructiveActions',
      'attempted-count': 'userAttempted',
      'success-count': 'userSucceeded',
      'failure-count': 'userFailed',
      'unknown-count': 'userUnknown'
    };
    for (const [id, key] of Object.entries(metricIds)) byId(id).textContent = result ? String(result.metrics[key]) : '—';
    byId('reasons').replaceChildren(...(result ? result.reasons : []).map((reason) => element('li', reason)));
    fillRows(byId('user-body'), result ? result.userOutcomes.map((user) => [user.id, user.outcome]) : []);
    byId('prediction-result').textContent = state.prediction
      ? `Prediction ${state.prediction.correct ? 'correct' : 'incorrect'}; measured trace result remains ${result.outcome}.`
      : 'Prediction not checked.';
    renderHistory(state.history);
  }

  function act(action, nextFocus) {
    try {
      action();
      byId('error').textContent = '';
      byId('error').hidden = true;
      render();
      const target = byId(nextFocus);
      if (!target.disabled) target.focus();
      else byId('clear-all').focus();
    } catch (error) {
      byId('error').textContent = `${error.code || 'ERROR'}: ${error.message}`;
      byId('error').hidden = false;
    }
  }

  function clearForms() {
    // Calling the prototype avoids a form control named "reset" shadowing the method.
    HTMLFormElement.prototype.reset.call(setup);
    HTMLFormElement.prototype.reset.call(predictionForm);
  }

  setup.addEventListener('submit', (event) => {
    event.preventDefault();
    act(() => lesson.stage({ policy: byId('policy').value, evidence: byId('evidence').value }), 'restart-trace');
  });
  byId('restart-trace').addEventListener('click', () => act(() => lesson.restart(), 'prediction'));
  predictionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    act(() => lesson.check(byId('prediction').value), 'new-attempt');
  });
  byId('new-attempt').addEventListener('click', () => act(() => {
    lesson.newAttempt();
    clearForms();
  }, 'policy'));
  byId('clear-all').addEventListener('click', () => act(() => {
    lesson.reset();
    clearForms();
  }, 'policy'));
  render();
}());
