(function () {
  'use strict';
  const lesson = globalThis.PartitionLesson.createLesson();
  const byId = (id) => document.getElementById(id);
  const fields = { checkpoint: 'checkpoint', oldProbe: 'old-probe', delivery: 'delivery', effects: 'effects', prediction: 'prediction' };
  const text = (id, value) => { byId(id).textContent = value; };
  const observed = (value) => value === null ? 'unavailable' : String(value);
  function table(id, rows) {
    const body = byId(id);
    body.replaceChildren(...rows.map((values) => {
      const row = document.createElement('tr');
      for (const value of values) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      }
      return row;
    }));
  }
  function clearError() {
    const alert = byId('input-error');
    alert.hidden = true;
    alert.textContent = '';
    for (const id of Object.values(fields)) {
      byId(id).removeAttribute('aria-invalid');
      byId(id).removeAttribute('aria-describedby');
    }
  }
  function resetForms() {
    for (const id of ['settings-form', 'prediction-form']) HTMLFormElement.prototype.reset.call(byId(id));
    byId('history-detail').open = false;
  }
  function render() {
    const state = lesson.snapshot();
    const started = state.phase !== 'idle';
    const consumed = ['consumed', 'verified', 'checked'].includes(state.phase);
    const verified = ['verified', 'checked'].includes(state.phase);
    text('phase', `Phase: ${state.phase}`);
    byId('lesson').dataset.phase = state.phase;
    byId('lesson').dataset.outcome = state.result.outcome;
    byId('settings').disabled = started;
    byId('reassign').disabled = started || state.history.length >= state.maxAttempts;
    byId('consume').disabled = state.phase !== 'reassigned';
    byId('verify-run').disabled = state.phase !== 'consumed';
    byId('prediction').disabled = state.phase !== 'verified';
    byId('check-prediction').disabled = state.phase !== 'verified';
    byId('new-attempt').disabled = state.phase !== 'checked' || state.history.length >= state.maxAttempts;
    text('history-limit', state.history.length >= state.maxAttempts
      ? 'History full: six attempts retained. Reset all local data to begin again; nothing is evicted.'
      : 'Up to six retained attempts; no automatic eviction.');
    text('acquisition', started ? `New ownership: acquired by ${state.transfer.newConsumer} · epoch ${state.transfer.newEpoch}` : 'New ownership: not acquired');
    text('checkpoint-observation', started
      ? `Required checkpoint: 3 · transferred: ${state.settings.checkpoint === 'missing' ? 'MISSING' : observed(state.transfer.checkpoint)} · resume after: ${observed(state.transfer.resumeOffset)}`
      : 'Required checkpoint: 3 · transferred: not observed · resume: not observed');
    text('probe-observation', started ? `Old epoch probe: ${state.transfer.oldProbe}` : 'Old epoch probe: not observed');
    text('outcome', `Result: ${state.result.outcome}`);
    text('gates', `Ownership: ${state.result.ownership} · checkpoint: ${state.result.checkpoint} · effects: ${state.result.effects}`);
    text('impact', verified ? `Synthetic impact: ${state.result.impact}` : 'Synthetic impact: not verified');
    text('reasons', verified ? state.result.reasons.join(' ') : 'No verification has run.');
    text('delivery-metrics', consumed
      ? `Deliveries: ${observed(state.batch.deliveryCount)} · repeated deliveries: ${observed(state.batch.repeatedDeliveries)}`
      : 'Deliveries: not observed · repeated deliveries: not checked');
    text('effect-metrics', consumed
      ? `Final effects: ${observed(state.batch.totalEffects)} · duplicate effects: ${observed(state.batch.duplicateEffects)} · suppressed: ${observed(state.batch.suppressed)}`
      : 'Final effects: not observed · duplicate effects: not checked · suppressed: not checked');
    text('missing-events', consumed ? `Missing events: ${state.batch.totalEffects === null ? 'unavailable' : state.batch.missingEvents.join(', ') || 'none'}` : 'Missing events: not checked');
    text('event-totals', verified
      ? `Final effect outcomes: success ${state.result.success} · failure ${state.result.failure} · unknown ${state.result.unknown} / 6`
      : 'Final effect outcomes: six declared · not verified');
    table('delivery-rows', state.batch.deliveries.map((entry) => [
      entry.sequence, entry.event, `${entry.consumer} / ${entry.epoch}`, entry.repeatedDelivery ? 'yes' : 'no', entry.effect,
    ]));
    table('event-rows', state.batch.events.map((entry) => [
      `${entry.id} / ${entry.effectKey}`, entry.beforeEffectCount,
      consumed ? observed(entry.deliveryCount) : 'not observed',
      consumed ? observed(entry.effectCount) : 'not observed', verified ? entry.outcome : 'not verified',
    ]));
    const trace = state.trace.length ? state.trace : ['No attempt started.'];
    byId('trace').replaceChildren(...trace.map((message) => {
      const item = document.createElement('li');
      item.textContent = message;
      return item;
    }));
    text('prediction-result', state.learning
      ? `Learning prediction ${state.learning}: predicted ${state.prediction}; measured ${state.result.outcome}.`
      : 'Learning prediction not checked.');
    text('history-count', `Retained completed attempts: ${state.history.length} / 6`);
    text('totals', `Decided attempts: success ${state.totals.success} · failure ${state.totals.failure} · unknown ${state.totals.unknown}`);
    table('history-rows', state.history.map((entry) => [
      entry.number, entry.settings.checkpoint, entry.transfer.oldProbe, entry.result.outcome,
      `${entry.result.success} / ${entry.result.failure} / ${entry.result.unknown}`, `${entry.prediction} (${entry.learning})`,
    ]));
    text('history-proof', state.history.length ? JSON.stringify(state.history, null, 2) : '');
  }
  function action(operation, focus) {
    try {
      operation();
      clearError();
      render();
      const target = byId(focus);
      (target.disabled ? byId('reset-lesson') : target).focus();
    } catch (error) {
      const alert = byId('input-error');
      alert.textContent = error.message;
      alert.hidden = false;
      const input = byId(fields[error.field] || 'input-error');
      if (input !== alert) {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', 'input-error');
      }
      input.focus();
    }
  }
  byId('settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    action(() => lesson.reassign({
      checkpoint: byId('checkpoint').value, oldProbe: byId('old-probe').value,
      delivery: byId('delivery').value, effects: byId('effects').value,
    }), 'consume');
  });
  byId('consume').addEventListener('click', () => action(() => lesson.consume(), 'verify-run'));
  byId('verify-run').addEventListener('click', () => action(() => lesson.verify(), 'prediction'));
  byId('prediction-form').addEventListener('submit', (event) => {
    event.preventDefault();
    action(() => lesson.check(byId('prediction').value), 'new-attempt');
  });
  byId('new-attempt').addEventListener('click', () => action(() => { lesson.next(); resetForms(); }, 'reassign'));
  byId('reset-lesson').addEventListener('click', () => action(() => { lesson.reset(); resetForms(); }, 'reassign'));
  render();
  byId('lesson').dataset.ready = 'true';
}());
