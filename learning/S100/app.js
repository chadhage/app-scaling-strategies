(function () {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const error = byId('error');
  const form = byId('lesson-input');
  const condition = byId('condition');
  const prediction = byId('prediction');
  const start = byId('start-work');
  const observe = byId('observe-work');
  const check = byId('check-ledger');
  const reset = byId('reset-lesson');
  const model = globalThis.S100;
  let state;

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
    error.focus();
  }

  function clearError() {
    error.hidden = true;
    error.textContent = '';
  }

  function show(value) { return value === null ? 'Unknown' : String(value); }

  function render() {
    const totals = model.summarize(state);
    const current = state.history.at(-1);
    const ready = state.phase === 'ready';
    condition.disabled = !ready;
    prediction.disabled = !ready;
    start.disabled = !ready || totals.rehearsals >= model.LIMITS.rehearsals;
    observe.disabled = state.phase !== 'active';
    check.disabled = state.phase !== 'observed';
    byId('boot-status').textContent = `Local lesson ready — phase: ${state.phase}.`;
    byId('allowance').textContent = `${model.LIMITS.rehearsals - totals.rehearsals} of 4 synthetic starts remaining.`;
    for (const key of ['attempted', 'uninterrupted', 'interrupted', 'unknown',
      'lost', 'retried', 'duplicated', 'unresolved', 'late', 'cancelled']) {
      byId(key).textContent = String(totals[key]);
    }
    byId('fraction').textContent = totals.confirmedSuccessFraction;

    const body = byId('work-ledger');
    body.replaceChildren();
    for (const item of current?.work || []) {
      const row = document.createElement('tr');
      for (const value of [item.id, item.kind, item.outcome, item.completed,
        item.elapsedMs, item.effectCount, item.attempts, item.observedEpoch,
        item.terminationRecorded ? 'Recorded as data' : 'Not recorded']) {
        const cell = document.createElement('td');
        cell.textContent = show(value);
        row.append(cell);
      }
      body.append(row);
    }
    const trace = byId('trace');
    trace.replaceChildren();
    for (const text of current?.trace || []) {
      const item = document.createElement('li');
      item.textContent = text;
      trace.append(item);
    }

    const result = current?.result;
    byId('verifier').textContent = result ? result.verification.toUpperCase() : 'Not checked';
    byId('user-impact').textContent = result
      ? result.userImpact === 'interrupted'
        ? `Interrupted transition${result.expectedInterruptionObserved ? ' — expected interruption observed' : ''}; ${result.interrupted} interrupted, ${result.unknown} unknown`
        : result.userImpact === 'unverified'
          ? `Unverified — ${result.unknown} unknown outcomes`
          : `Uninterrupted synthetic comparison — ${result.uninterrupted} correct, timely journeys`
      : current ? 'Unverified — check completion observations; all started journeys are retained'
        : 'Unverified — no started journeys';
    byId('migration').textContent = result?.successfulSyntheticMigration
      ? 'Established only for this fixed synthetic comparison' : 'Not established';
    byId('conclusion').textContent = result?.reason
      || (state.phase === 'observed' ? 'Fixed observations applied. Check the ledger; an acknowledgement is not a migration verdict.'
        : current ? 'Four synthetic journeys started; apply one fixed trace.'
          : 'Start, apply a fixed trace, then check.');

    const history = byId('history');
    history.replaceChildren();
    for (const run of state.history) {
      const row = document.createElement('li');
      const counts = Object.fromEntries(['uninterrupted', 'interrupted', 'unknown'].map((key) => [
        key, run.work.filter((item) => item.outcome === key).length,
      ]));
      row.textContent = `Rehearsal ${run.id} — ${run.input.condition}; ${run.stage}; educational verifier ${run.result?.verification || 'not checked'}; `
        + `4 attempted, ${counts.uninterrupted} uninterrupted, ${counts.interrupted} interrupted, ${counts.unknown} unknown.`;
      history.append(row);
    }
  }

  function act(action, focus) {
    try {
      const next = model.transition(state, action);
      state = next;
      clearError();
      render();
      focus.focus();
    } catch (caught) {
      showError(`${caught.code || 'ERR_LESSON'}: ${caught.message}`);
    }
  }

  if (!model) {
    showError('ERR_LESSON: The local model is unavailable. Reopen the complete bundle; there is no live fallback.');
    return;
  }
  try {
    state = model.createState();
    render();
  } catch (caught) {
    showError(`ERR_LESSON: ${caught.message}`);
    return;
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    act({ type: 'start', input: { condition: condition.value, prediction: prediction.value } }, observe);
  });
  observe.addEventListener('click', () => act({ type: 'observe' }, check));
  check.addEventListener('click', () => act({ type: 'check' }, reset));
  reset.addEventListener('click', () => {
    HTMLFormElement.prototype.reset.call(form);
    condition.value = 'forced';
    prediction.value = 'interrupted';
    act({ type: 'reset' }, condition);
  });
}());
