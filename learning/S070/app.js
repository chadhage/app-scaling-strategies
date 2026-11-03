'use strict';

(function () {
  const lesson = window.S070Model.createLesson();
  const fixtures = window.S070Fixtures;
  const byId = (id) => document.getElementById(id);
  const text = (id, value) => { byId(id).textContent = value; };
  const shown = (value) => value === null ? 'unknown' : String(value);
  function cells(parent, values) {
    const row = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.append(cell);
    }
    parent.append(row);
  }
  function clearError() {
    text('input-error', '');
    byId('input-error').hidden = true;
    for (const field of document.querySelectorAll('[aria-invalid]')) field.removeAttribute('aria-invalid');
  }
  function resetForms() {
    byId('settings-form').reset();
    byId('prediction-form').reset();
    byId('retained-detail').open = false;
  }
  function render() {
    const state = lesson.snapshot();
    const current = state.current;
    const verification = current && current.verification;
    text('phase', `Phase: ${state.phase}`);
    byId('settings').disabled = state.phase !== 'idle';
    byId('stage-replica').disabled = state.phase !== 'idle' || state.history.length >= state.maxAttempts;
    byId('verify-replica').disabled = state.phase !== 'staged';
    byId('promote-replica').disabled = state.phase !== 'verified';
    byId('prediction').disabled = state.phase !== 'decided';
    byId('check-prediction').disabled = state.phase !== 'decided';
    byId('new-attempt').disabled = state.phase !== 'checked' || state.history.length >= state.maxAttempts;
    text('promotion-outcome', `Promotion outcome: ${current && current.outcome || 'not requested'}`);
    byId('promotion-outcome').dataset.status = current && current.outcome || '';
    text('sync-outcome', verification
      ? `Synchronization: ${verification.synchronization.status} · ${verification.synchronization.reason}` : 'Synchronization: not checked');
    text('ownership-outcome', verification
      ? `Ownership: ${verification.ownership.status} · ${verification.ownership.reason}` : 'Ownership: not checked');
    text('declared-boundary', `Declared boundary: ${current ? current.declaredBoundary ?? 'undeclared' : 'not staged'} · required: 6`);
    const sync = verification && verification.synchronization;
    text('receipt-metrics', `Restored receipts: ${current ? current.receipts === null ? 'unknown' : `${current.receipts.length} / 6` : 'not staged'} · expected: 6`
      + (sync ? ` · contiguous through: ${shown(sync.contiguousThrough)} · maximum: ${shown(sync.maxReceipt)}` : ''));
    text('missing-metrics', `Missing committed receipts: ${sync ? sync.missing === null ? 'unknown' : sync.missing.length ? sync.missing.join(', ') : 'none' : 'not checked'}`);
    const owner = verification && verification.ownership;
    text('ownership-metrics', owner
      ? `Candidate grant: ${owner.candidate || 'unknown'} · epoch: ${shown(owner.grantEpoch)} / required 8 · previous fenced: ${shown(owner.previousFenced)} · potential writers: ${shown(owner.potentialWriters)}`
      : 'Candidate grant: not checked');
    text('promotion-metrics', `Restored writer activated: ${current && current.promoted ? 'yes' : 'no'} · preserved effects: ${verification ? shown(current.preservedEffects) : 'not checked'}`
      + (current && current.outcome ? ` · effective synthetic writers: ${shown(current.writerCount)}` : ''));
    text('impact', !current || !current.outcome ? 'User-impact model: no promotion requested.'
      : current.promoted ? 'User-impact model: synthetic promotion completed with 6 retained effects. No real user journey observed.'
        : `User-impact model: synthetic promotion ${current.outcome === 'FAIL' ? 'rejected' : 'held for missing evidence'}; no restored writer activated. The reference journal retains 6 fixed effects, not a completed migration.`);
    const receipts = byId('receipt-rows');
    receipts.replaceChildren();
    for (const expected of fixtures.committed) {
      const observed = !current ? 'not staged' : current.receipts === null ? 'unverified'
        : current.receipts.some((entry) => entry.sequence === expected.sequence && entry.key === expected.key && entry.value === expected.value) ? 'present' : 'MISSING';
      cells(receipts, [expected.sequence, expected.key, expected.value, observed]);
    }
    const trace = byId('trace');
    trace.replaceChildren();
    for (const entry of current ? current.trace : ['No attempt staged.']) {
      const item = document.createElement('li');
      item.textContent = entry;
      trace.append(item);
    }
    text('prediction-result', current && current.learning
      ? `Learning check: ${current.learning} · predicted ${current.prediction}; promotion remains ${current.outcome}.` : 'Learning prediction not checked.');
    text('history-count', `Retained completed attempts: ${state.history.length} / ${state.maxAttempts}`);
    text('totals', `Decided attempts: success ${state.counts.success} · failure ${state.counts.failure} · unknown ${state.counts.unknown}`);
    const history = byId('history-rows');
    history.replaceChildren();
    for (const attempt of state.history) {
      cells(history, [attempt.id, `${attempt.config.boundary} / ${attempt.config.restoration} / ${attempt.config.ownership}`,
        attempt.outcome, attempt.promoted ? attempt.activatedWriter : 'not activated', attempt.learning]);
    }
    text('retained-proof', state.history.length ? JSON.stringify(state.history, null, 2) : '');
  }
  function run(action, focus, invalidField) {
    try {
      action();
      clearError();
      render();
      byId(typeof focus === 'function' ? focus() : focus).focus();
    } catch (error) {
      render();
      text('input-error', error.message);
      byId('input-error').hidden = false;
      const field = invalidField && invalidField();
      if (field) byId(field).setAttribute('aria-invalid', 'true');
      byId(field || 'input-error').focus();
    }
  }
  byId('settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    run(() => lesson.begin({
      boundary: byId('boundary').value, restoration: byId('restoration').value, ownership: byId('ownership').value,
    }), 'verify-replica', () => {
      const choices = { boundary: fixtures.boundaries, restoration: fixtures.restorations, ownership: fixtures.ownership };
      return Object.keys(choices).find((key) => !Object.hasOwn(choices[key], byId(key).value));
    });
  });
  byId('verify-replica').addEventListener('click', () => run(() => lesson.verify(), 'promote-replica'));
  byId('promote-replica').addEventListener('click', () => run(() => lesson.promote(), 'prediction'));
  byId('prediction-form').addEventListener('submit', (event) => {
    event.preventDefault();
    run(() => lesson.predict(byId('prediction').value),
      () => lesson.snapshot().history.length < fixtures.maxAttempts ? 'new-attempt' : 'reset-rehearsal', () => 'prediction');
  });
  byId('new-attempt').addEventListener('click', () => run(() => {
    lesson.next();
    resetForms();
  }, 'stage-replica'));
  byId('reset-rehearsal').addEventListener('click', () => run(() => {
    lesson.reset();
    resetForms();
  }, 'stage-replica'));
  render();
}());
