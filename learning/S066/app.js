(function () {
  'use strict';
  const { createLesson, fixtures } = globalThis.CommitLesson066;
  const lesson = createLesson();
  const byId = (id) => document.getElementById(id);
  const controls = byId('lesson-controls');
  const predictionControls = byId('prediction-controls');
  let selectedHistory = null;
  const range = (min, max) => min === max ? String(min) : `${min}..${max}`;
  const tally = (counts) => `${counts.committed} committed / ${counts.failed} failed / ${counts.unresolved} unresolved`;
  const compact = (counts) => `${counts.committed} / ${counts.failed} / ${counts.unresolved}`;
  function row(values) {
    const tr = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      if (value instanceof Node) cell.append(value);
      else cell.textContent = String(value);
      tr.append(cell);
    }
    return tr;
  }
  function clearError() {
    const error = byId('input-error');
    error.textContent = '';
    error.hidden = true;
    for (const input of document.querySelectorAll('[aria-invalid]')) {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-errormessage');
    }
  }
  function error(message, invalid) {
    byId('input-error').textContent = message;
    byId('input-error').hidden = false;
    for (const id of invalid) {
      byId(id).setAttribute('aria-invalid', 'true');
      byId(id).setAttribute('aria-errormessage', 'input-error');
    }
    if (invalid.length) byId(invalid[0]).focus();
  }
  function renderRetained(state) {
    const retained = state.history.find((entry) => entry.attempt === selectedHistory);
    byId('retained-detail').hidden = !retained;
    byId('retained-title').textContent = retained ? `Retained proof · attempt ${retained.attempt}` : 'Retained proof';
    byId('retained-proof').textContent = retained ? JSON.stringify(retained, null, 2) : '';
  }
  function render() {
    const state = lesson.snapshot();
    const result = state.result;
    byId('phase').textContent = `Phase: ${state.phase}`;
    byId('assumptions').disabled = state.phase !== 'idle';
    byId('begin-commit').disabled = state.phase !== 'idle';
    byId('inject-fault').disabled = state.phase !== 'committing';
    byId('reconcile').disabled = state.phase !== 'uncertain';
    byId('apply-recovery').disabled = state.phase !== 'reconciled';
    byId('new-attempt').disabled = state.phase !== 'complete' || state.history.length >= fixtures.maxAttempts;
    byId('prediction').disabled = state.phase !== 'complete' || Boolean(state.prediction);
    byId('check-prediction').disabled = state.phase !== 'complete' || Boolean(state.prediction);
    byId('gate').textContent = `Effect reconciliation gate: ${result ? result.gate : 'not evaluated'}`;
    byId('gate').removeAttribute('data-gate');
    if (result) byId('gate').dataset.gate = result.gate;
    byId('impact').textContent = state.interruptedResponses
      ? `Fault impact: 3 interrupted commit responses · recovery: ${result ? result.recoveryImpact : 'not evaluated'} · no uninterrupted migration proven`
      : 'Fault impact: not injected';
    const originalCounts = state.original.reduce((sum, entry) => {
      sum[entry.outcome]++;
      return sum;
    }, { committed: 0, failed: 0, unresolved: 0 });
    byId('original-counts').textContent = state.original.length
      ? `Original commit outcomes: ${tally(originalCounts)}` : 'Original commit outcomes: not observed';
    byId('recovered-counts').textContent = result
      ? `Recovered outcomes: ${tally(result.counts)}` : 'Recovered outcomes: not evaluated';
    const min = state.original.reduce((sum, entry) => sum + entry.effectMin, 0);
    const max = state.original.reduce((sum, entry) => sum + entry.effectMax, 0);
    byId('effects').textContent = result
      ? `Effects: ${range(result.effects.min, result.effects.max)} · intended: 3`
      : state.original.length ? `Original effect bounds: ${range(min, max)} · intended: 3`
        : 'Effects: not observed · intended: 3';
    byId('duplicates').textContent = result
      ? `Duplicates: ${range(result.duplicates.min, result.duplicates.max)}`
      : 'Duplicates: not evaluated';
    byId('original-rows').replaceChildren(...state.original.map((entry) => row([
      `${entry.id} / ${entry.key}`, entry.outcome, range(entry.effectMin, entry.effectMax), entry.evidence,
    ])));
    byId('recovery-detail').hidden = !result;
    byId('result-rows').replaceChildren(...(result ? result.rows.map((entry) => row([
      entry.id, entry.originalOutcome, entry.action, entry.submittedKey || 'No new submission',
      entry.addedEffects, range(entry.effectMin, entry.effectMax), range(entry.duplicateMin, entry.duplicateMax), entry.outcome,
    ])) : []));
    byId('trace').textContent = state.trace.length ? state.trace.join('\n') : 'No attempt started.';
    byId('prediction-result').textContent = state.prediction
      ? `Learning verifier: ${state.prediction.correct ? 'PASS' : 'FAIL'} · predicted ${state.prediction.selected}, observed ${state.prediction.expected}. Fault impact and effect inventory unchanged.`
      : 'Learning prediction not checked.';
    byId('history-count').textContent = `Retained attempts: ${state.history.length} / ${fixtures.maxAttempts}`;
    byId('capacity').textContent = state.history.length >= fixtures.maxAttempts
      ? 'Capacity reached: six full attempts retained. Explicit reset is required; nothing is silently evicted.'
      : 'No silent eviction. At six completed attempts, explicitly reset to continue.';
    byId('history-rows').replaceChildren(...state.history.map((entry) => {
      const inspect = document.createElement('button');
      inspect.type = 'button';
      inspect.textContent = `Inspect attempt ${entry.attempt}`;
      inspect.addEventListener('click', () => {
        selectedHistory = entry.attempt;
        renderRetained(lesson.snapshot());
        byId('retained-title').focus();
      });
      return row([
        entry.attempt, `${entry.config.receipt} / ${entry.config.recovery}`,
        compact(entry.result.originalCounts), compact(entry.result.counts),
        range(entry.result.effects.min, entry.result.effects.max),
        range(entry.result.duplicates.min, entry.result.duplicates.max), entry.result.gate,
        entry.prediction ? `${entry.prediction.selected}: ${entry.prediction.correct ? 'correct' : 'incorrect'}` : 'Not checked',
        inspect,
      ]);
    }));
    renderRetained(state);
  }
  function act(action, nextFocus, invalid = []) {
    clearError();
    try {
      action();
      render();
      if (nextFocus) byId(nextFocus).focus();
    } catch (failure) {
      render();
      error(failure.message, invalid);
    }
  }
  controls.addEventListener('submit', (event) => event.preventDefault());
  predictionControls.addEventListener('submit', (event) => event.preventDefault());
  byId('begin-commit').addEventListener('click', () => act(() => lesson.begin({
    receipt: byId('receipt').value, recovery: byId('recovery').value,
  }), 'inject-fault', ['receipt', 'recovery']));
  byId('inject-fault').addEventListener('click', () => act(() => lesson.fault(), 'reconcile'));
  byId('reconcile').addEventListener('click', () => act(() => lesson.reconcile(), 'apply-recovery'));
  byId('apply-recovery').addEventListener('click', () => act(() => lesson.recover(), 'prediction'));
  byId('check-prediction').addEventListener('click', () => act(
    () => lesson.predict(byId('prediction').value),
    lesson.snapshot().history.length < fixtures.maxAttempts ? 'new-attempt' : 'reset-rehearsal',
    ['prediction'],
  ));
  byId('new-attempt').addEventListener('click', () => act(() => {
    lesson.next();
    controls.reset();
    predictionControls.reset();
    selectedHistory = null;
  }, 'begin-commit'));
  byId('reset-rehearsal').addEventListener('click', () => act(() => {
    lesson.reset();
    controls.reset();
    predictionControls.reset();
    selectedHistory = null;
  }, 'begin-commit'));
  render();
}());
