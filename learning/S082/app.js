(function () {
  'use strict';
  const lesson = globalThis.StaleEpochLesson;
  const byId = (id) => document.getElementById(id);
  const form = byId('command-form');
  const interpretationForm = byId('interpret-form');
  let state = lesson.createState();
  const text = (id, value) => { byId(id).textContent = value; };
  function describe(snapshot) {
    if (!snapshot) return 'UNKNOWN - after snapshot not observed';
    return `Epoch ${snapshot.epoch}; deployment ${snapshot.deployment}\n`
      + `Routing: blue ${snapshot.routing.blue}%, green ${snapshot.routing.green}%\n`
      + `Readiness: blue ${snapshot.readiness.blue}, green ${snapshot.readiness.green}`;
  }
  function changes(entry) {
    const metrics = entry.metrics;
    return metrics.protectedChanges === null ? 'unknown (after not observed)'
      : `${metrics.protectedChanges}/2 (routing ${metrics.routingChanges}, readiness ${metrics.readinessChanges})`;
  }
  function appendText(parent, tag, value) {
    const node = document.createElement(tag);
    node.textContent = value;
    parent.append(node);
  }
  function render() {
    const entry = state.records.at(-1);
    const ready = state.phase === 'ready';
    byId('configuration').disabled = !ready;
    byId('deliver').disabled = !ready || state.records.length >= lesson.maxAttempts;
    byId('answer').disabled = state.phase !== 'delivered';
    byId('check-answer').disabled = state.phase !== 'delivered';
    byId('next-attempt').disabled = state.phase !== 'checked' || state.records.length >= lesson.maxAttempts;
    text('progress', `Attempts: ${state.records.length}/${lesson.maxAttempts}; phase: ${state.phase}.`
      + (state.records.length === lesson.maxAttempts ? ' History full. Reset explicitly; no attempts are evicted.' : ''));
    text('totals', ['PASS', 'FAIL', 'UNKNOWN'].map((verdict) =>
      `${verdict} ${state.records.filter((row) => row.verdict === verdict).length}`).join(' · '));
    text('before', describe(entry?.before || lesson.baseline));
    text('after', entry ? describe(entry.after) : 'Not delivered');
    text('outcome', entry?.verdict || 'Not delivered');
    byId('outcome').dataset.verdict = entry?.verdict || 'NONE';
    text('explanation', entry?.explanation
      || 'No command delivered. PASS means this synthetic epoch rule passed, not that users migrated.');
    text('command-evidence', entry
      ? `Command epoch ${entry.command.epoch} (${entry.command.deployment}) vs current ${entry.before.epoch}: `
        + `${entry.command.disposition} / ${entry.command.reason}; target ${entry.command.target}; guard ${entry.input.guard}.`
      : 'No command disposition yet.');
    text('measurements', entry ? `Protected fields changed: ${changes(entry)}.` : 'Protected fields measured: none.');
    text('interpretation', !entry || state.phase === 'ready'
      ? 'Deliver a command before checking an interpretation.'
      : entry.learner
        ? `Your interpretation ${entry.learner.answer} ${entry.learner.correct ? 'matches' : 'does not match'} `
          + `the verifier ${entry.verdict}. The measured result is unchanged.`
        : 'Choose the measured verifier result, then check your interpretation.');
    byId('trace').replaceChildren();
    if (entry) {
      for (const line of [
        `Before: ${describe(entry.before)}`,
        `Requested fixture: ${JSON.stringify(entry.command.requested)}`,
        `Command: epoch ${entry.command.epoch}; ${entry.command.disposition}; reason ${entry.command.reason}.`,
        `After: ${describe(entry.after)}`,
        `Measured protected changes: ${changes(entry)}; verifier ${entry.verdict}.`,
      ]) appendText(byId('trace'), 'li', line);
    }
    byId('history').replaceChildren();
    for (const row of state.records) {
      const tr = document.createElement('tr');
      for (const value of [
        String(row.id),
        `${row.input.epoch}; ${row.input.field}; ${row.input.guard}; ${row.input.observation}`,
        `e${row.command.epoch}: ${row.command.disposition} / ${row.command.reason}`,
        changes(row), row.verdict,
        row.learner ? `${row.learner.answer}: ${row.learner.correct ? 'matches' : 'does not match'}` : 'not checked',
      ]) appendText(tr, 'td', value);
      byId('history').append(tr);
    }
  }
  function clearError() {
    text('lesson-error', '');
    byId('lesson-error').hidden = true;
  }
  function perform(action, focus) {
    try {
      const next = action();
      state = next;
      clearError();
      render();
      byId(focus).focus();
    } catch (error) {
      text('lesson-error', `${error.code || 'ERROR'}: ${error.message}`);
      byId('lesson-error').hidden = false;
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    perform(() => lesson.deliver(state, {
      epoch: byId('epoch').value, field: byId('field').value,
      guard: byId('guard').value, observation: byId('observation').value,
    }), 'outcome');
  });
  interpretationForm.addEventListener('submit', (event) => {
    event.preventDefault();
    perform(() => lesson.interpret(state, byId('answer').value), 'interpretation');
  });
  byId('interpretation').tabIndex = -1;
  byId('next-attempt').addEventListener('click', () => perform(() => {
    const next = lesson.nextAttempt(state);
    interpretationForm.reset();
    return next;
  }, 'epoch'));
  byId('reset-lesson').addEventListener('click', () => {
    state = lesson.createState();
    form.reset();
    interpretationForm.reset();
    clearError();
    render();
    byId('epoch').focus();
  });
  render();
}());
