'use strict';
(function () {
  const lesson = globalThis.S049Lesson.createLesson();
  const byId = (id) => document.getElementById(id);
  const form = byId('controls');
  const fields = {
    deduplication: byId('deduplication'),
    retryKey: byId('retry-key'),
    retryPayload: byId('retry-payload'),
    retryResponse: byId('retry-response'),
    retryAfterMs: byId('retry-after'),
    deadlineMs: byId('deadline'),
  };
  const controls = {
    commit: byId('commit-post'), retry: byId('retry-post'),
    prediction: byId('prediction'), check: byId('check-prediction'),
    next: byId('new-attempt'), reset: byId('reset-lesson'),
  };
  const phases = {
    configure: 'Configure: choose conditions, then commit the first POST.',
    ambiguous: 'Ambiguous: the first POST committed one effect; its response was lost. Retry once.',
    observed: 'Observed: inspect the ledger and client outcome, then check your prediction.',
    complete: 'Complete: result retained. Start another attempt or explicitly reset.',
  };
  function text(id, value) { byId(id).textContent = String(value); }
  function item(tag, value) {
    const element = document.createElement(tag);
    element.textContent = String(value);
    return element;
  }
  function render() {
    const state = lesson.snapshot();
    byId('configuration').disabled = state.phase !== 'configure';
    Object.values(fields).forEach((field) => { field.disabled = state.phase !== 'configure'; });
    if (state.phase === 'configure') {
      Object.entries(fields).forEach(([key, field]) => { field.value = state.config[key]; });
      controls.prediction.value = '';
    }
    controls.commit.disabled = state.phase !== 'configure';
    controls.retry.disabled = state.phase !== 'ambiguous';
    controls.prediction.disabled = state.phase !== 'observed';
    controls.check.disabled = state.phase !== 'observed';
    controls.next.disabled = state.phase !== 'complete' || state.history.length >= 6;
    text('phase', phases[state.phase]);
    text('effect-count', state.effects.length);
    text('total-units', state.effects.reduce((sum, effect) => sum + effect.units, 0));
    text('post-count', state.postCount);
    text('client-result', `${state.client.status}${state.client.effectId ? `: ${state.client.effectId}, ${state.client.units} units` : ''}`);
    text('clock', `${state.elapsedMs} / ${state.config.deadlineMs} synthetic ms`);
    const outcome = byId('outcome');
    outcome.textContent = state.result ? state.result.outcome.toUpperCase() : 'Not assessed';
    outcome.dataset.outcome = state.result ? state.result.outcome : 'not-assessed';
    byId('reasons').replaceChildren(...(state.result ? state.result.reasons : []).map((reason) => item('li', reason)));
    byId('ledger').replaceChildren(...state.effects.map((effect) => {
      const row = document.createElement('tr');
      row.append(...[effect.effectId, effect.key || '(missing)', effect.operation, effect.units].map((value) => item('td', value)));
      return row;
    }));
    byId('trace').replaceChildren(...state.trace.map((event) => item('li', `${event.atMs} ms — ${event.event}`)));
    text('prediction-feedback', state.prediction
      ? `${state.prediction.correct ? 'Correct prediction.' : 'Prediction did not match.'} User impact remains ${state.result.outcome.toUpperCase()}.`
      : '');
    text('history-count', `${state.history.length} / 6 results retained`);
    byId('history-limit').hidden = state.history.length < 6;
    byId('history').replaceChildren(...state.history.map((run) => {
      const row = document.createElement('li');
      row.append(item('p', `Attempt ${run.runId}: ${run.result.outcome.toUpperCase()}; ${run.result.effectCount} business effect(s); client ${run.client.status}; ${run.result.elapsedMs}/${run.result.deadlineMs} synthetic ms. Prediction ${run.prediction.correct ? 'matched' : 'did not match'}.`));
      const details = document.createElement('details');
      details.append(item('summary', 'Retained configuration, ledger and trace'));
      details.append(item('pre', JSON.stringify(run, null, 2)));
      row.append(details);
      return row;
    }));
  }
  function perform(action, focusTarget, message) {
    try {
      action();
      byId('error').hidden = true;
      text('error', '');
      render();
      if (message) text('phase', message);
      const focus = focusTarget();
      if (focus) focus.focus();
    } catch (error) {
      text('error', error.message);
      byId('error').hidden = false;
      byId('error').focus();
    }
  }
  function configuration() {
    const input = {};
    for (const [key, field] of Object.entries(fields)) {
      const value = field.value;
      if (['retryAfterMs', 'deadlineMs'].includes(key)) {
        if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error(`${key} must be a whole decimal number without signs or exponent notation.`);
        input[key] = Number(value);
      } else input[key] = value;
    }
    return input;
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    perform(() => lesson.commitAndLoseResponse(configuration()), () => controls.retry);
  });
  controls.retry.addEventListener('click', () => perform(() => lesson.retry(), () => controls.prediction));
  controls.check.addEventListener('click', () => perform(
    () => lesson.checkPrediction(controls.prediction.value),
    () => controls.next.disabled ? controls.reset : controls.next,
  ));
  controls.next.addEventListener('click', () => perform(() => lesson.newAttempt(), () => fields.deduplication));
  controls.reset.addEventListener('click', () => perform(
    () => lesson.reset(), () => fields.deduplication,
    'Reset: exact defaults restored; all in-memory history and synthetic effects cleared.',
  ));
  render();
}());
