(function () {
  'use strict';
  const { createLesson, OPTIONS, MAX_HISTORY } = window.S069;
  const lesson = createLesson();
  const byId = (id) => document.getElementById(id);
  let inspecting = null;
  const text = (id, value) => { byId(id).textContent = value; };
  function clearError() {
    text('input-error', '');
    byId('input-error').hidden = true;
    for (const id of ['authority', 'retention', 'prediction']) {
      byId(id).removeAttribute('aria-invalid');
      byId(id).setAttribute('aria-describedby', id === 'prediction' ? 'prediction-help' : 'config-help');
    }
  }
  function showError(error, field) {
    text('input-error', error.message);
    byId('input-error').hidden = false;
    if (field) {
      byId(field).setAttribute('aria-invalid', 'true');
      byId(field).setAttribute('aria-describedby', `${field === 'prediction' ? 'prediction-help' : 'config-help'} input-error`);
    }
    byId(field && !byId(field).disabled ? field : 'input-error').focus();
  }
  function rows(id, values) {
    const body = byId(id);
    body.replaceChildren();
    for (const cells of values) {
      const row = document.createElement('tr');
      cells.forEach((value, index) => {
        const cell = document.createElement(index ? 'td' : 'th');
        if (!index) cell.scope = 'row';
        cell.textContent = String(value);
        row.append(cell);
      });
      body.append(row);
    }
  }
  function list(id, values, placeholder) {
    byId(id).replaceChildren();
    for (const value of values.length ? values : [placeholder]) {
      const item = document.createElement('li');
      item.textContent = value;
      byId(id).append(item);
    }
  }
  function hideProof() {
    inspecting = null;
    byId('retained-detail').hidden = true;
    text('retained-proof', '');
    text('retained-title', 'Retained proof');
  }
  function inspect(attempt) {
    const record = lesson.snapshot().history.find((item) => item.attempt === attempt);
    if (!record) return;
    inspecting = attempt;
    byId('retained-detail').hidden = false;
    text('retained-title', `Retained proof · attempt ${attempt} · ${record.verdict}`);
    text('retained-proof', JSON.stringify(record, null, 2));
    byId('retained-title').focus();
  }
  function render() {
    const state = lesson.snapshot();
    const complete = state.phase === 'complete';
    byId('assumptions').disabled = state.phase !== 'idle';
    for (const [id, phase] of [
      ['begin-handoff', 'idle'], ['transfer-epoch', 'begun'], ['probe-writers', 'transferred'],
      ['replay-grant', 'probed'], ['verify-effects', 'replayed'],
    ]) byId(id).disabled = state.phase !== phase;
    byId('next-attempt').disabled = !complete || state.history.length >= MAX_HISTORY;
    byId('prediction').disabled = !complete || Boolean(state.prediction);
    byId('check-prediction').disabled = !complete || Boolean(state.prediction);
    text('phase', `Phase: ${state.phase}`);
    text('gate', `Safety gate: ${state.verdict === 'NOT_EVALUATED' ? 'not evaluated' : state.verdict}`);
    byId('gate').dataset.result = state.verdict;
    const authority = state.authority;
    text('authority-state', !authority ? 'Authority: not observed'
      : authority.receipt === 'unavailable'
        ? 'Authority: UNKNOWN · receipt unavailable · last confirmed epoch: 41'
        : `Authority: ${authority.owner}@${authority.epoch} · high-water epoch: ${authority.highWaterEpoch} · receipt: ${authority.receipt}`);
    text('active-grants', !authority ? 'Active grants: not observed'
      : authority.grants === null ? 'Active grants: UNKNOWN'
        : `Active grants: ${authority.grants.map((grant) => `${grant.writer}@${grant.epoch}`).join(', ')}`);
    text('replay-outcome', `Stale grant replay: ${state.replayResult || 'not attempted'}`);
    const measured = state.metrics;
    text('write-counts', measured
      ? `Write observations: ${measured.accepted} accepted / ${measured.rejected} rejected / ${measured.held} held / ${measured.unknown} unknown · attempted: ${measured.attempted}`
      : 'Write observations: not measured');
    text('retained-counts', measured
      ? `Original acknowledgements: ${measured.retained} / ${measured.acknowledged} retained unchanged · missing: ${measured.missingIds.join(', ') || 'none'}`
      : 'Original acknowledgements: not verified');
    text('effect-count', state.phase === 'idle' ? 'Known effect ledger: not observed'
      : `Known effect ledger: ${state.ledger.length} · unknown outcomes do not establish total effects`);
    text('replacement-outcome', `Replacement write: ${state.writes.find((row) => row.kind === 'replacement')?.status || 'not attempted'}`);
    rows('write-rows', state.writes.map((row) => [row.id, row.writer, row.epoch, row.payload, row.status, row.reason]));
    rows('effect-rows', state.ledger.map((row) => [row.id, row.payload, row.writer, row.epoch]));
    list('assertions', state.assertions.map((row) => `${row.result} — ${row.label}`), 'Safety assertions have not been evaluated.');
    list('trace', state.trace.map((row) => `${row.step}. ${row.event}: ${row.detail}`), 'No attempt started.');
    text('prediction-result', state.prediction
      ? `Learning prediction: ${state.prediction.correct ? 'correct' : 'incorrect'} · predicted ${state.prediction.expected} · measured ${state.prediction.actual}. Safety result unchanged.`
      : 'Learning prediction not checked.');
    text('history-count', `Retained attempts: ${state.history.length} / ${MAX_HISTORY}`);
    text('history-limit', state.history.length === MAX_HISTORY
      ? 'History capacity reached. All six proofs remain; explicit reset is required to start over.'
      : 'Earlier results remain until explicit reset or reload.');
    rows('history-rows', state.history.map((record) => [
      record.attempt, `${record.config.authority} / ${record.config.retention}`, record.verdict,
      `${record.metrics.retained} / 2`, record.prediction ? (record.prediction.correct ? 'correct' : 'incorrect') : 'not checked', '',
    ]));
    [...byId('history-rows').rows].forEach((row, index) => {
      const attempt = state.history[index].attempt;
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `inspect-attempt-${attempt}`;
      button.textContent = `Inspect attempt ${attempt}`;
      button.addEventListener('click', () => inspect(attempt));
      row.lastElementChild.append(button);
    });
    if (inspecting !== null) {
      const record = state.history.find((item) => item.attempt === inspecting);
      if (record) text('retained-proof', JSON.stringify(record, null, 2));
      else hideProof();
    }
  }
  function conduct(action, focus, field) {
    clearError();
    try {
      action();
      render();
      if (focus && !byId(focus).disabled) byId(focus).focus();
      else if (focus === 'next-attempt') byId('reset-rehearsal').focus();
    } catch (error) {
      render();
      showError(error, field);
    }
  }
  function resetForms() {
    byId('handoff-controls').reset();
    byId('prediction-controls').reset();
    hideProof();
  }
  byId('handoff-controls').addEventListener('submit', (event) => {
    event.preventDefault();
    const config = { authority: byId('authority').value, retention: byId('retention').value };
    const invalid = !OPTIONS.authority.includes(config.authority) ? 'authority'
      : !OPTIONS.retention.includes(config.retention) ? 'retention' : null;
    conduct(() => lesson.begin(config), 'transfer-epoch', invalid);
  });
  for (const [id, action, focus] of [
    ['transfer-epoch', 'transfer', 'probe-writers'], ['probe-writers', 'probe', 'replay-grant'],
    ['replay-grant', 'replay', 'verify-effects'], ['verify-effects', 'verify', 'prediction'],
  ]) byId(id).addEventListener('click', () => conduct(() => lesson[action](), focus));
  byId('prediction-controls').addEventListener('submit', (event) => {
    event.preventDefault();
    const value = byId('prediction').value;
    conduct(() => lesson.predict(value), 'next-attempt', ['PASS', 'FAIL', 'UNKNOWN'].includes(value) ? null : 'prediction');
  });
  byId('next-attempt').addEventListener('click', () => conduct(() => {
    lesson.next();
    resetForms();
  }, 'begin-handoff'));
  byId('reset-rehearsal').addEventListener('click', () => conduct(() => {
    lesson.reset();
    resetForms();
  }, 'begin-handoff'));
  byId('hide-retained').addEventListener('click', () => {
    const attempt = inspecting;
    hideProof();
    if (attempt !== null) byId(`inspect-attempt-${attempt}`).focus();
  });
  render();
}());
