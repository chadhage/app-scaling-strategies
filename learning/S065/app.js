(function () {
  'use strict';
  const lesson = window.HotPartitionLesson;
  const session = lesson.createSession();
  const byId = (id) => document.getElementById(id);
  const form = byId('plan');
  const metricFields = {
    'attempted-count': 'attemptedOperations', 'observed-count': 'observedOperations',
    'success-count': 'successfulOperations', 'failure-count': 'failedOperations',
    'unknown-count': 'unknownOperations', 'gap-count': 'routingGapPhases',
    'stale-count': 'staleRoutePhases', 'owner-count': 'dualOwnerPhases',
    'moved-count': 'movedHotOperations', 'cold-count': 'coldSuccessfulOperations',
  };

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function row(parent, values) {
    const tr = element('tr');
    values.forEach((value) => tr.append(element('td', value)));
    parent.append(tr);
  }

  function renderTrace(trace) {
    byId('phase-trace').replaceChildren();
    byId('operation-trace').replaceChildren();
    for (const phase of trace) {
      if (!phase.observed) {
        row(byId('phase-trace'), [phase.phase, 'unknown', 'unknown', 'unknown']);
        row(byId('operation-trace'), [phase.phase, 'unknown', '4 unknown outcomes', 'No observation; intent is not evidence']);
        continue;
      }
      row(byId('phase-trace'), [
        phase.phase, phase.hotRoute || 'NO ROUTE',
        phase.ownerEpochs.map(({ owner, epoch }) => `${owner} (epoch ${epoch})`).join(' + '),
        phase.coldRoute,
      ]);
      for (const operation of phase.operations) {
        const effects = operation.kind === 'write'
          ? operation.outcome === 'success' ? `Acknowledged ${operation.effect}` : 'Write not acknowledged'
          : `${operation.required.join(', ')} → ${operation.received ? operation.received.join(', ') : 'no response'}`
            + (operation.missing.length ? `; MISSING ${operation.missing.join(', ')}` : '');
        row(byId('operation-trace'), [
          `${phase.phase} / ${operation.id}`, `${operation.partition} / ${operation.destination || 'NO ROUTE'}`,
          `${operation.outcome}: ${operation.reason}`, effects,
        ]);
      }
    }
  }

  function renderHistory(history) {
    byId('history').replaceChildren();
    byId('history-status').textContent = history.length
      ? `${history.length} / ${lesson.LIMITS.attempts} completed attempts retained in memory. Reset or reload clears them.`
      : 'No completed attempts. History is memory-only, not durable evidence.';
    for (const attempt of history) {
      const item = element('li');
      item.append(element('strong', `Attempt ${attempt.id} — ${attempt.result.verdict}`));
      item.append(element('p',
        `${attempt.config.routing} routing; ${attempt.config.ownership} ownership; ${attempt.config.data} copy; `
        + `${attempt.config.coverage} observations. ${attempt.result.metrics.failedOperations} failed, `
        + `${attempt.result.metrics.unknownOperations} unknown operations. ${attempt.result.reasons.join(' ')}`));
      const details = element('details');
      details.append(element('summary', `Retained synthetic trace for attempt ${attempt.id}`));
      details.append(element('pre', JSON.stringify(attempt, null, 2)));
      item.append(details);
      byId('history').append(item);
    }
  }

  function render() {
    const state = session.snapshot();
    const complete = state.status === 'complete';
    const running = state.status === 'running';
    byId('configuration').disabled = state.status !== 'ready';
    byId('start').disabled = state.status !== 'ready';
    byId('observe').disabled = !running;
    byId('new-attempt').disabled = !complete || state.completedAttempts >= lesson.LIMITS.attempts;
    byId('check-prediction').disabled = !complete;
    byId('status').textContent = running
      ? `Attempt ${state.current.id} / 6 — next: ${lesson.PHASES[state.current.trace.length]} (${state.current.trace.length} / 3 phases observed).`
      : complete ? `Attempt ${state.current.id} complete — ${state.current.result.verdict}. `
        + (state.completedAttempts === lesson.LIMITS.attempts ? 'Six-attempt limit reached; explicit reset required.' : 'Start a new attempt to retain this evidence.')
        : 'Ready — choose conditions, predict an outcome and start an attempt.';
    renderTrace(state.current ? state.current.trace : []);
    const result = complete ? state.current.result : null;
    byId('summary').className = `result ${result ? result.verdict : 'pending'}`;
    byId('summary').dataset.verdict = result ? result.verdict : 'pending';
    byId('verdict').textContent = `3. Verification: ${result ? result.verdict : 'pending'}`;
    byId('impact').textContent = `User impact: ${result ? result.userImpact : 'no completed observations.'}`;
    byId('cleanup').textContent = `Cleanup: ${result ? result.cleanup : 'no resources created. Explicit reset or reload clears in-memory evidence.'}`;
    byId('metrics').hidden = !complete;
    for (const [id, key] of Object.entries(metricFields)) {
      byId(id).textContent = result ? String(result.metrics[key]) : '0';
    }
    byId('missing-effects').textContent = result && result.metrics.missingCommittedEffects.length
      ? result.metrics.missingCommittedEffects.join(', ') : 'none';
    byId('reasons').replaceChildren(...(result ? result.reasons.map((reason) => element('li', reason)) : []));
    renderHistory(state.history);
  }

  function act(action, focus) {
    try {
      action();
      byId('error').hidden = true;
      byId('error').textContent = '';
      render();
      if (focus) byId(focus()).focus();
    } catch (error) {
      byId('error').textContent = `Action rejected: ${error.message}`;
      byId('error').hidden = false;
      byId('error').focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    act(() => {
      const input = Object.fromEntries(Object.keys(lesson.OPTIONS).map((key) => [key, byId(key).value]));
      session.start(input);
      byId('prediction-result').textContent = '';
    }, () => 'observe');
  });
  byId('observe').addEventListener('click', () => act(() => session.step(),
    () => session.snapshot().status === 'complete' ? 'summary' : 'observe'));
  byId('new-attempt').addEventListener('click', () => act(() => {
    session.newAttempt();
    byId('prediction').value = '';
    byId('prediction-result').textContent = '';
  }, () => 'routing'));
  byId('reset-all').addEventListener('click', () => act(() => {
    session.reset();
    form.reset();
    byId('prediction-result').textContent = '';
  }, () => 'routing'));
  byId('check-prediction').addEventListener('click', () => act(() => {
    const state = session.snapshot();
    const prediction = byId('prediction').value;
    if (state.status !== 'complete') throw new Error('Complete the observations before checking an answer.');
    if (!['success', 'failure', 'unknown'].includes(prediction)) throw new TypeError('Choose a success, failure or unknown prediction.');
    byId('prediction-result').textContent = prediction === state.current.result.verdict
      ? 'Prediction matches the synthetic observations. No native qualification.'
      : `Prediction differs: observed verdict is ${state.current.result.verdict}. Inspect the retained reasons.`;
  }));
  render();
}());
