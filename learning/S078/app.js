(function () {
  'use strict';
  const model = globalThis.SchedulerLesson;
  const byId = (id) => document.getElementById(id);
  const configForm = byId('configuration');
  const answerForm = byId('interpretation');
  let state = model.createState();
  const display = (value) => value === null ? 'none' : String(value);
  const text = (id, value) => { byId(id).textContent = value; };
  const table = (id, rows) => {
    const body = byId(id);
    body.replaceChildren(...rows.map((values) => {
      const row = document.createElement('tr');
      values.forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = display(value);
        row.append(cell);
      });
      return row;
    }));
  };
  const clearError = () => {
    text('input-error', '');
    byId('input-error').hidden = true;
    document.querySelectorAll('[aria-invalid]').forEach((control) => control.removeAttribute('aria-invalid'));
  };
  const markInvalid = (fields) => {
    fields.forEach(([id, allowed]) => {
      if (!allowed.includes(byId(id).value)) byId(id).setAttribute('aria-invalid', 'true');
    });
  };
  const render = () => {
    const ready = state.phase === 'ready';
    const done = state.phase === 'evaluated';
    byId('configuration-fields').disabled = !ready;
    byId('start-schedulers').disabled = !ready;
    byId('handoff-lease').disabled = state.phase !== 'started';
    byId('execute-occurrence').disabled = state.phase !== 'handoff';
    byId('interpretation-fields').disabled = !done;
    byId('new-attempt').disabled = !done || state.history.length >= model.LIMIT;
    text('phase', `Phase: ${state.phase}`);
    text('attempt-count', `Attempt: ${state.attempt} / ${model.LIMIT}`);
    text('lease-summary', state.lease
      ? `Current lease: ${state.lease.owner}, epoch ${state.lease.epoch}, valid [${state.lease.validFrom}, ${state.lease.expiresAt}); tick ${state.tick}`
      : 'Current lease: none');
    text('fence-summary', ready ? 'Effect-boundary fence: not started'
      : state.fence === null ? 'Effect-boundary fence: NOT ENFORCED — cached lease prechecks only'
        : `Effect-boundary fence: epoch ${state.fence} and current lease owner required`);
    text('verdict', `Synthetic result: ${state.verdict}`);
    byId('verdict').dataset.verdict = state.verdict;
    const impact = {
      NOT_EVALUATED: 'No occurrence has been evaluated.',
      PASS: 'One observed effect by valid executor v2; stale v1 was rejected.',
      FAIL: 'Known incorrect scheduled work: an invalid executor or duplicate effect is observed.',
      UNKNOWN: 'No successful effect can be confirmed; v2 receipt is unresolved.',
    };
    text('impact', impact[state.verdict]);
    const measured = state.metrics;
    text('metrics', ready ? 'No scheduling or effects observed.'
      : `Candidates: ${measured.scheduledCandidates}; duplicate schedules: ${measured.duplicateSchedules}; `
        + `known effects: ${measured.knownEffects}; duplicate effects: ${measured.duplicateEffects}; `
        + `invalid executor effects: ${measured.invalidExecutorEffects}; unresolved effects: ${measured.unresolvedEffects}.`);
    text('uncertainty', !done ? 'No effect conclusion yet.'
      : measured.unresolvedEffects ? 'Missing receipts remain unresolved, even when a separate known violation makes this run FAIL.'
        : 'Both execution attempts have explicit observed or rejected outcomes in this synthetic trace.');
    table('lease-ledger', [state.previousLease, state.lease].filter(Boolean).map((lease) => [
      lease.owner, lease.epoch, lease.validFrom, lease.expiresAt,
      state.tick >= lease.validFrom && state.tick < lease.expiresAt ? 'current' : 'expired',
    ]));
    table('scheduler-ledger', state.schedulers.map((entry) => [
      entry.version, entry.occurrence, entry.token, entry.checkedAt, entry.checkedExpiry, entry.status,
    ]));
    table('effect-ledger', state.effects.map((effect) => [
      effect.executor, effect.token, effect.receipt,
      effect.effectUnits === null ? 'unknown' : effect.effectUnits,
      effect.validOwner ? 'valid' : 'INVALID',
    ]));
    text('trace', state.trace.join('\n'));
    text('answer-feedback', state.interpretation?.message || 'Interpretation not checked.');
    table('history', state.history.map((entry) => [
      entry.attempt, entry.config.protection, entry.config.receipt, entry.verdict,
      entry.metrics.knownEffects, entry.metrics.duplicateEffects,
      entry.metrics.invalidExecutorEffects, entry.metrics.unresolvedEffects,
    ]));
    text('history-count', `Retained attempts: ${state.history.length} / ${model.LIMIT}`);
    byId('history-ledgers').replaceChildren(...state.history.map((entry) => {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = `Attempt ${entry.attempt}: retained lease, proposals, effects and trace (${entry.verdict})`;
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(entry, null, 2);
      details.append(summary, pre);
      return details;
    }));
  };
  const act = (operation, focusId) => {
    try {
      const next = operation();
      state = next;
      clearError();
      render();
      if (focusId) byId(focusId).focus();
    } catch (error) {
      text('input-error', error.message);
      byId('input-error').hidden = false;
      const invalid = document.querySelector('[aria-invalid="true"]');
      if (invalid) invalid.focus();
    }
  };
  configForm.addEventListener('submit', (event) => {
    event.preventDefault();
    act(() => {
      clearError();
      markInvalid([['protection', ['fenced', 'lease-only']], ['receipt', ['observed', 'missing']]]);
      return model.start(state, { protection: byId('protection').value, receipt: byId('receipt').value });
    }, 'handoff-lease');
  });
  byId('handoff-lease').addEventListener('click', () => act(() => model.advanceLease(state), 'execute-occurrence'));
  byId('execute-occurrence').addEventListener('click', () => act(() => model.execute(state), 'executor-choice'));
  answerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    act(() => {
      clearError();
      markInvalid([['executor-choice', ['v1', 'v2', 'unknown']], ['outcome-choice', ['PASS', 'FAIL', 'UNKNOWN']]]);
      return model.interpret(state, { owner: byId('executor-choice').value, outcome: byId('outcome-choice').value });
    }, 'check-answer');
  });
  byId('new-attempt').addEventListener('click', () => act(() => {
    const next = model.nextAttempt(state);
    configForm.reset();
    answerForm.reset();
    return next;
  }, 'start-schedulers'));
  byId('reset-rehearsal').addEventListener('click', () => act(() => {
    const next = model.resetState(state);
    configForm.reset();
    answerForm.reset();
    return next;
  }, 'start-schedulers'));
  render();
}());
