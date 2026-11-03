(function () {
  'use strict';
  const lesson = globalThis.CacheOutageLesson;
  const byId = (id) => document.getElementById(id);
  const attemptForm = byId('attempt-form');
  const checkForm = byId('check-form');
  const errorBox = byId('input-error');
  let state = lesson.create();

  function clearError() {
    errorBox.textContent = '';
    errorBox.hidden = true;
    document.querySelectorAll('[aria-invalid]').forEach((element) => element.removeAttribute('aria-invalid'));
  }
  function act(action, focusId) {
    try {
      const nextState = action();
      state = nextState;
      clearError();
      render();
      if (focusId) byId(typeof focusId === 'function' ? focusId() : focusId).focus();
    } catch (error) {
      errorBox.textContent = error instanceof RangeError ? error.message : 'The lesson action was rejected. Reset the rehearsal to recover.';
      errorBox.hidden = false;
      const field = byId(error.field);
      if (field && field.matches('select')) {
        field.setAttribute('aria-invalid', 'true');
        field.focus();
      } else errorBox.focus();
    }
  }
  function readConfig() {
    const budget = byId('budget').value;
    return {
      cache: byId('cache').value, recovery: byId('recovery').value, durable: byId('durable').value,
      budgetMs: ['80', '110', '150'].includes(budget) ? Number(budget) : budget,
    };
  }
  function nativeReset() {
    attemptForm.reset();
    checkForm.reset();
  }
  function traceText(entry) {
    return entry.result.trace.map((event) =>
      `${event.elapsedMs === null ? '?' : event.elapsedMs} ms | ${event.source} | ${event.message}`).join('\n');
  }
  function render() {
    const ready = state.phase === 'configuring';
    byId('phase').textContent = `Phase: ${state.phase}`;
    byId('configuration').disabled = !ready;
    byId('run-attempt').disabled = !ready;
    byId('prediction-controls').disabled = state.phase !== 'observed';
    byId('new-attempt').disabled = state.phase !== 'checked' || state.history.length >= lesson.MAX_HISTORY;
    byId('history-count').textContent = `Retained attempts: ${state.history.length} / ${lesson.MAX_HISTORY}`;
    const current = state.current;
    byId('prediction-result').textContent = !current || current.predictionCorrect === null
      ? 'Prediction not checked.'
      : `Prediction ${current.predictionCorrect ? 'correct' : 'incorrect'}; actual result remains ${current.result.classification}.`;
    const result = current && current.result;
    byId('outcome').textContent = result
      ? `${result.classification} — ${result.reason}`
      : 'Not evaluated — no recovery proof.';
    byId('metrics').textContent = result
      ? `Elapsed: ${result.elapsedMs === null ? 'unknown' : result.elapsedMs} synthetic ms; budget: ${result.budgetMs} ms; required state: ${result.requiredStateValid === null ? 'unknown' : result.requiredStateValid ? 'valid' : 'invalid'}.`
      : 'No attempt measured.';
    byId('detail').textContent = result ? result.detail : '';
    byId('profile').textContent = !result || result.profile === null
      ? 'No returned profile observation.' : JSON.stringify(result.profile, null, 2);
    const trace = byId('trace');
    trace.replaceChildren();
    for (const event of result ? result.trace : [{ elapsedMs: null, source: '', message: 'No attempt started.' }]) {
      const item = document.createElement('li');
      item.textContent = result ? `${event.elapsedMs === null ? '?' : event.elapsedMs} ms | ${event.source} | ${event.message}` : event.message;
      trace.append(item);
    }
    const counts = lesson.summary(state);
    byId('totals').textContent = `Measured attempts: ${counts.total}; SUCCESS ${counts.SUCCESS}; FAILURE ${counts.FAILURE}; UNKNOWN ${counts.UNKNOWN}.${counts.total ? ' All observed results counted; a learning check cannot change them.' : ' No recovery proof.'}`;
    const history = byId('history');
    history.replaceChildren();
    for (const entry of state.history) {
      const row = document.createElement('tr');
      const config = entry.config;
      const values = [
        String(entry.attempt),
        `cache=${config.cache}; recovery=${config.recovery}; durable=${config.durable}; budget=${config.budgetMs}`,
        `${entry.result.classification}: ${entry.result.reason}`,
        `${entry.result.elapsedMs === null ? 'unknown' : entry.result.elapsedMs} / ${config.budgetMs} ms; state=${entry.result.requiredStateValid === null ? 'unknown' : entry.result.requiredStateValid}`,
        entry.predictionCorrect === null ? 'Unchecked' : `${entry.prediction}: ${entry.predictionCorrect ? 'correct' : 'incorrect'}`,
      ];
      for (const value of values) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      const cell = document.createElement('td');
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = `Trace for attempt ${entry.attempt}`;
      const pre = document.createElement('pre');
      pre.textContent = traceText(entry);
      details.append(summary, pre);
      cell.append(details);
      row.append(cell);
      history.append(row);
    }
  }
  attemptForm.addEventListener('submit', (event) => {
    event.preventDefault();
    act(() => lesson.run(lesson.configure(state, readConfig())), 'prediction');
  });
  checkForm.addEventListener('submit', (event) => {
    event.preventDefault();
    act(() => lesson.check(state, byId('prediction').value),
      () => state.history.length < lesson.MAX_HISTORY ? 'new-attempt' : 'reset-rehearsal');
  });
  byId('new-attempt').addEventListener('click', () => {
    act(() => {
      const next = lesson.next(state);
      nativeReset();
      return next;
    }, 'cache');
  });
  byId('reset-rehearsal').addEventListener('click', () => {
    act(() => {
      const next = lesson.reset(state);
      nativeReset();
      return next;
    }, 'cache');
  });
  render();
}());
