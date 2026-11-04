(function () {
  'use strict';
  const model = globalThis.S135Lesson;
  const form = document.getElementById('controls');
  const element = (id) => document.getElementById(id);
  const preset = element('preset');
  const eventToken = element('event-token');
  const budget = element('budget');
  const errorRegion = element('error');
  const buttons = ['load', 'cutover', 'redeliver', 'measure', 'reset-lesson'].map(element);
  let state;
  let unavailable = false;

  function text(id, value) { element(id).textContent = String(value); }

  function rows(id, records, cells) {
    const body = element(id);
    const fragment = document.createDocumentFragment();
    for (const record of records) {
      const row = document.createElement('tr');
      row.dataset.run = String(record.runNumber);
      if (record.outcome) row.className = record.outcome;
      for (const value of cells(record)) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      }
      fragment.append(row);
    }
    body.replaceChildren(fragment);
  }

  function clearError() {
    errorRegion.textContent = '';
    eventToken.removeAttribute('aria-invalid');
    budget.removeAttribute('aria-invalid');
  }

  function render(message) {
    const summary = model.summarize(state);
    text('phase', state.phase);
    text('history-count', `${summary.actions} / ${model.CONFIG.maximumActions}`);
    text('attempt-count', summary.deliveryAttempts);
    text('event-count', summary.measuredEvents);
    text('positive-count', summary.positive);
    text('negative-count', summary.negative);
    text('unknown-count', summary.unknown);
    text('unknown-attempt-count', summary.retainedUnknownAttempts);
    text('preset-explanation', Object.hasOwn(model.PRESETS, preset.value)
      ? model.PRESETS[preset.value].explanation : 'Choose one exact fixed preset DATA identifier.');
    text('active-run', state.active
      ? `Rehearsal ${state.active.runNumber}: ${state.active.presetId}; SAME event ${state.active.eventId}; original start ${state.active.originalStartMs} ms, budget ${state.active.budgetMs} ms.`
      : 'No rehearsal loaded. Each rehearsal reuses fixed fictional DATA, not new real events.');
    const canLoad = ['ready', 'measured'].includes(state.phase) && summary.actions < model.CONFIG.maximumActions;
    preset.disabled = !canLoad;
    eventToken.disabled = !canLoad;
    budget.disabled = !canLoad;
    element('load').disabled = !canLoad;
    element('cutover').disabled = state.phase !== 'loaded';
    element('redeliver').disabled = state.phase !== 'cutover';
    element('measure').disabled = state.phase !== 'redelivered';
    element('reset-lesson').disabled = false;
    text('limit', summary.actions === model.CONFIG.maximumActions
      ? '16 / 16 actions retained. Reset lesson is required; earlier failures and unknowns are not pruned.'
      : 'Maximum four rehearsals / sixteen actions; reset is explicit and page-local.');
    rows('attempt-rows', state.attempts, (attempt) => [
      attempt.runNumber, attempt.deliveryId, attempt.eventId, attempt.version, attempt.key,
      attempt.completion, attempt.acknowledgement, attempt.dedupState,
      attempt.effectsAfter === null ? 'Unobserved' : attempt.effectsAfter.length,
      attempt.effectsAfter === null ? 'Unobserved' : attempt.effectsAfter.map((effect) => `${effect.effectId}: ${effect.state}/${effect.result}`).join('; '),
      `${attempt.elapsedMs} / ${model.CONFIG.budgetMs}`,
    ]);
    rows('result-rows', state.results, (result) => [
      result.runNumber, result.presetId, result.eventCount, result.deliveryAttempts,
      result.observedEffects === null ? 'Unobserved' : result.observedEffects,
      result.verifiedCorrectBusinessResults, result.unknownAttemptCount,
      `${result.outcome} / ${result.verification}`,
      `${result.reasons.join(' ')} ${result.recovery}`,
    ]);
    rows('history-rows', state.history, (entry) => [entry.step, entry.runNumber, entry.command.type, entry.detail]);
    const suffix = ` Retained event results: ${summary.positive} positive, ${summary.negative} negative, ${summary.unknown} unknown.`;
    text('status', message + suffix + (summary.actions === model.CONFIG.maximumActions ? ' Action limit reached; reset required.' : ''));
  }

  function reject(error) {
    if (!unavailable) render('Command rejected; all prior attempt DATA and results remain unchanged.');
    errorRegion.textContent = `${error.code || 'ERR_LESSON_UI'}: ${error.message}`;
    if (error.code === 'ERR_LESSON_INPUT') {
      if (eventToken.value !== model.CONFIG.eventId) eventToken.setAttribute('aria-invalid', 'true');
      if (budget.value !== '1000') budget.setAttribute('aria-invalid', 'true');
    }
    errorRegion.focus();
  }

  function conduct(command) {
    if (unavailable) return;
    try {
      const next = model.execute(state, command);
      state = next;
      clearError();
      const messages = {
        load: 'Loaded first delivery DATA. No business result has been verified.',
        cutover: 'Recorded fictional v1 -> v2 cutover. No new delivery or business effect.',
        redeliver: 'Loaded delayed retry DATA: two attempts for ONE event. Measure before claiming a result.',
        measure: 'Measured original business event DATA.',
      };
      const result = state.results[state.results.length - 1];
      render(command.type === 'measure'
        ? `${messages.measure} Outcome ${result.outcome}; ${result.verification}. ${result.recovery}`
        : messages[command.type]);
    } catch (error) { reject(error); }
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (unavailable) return;
    try {
      if (budget.value !== '1000') {
        throw new model.LessonGuardError('ERR_LESSON_INPUT', 'Budget DATA must be exact unpadded decimal 1000 ms.');
      }
      conduct({ type: 'load', presetId: preset.value, eventId: eventToken.value, budgetMs: 1000 });
    } catch (error) { reject(error); }
  });
  for (const action of ['cutover', 'redeliver', 'measure']) {
    element(action).addEventListener('click', function () { conduct({ type: action }); });
  }
  preset.addEventListener('change', function () {
    if (!unavailable && Object.hasOwn(model.PRESETS, preset.value)) {
      text('preset-explanation', model.PRESETS[preset.value].explanation);
    }
  });
  document.getElementById('reset-lesson').addEventListener('click', function () {
    if (unavailable) return;
    try {
      HTMLFormElement.prototype.reset.call(form);
      state = model.createState();
      clearError();
      render('Reset only this page in-memory rehearsal. Historical captured proof is unchanged.');
      preset.focus();
    } catch (error) { reject(error); }
  });

  try {
    if (!model || typeof model.createState !== 'function' || typeof model.execute !== 'function'
        || typeof model.summarize !== 'function') {
      throw new Error('Local lesson DATA model is unavailable. No event or business result was verified.');
    }
    state = model.createState();
    render('Ready to inspect fixed fictional DATA. Not yet verified.');
  } catch (error) {
    unavailable = true;
    for (const control of [...buttons, preset, eventToken, budget]) control.disabled = true;
    text('phase', 'unavailable');
    text('status', 'Lesson unavailable; no measured event or verified business result.');
    errorRegion.textContent = `ERR_LESSON_UNAVAILABLE: ${error.message}`;
    errorRegion.focus();
  }
}());
