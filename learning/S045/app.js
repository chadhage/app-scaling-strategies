(function () {
  'use strict';

  const fixtures = globalThis.WebSocketFixtures;
  const lesson = globalThis.WebSocketLesson.createLesson();
  const byId = (id) => document.getElementById(id);
  const form = byId('rehearsal-form');
  const configuration = byId('configuration');
  const error = byId('input-error');
  const fields = {
    cursor: byId('cursor'),
    replayProtection: byId('replay-protection'),
    delivery: byId('delivery'),
    decoder: byId('decoder'),
    stateRetention: byId('state-retention'),
    observation: byId('observation'),
    gapMs: byId('gap-ms'),
    budgetMs: byId('budget-ms'),
  };
  const buttons = {
    start: byId('start-session'), cutover: byId('cut-over'), reconnect: byId('reconnect'),
    next: byId('new-attempt'), reset: byId('reset-rehearsal'), prediction: byId('check-prediction'),
  };
  const prediction = byId('prediction');
  const display = (value) => value === null ? 'unknown' : String(value);

  function cell(parent, text, tag = 'td') {
    const node = document.createElement(tag);
    node.textContent = text;
    parent.append(node);
    return node;
  }

  function clearError() {
    error.hidden = true;
    error.textContent = '';
    Object.values(fields).forEach((field) => field.removeAttribute('aria-invalid'));
  }

  function numeric(field, label, min, max) {
    const text = fields[field].value;
    if (!/^(0|[1-9][0-9]*)$/.test(text) || !Number.isInteger(Number(text))
        || Number(text) < min || Number(text) > max) {
      fields[field].setAttribute('aria-invalid', 'true');
      fields[field].focus();
      throw new Error(`${label}: enter a whole number from ${min} to ${max}, without spaces, signs or exponents.`);
    }
    return Number(text);
  }

  function readConfig() {
    return {
      cursor: fields.cursor.value,
      replayProtection: fields.replayProtection.value,
      delivery: fields.delivery.value,
      decoder: fields.decoder.value,
      stateRetention: fields.stateRetention.value,
      observation: fields.observation.value,
      gapMs: numeric('gapMs', 'Recovery gap', 0, 2000),
      budgetMs: numeric('budgetMs', 'Original UX budget', 1, 2000),
    };
  }

  function render() {
    const state = lesson.snapshot();
    const idle = state.phase === 'idle';
    const completed = state.phase === 'complete';
    configuration.disabled = !idle;
    buttons.start.disabled = !idle;
    buttons.cutover.disabled = state.phase !== 'connected-v1';
    buttons.reconnect.disabled = state.phase !== 'disconnected';
    buttons.next.disabled = !completed || state.history.length >= fixtures.limits.attempts;
    prediction.disabled = !completed;
    buttons.prediction.disabled = !completed;
    byId('phase').textContent = `Phase: ${state.phase}. ${idle ? 'Configure the next attempt.' : `Attempt ${state.attempt}; original budget ${state.config.budgetMs} ms locked.`}`;
    byId('history-count').textContent = `${state.history.length} / 8 retained. ${
      state.history.length === 8 ? 'Limit reached; reset explicitly to start again.' : 'Explicit reset or page reload erases this in-memory history.'}`;

    byId('impact').textContent = state.result
      ? `Synthetic user impact: ${state.result.impact.toUpperCase()} — not a live WebSocket or Azure result.`
      : 'Not evaluated — conduct all three actions.';
    byId('impact').dataset.impact = state.result ? state.result.impact : 'not-evaluated';
    byId('result-detail').hidden = !state.result;
    byId('metrics').replaceChildren();
    byId('checks').replaceChildren();
    if (state.result) {
      const result = state.result;
      const metrics = [
        ['Requested resume cursor', display(result.requestedCursor)],
        ['Final acknowledged sequence', display(result.lastAcknowledged)],
        ['Final acknowledged state (expected 60)', display(result.finalState)],
        ['Wire replays / duplicate visible effects', `${display(result.wireReplays)} / ${display(result.duplicateEffects)}`],
        ['Rejected gaps / rejected schemas', `${display(result.rejectedGaps)} / ${display(result.schemaRejects)}`],
        ['Missing user-visible sequences', result.missingVisible === null ? 'unknown' : result.missingVisible.join(', ') || 'none'],
        ['Visible sequence order', result.visibleSequences === null ? 'unknown' : result.visibleSequences.join(', ')],
        ['Recovery gap / original UX budget', `${result.gapMs} / ${result.budgetMs} ms`],
      ];
      for (const [label, value] of metrics) {
        cell(byId('metrics'), label, 'dt');
        cell(byId('metrics'), value, 'dd');
      }
      for (const check of result.checks) {
        const row = document.createElement('tr');
        row.dataset.check = check.id;
        cell(row, check.label);
        cell(row, check.outcome.toUpperCase());
        cell(row, check.detail);
        byId('checks').append(row);
      }
    }

    byId('prediction-result').textContent = state.prediction
      ? `Prediction verifier: ${state.prediction.verdict}. Expected ${state.prediction.expected}; synthetic impact remains ${state.prediction.actual}.`
      : 'Prediction not checked.';
    byId('trace').replaceChildren();
    if (!state.trace.length) cell(byId('trace'), 'No attempt started.', 'li');
    for (const entry of state.trace) {
      cell(byId('trace'), `[${entry.atMs} ms; ${entry.phase}] ${entry.text}`, 'li');
    }
    byId('history').replaceChildren();
    if (!state.history.length) {
      const row = document.createElement('tr');
      cell(row, 'No completed attempts.').colSpan = 7;
      byId('history').append(row);
    }
    for (const attempt of state.history) {
      const row = document.createElement('tr');
      row.dataset.attempt = String(attempt.attempt);
      const result = attempt.result;
      [
        String(attempt.attempt), display(result.requestedCursor), result.impact.toUpperCase(),
        `${result.gapMs} / ${result.budgetMs} ms`,
        `${display(result.wireReplays)} / ${display(result.duplicateEffects)}`,
        `${display(result.lastAcknowledged)} / ${display(result.finalState)}`,
        attempt.prediction ? `${attempt.prediction.verdict} (${attempt.prediction.expected})` : 'Not checked',
      ].forEach((value) => cell(row, value));
      byId('history').append(row);
    }
  }

  function conduct(action, focusId) {
    clearError();
    try {
      action();
      render();
      if (focusId) byId(focusId).focus();
    } catch (failure) {
      error.textContent = failure.message;
      error.hidden = false;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    conduct(() => lesson.start(readConfig()), 'cut-over');
  });
  buttons.cutover.addEventListener('click', () => conduct(() => lesson.cutover(), 'reconnect'));
  buttons.reconnect.addEventListener('click', () => conduct(() => lesson.reconnect(), 'prediction'));
  buttons.prediction.addEventListener('click', () => conduct(() => lesson.checkPrediction(prediction.value)));
  buttons.next.addEventListener('click', () => conduct(() => {
    lesson.nextAttempt();
    prediction.value = '';
  }, 'start-session'));
  buttons.reset.addEventListener('click', () => conduct(() => {
    lesson.reset();
    for (const [field, value] of Object.entries(fixtures.defaults)) fields[field].value = String(value);
    prediction.value = '';
  }, 'start-session'));
  form.addEventListener('input', clearError);
  form.addEventListener('change', clearError);
  render();
}());
