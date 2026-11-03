(function () {
  'use strict';
  const { DEFAULTS, createLesson } = globalThis.BatchRetirementLesson;
  const lesson = createLesson();
  const byId = (id) => document.getElementById(id);
  const fields = {
    retirement: byId('retirement'), checkpoint: byId('checkpoint'),
    effects: byId('effects'), observation: byId('observation'),
    resumeDelayMs: byId('resume-delay-ms'), budgetMs: byId('budget-ms'),
  };
  const label = (value) => value === null ? 'unknown' : Array.isArray(value) ? value.join(', ') || 'none' : String(value);
  function text(tag, value) {
    const node = document.createElement(tag);
    node.textContent = value;
    return node;
  }
  function row(values) {
    const node = document.createElement('tr');
    values.forEach((value) => node.append(text('td', String(value))));
    return node;
  }
  function clearError() {
    byId('input-error').hidden = true;
    byId('input-error').textContent = '';
    Object.values(fields).forEach((field) => field.removeAttribute('aria-invalid'));
    byId('prediction').removeAttribute('aria-invalid');
  }
  function number(key, name, min, max) {
    const raw = fields[key].value;
    if (!/^(0|[1-9]\d*)$/.test(raw) || Number(raw) < min || Number(raw) > max) {
      const error = new Error(`${name}: enter a whole number ${min}-${max}, without spaces or exponent notation.`);
      error.field = fields[key];
      throw error;
    }
    return Number(raw);
  }
  function readConfig() {
    return {
      retirement: fields.retirement.value, checkpoint: fields.checkpoint.value,
      effects: fields.effects.value, observation: fields.observation.value,
      resumeDelayMs: number('resumeDelayMs', 'Resume delay', 0, 1000),
      budgetMs: number('budgetMs', 'Original budget', 1, 2000),
    };
  }
  function render(state) {
    byId('phase').textContent = `Phase: ${state.phase}`;
    byId('job-status').textContent = `Job: ${state.jobStatus}`;
    byId('verdict').textContent = state.result ?
      `Synthetic verdict: ${state.result.verdict.toUpperCase()} | User impact: ${state.result.userOutcome}` : 'Not verified.';
    byId('progress').textContent = state.progress ?
      `At retirement/pre-verification: ${state.progress.committedItems.length} committed items; ` +
      `${state.progress.remainingItems} remaining; checkpoint cursor ${label(state.progress.checkpointCursor)}; ` +
      `${state.progress.elapsedMs} synthetic ms. This is not a final completion verdict.` : 'No job started.';
    byId('configuration').disabled = state.phase !== 'idle';
    byId('start-job').disabled = state.phase !== 'idle' || state.history.length >= 8;
    byId('retire-worker').disabled = state.phase !== 'active';
    byId('verify-job').disabled = state.phase !== 'retired';
    byId('new-attempt').disabled = state.phase !== 'complete';
    byId('history-limit').hidden = state.history.length < 8;
    byId('prediction').disabled = state.phase !== 'complete' || state.prediction !== null;
    byId('check-prediction').disabled = byId('prediction').disabled;
    byId('prediction').value = state.prediction ? state.prediction.expected : '';
    byId('prediction-result').textContent = state.prediction ?
      `Prediction verifier: ${state.prediction.verifier} | predicted ${state.prediction.expected}; actual ${state.prediction.actual}. Job impact is unchanged.` :
      'Prediction not checked.';
    byId('result-detail').hidden = state.result === null;
    byId('metrics').replaceChildren();
    byId('checks').replaceChildren();
    byId('item-effects').replaceChildren();
    if (state.result) {
      const m = state.result.metrics;
      const metrics = [
        ['Unique items / expected', `${label(m.uniqueItems)} / 6`],
        ['Missing required items', label(m.missingItems)],
        ['Effect total / expected', `${label(m.effectTotal)} / 60`],
        ['Duplicate effects', label(m.duplicateEffects)],
        ['Replayed items attempted', label(m.replayedItems)],
        ['Durable checkpoint cursor', label(m.checkpointCursor)],
        ['Remaining at retirement', label(m.remainingAtRetirement)],
        ['Falsely declared complete', m.falselyCompleted ? 'yes' : 'no'],
        ['Known elapsed / original budget', `${m.elapsedMs} / ${m.budgetMs} synthetic ms (${m.elapsedKind})`],
      ];
      metrics.forEach(([name, value]) => byId('metrics').append(text('dt', name), text('dd', value)));
      for (let index = 0; index < 6; index++) {
        byId('item-effects').append(row([index + 1, m.effectCounts === null ? 'unknown' : m.effectCounts[index]]));
      }
      state.result.checks.forEach((entry) => {
        const node = row([entry.name, entry.status.toUpperCase(), entry.detail]);
        node.dataset.check = entry.id;
        byId('checks').append(node);
      });
    }
    byId('trace').replaceChildren(...(state.trace.length ? state.trace : ['No attempt started.']).map((line) => text('li', line)));
    byId('history').replaceChildren();
    if (!state.history.length) {
      const empty = row(['No completed attempts.']);
      empty.firstChild.colSpan = 5;
      byId('history').append(empty);
    }
    state.history.forEach((entry) => {
      const c = entry.config, m = entry.result.metrics;
      const node = row([
        entry.attempt,
        `${c.retirement}; ${c.checkpoint}; ${c.effects}; ${c.observation}; delay ${c.resumeDelayMs} ms; original budget ${c.budgetMs} ms`,
        `${entry.result.verdict.toUpperCase()} / ${entry.result.userOutcome}`,
        `items ${label(m.uniqueItems)}/6; effects ${label(m.effectTotal)}/60; duplicates ${label(m.duplicateEffects)}; elapsed ${m.elapsedMs}/${m.budgetMs} ms`,
        entry.prediction ? `${entry.prediction.verifier} (predicted ${entry.prediction.expected})` : 'Not checked',
      ]);
      node.dataset.attempt = String(entry.attempt);
      byId('history').append(node);
    });
  }
  function act(action, focusId) {
    clearError();
    try {
      render(action());
      if (focusId) byId(focusId).focus();
    } catch (error) {
      render(lesson.snapshot());
      byId('input-error').textContent = error.message;
      byId('input-error').hidden = false;
      if (error.field) error.field.setAttribute('aria-invalid', 'true');
      (error.field || byId('input-error')).focus();
    }
  }
  byId('rehearsal-form').addEventListener('submit', (event) => {
    event.preventDefault();
    act(() => lesson.start(readConfig()), 'retire-worker');
  });
  byId('retire-worker').addEventListener('click', () => act(() => lesson.retire(), 'verify-job'));
  byId('verify-job').addEventListener('click', () => act(() => lesson.verify(), 'prediction'));
  byId('new-attempt').addEventListener('click', () => act(() => lesson.next(), 'start-job'));
  byId('check-prediction').addEventListener('click', () => act(() => {
    if (!byId('prediction').value) {
      const error = new Error('Choose a prediction before checking it.');
      error.field = byId('prediction');
      throw error;
    }
    return lesson.predict(byId('prediction').value);
  }, 'new-attempt'));
  byId('reset-rehearsal').addEventListener('click', () => act(() => {
    Object.entries(DEFAULTS).forEach(([key, value]) => { fields[key].value = String(value); });
    return lesson.reset();
  }, 'start-job'));
  render(lesson.snapshot());
}());
