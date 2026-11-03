(function () {
  'use strict';
  const lesson = globalThis.DnsCacheLesson;
  const byId = (id) => document.getElementById(id);
  const form = byId('lesson-controls');
  const controls = {
    policy: byId('retention-policy'), sample: byId('sample-time'), coverage: byId('observation-coverage'),
    outcome: byId('predicted-outcome'), reason: byId('convergence-reason')
  };
  const buttons = {
    switch: byId('publish-answer'), compare: byId('compare-answers'),
    explain: byId('check-explanation'), reset: byId('reset-rehearsal')
  };
  const errorBox = byId('error-message');
  let state = lesson.createState();

  function text(id, value) { byId(id).textContent = value; }
  function clearError() {
    errorBox.textContent = '';
    errorBox.hidden = true;
  }
  function showError(error) {
    errorBox.textContent = `Rehearsal rejected: ${error.message}`;
    errorBox.hidden = false;
    errorBox.focus();
  }
  function token(button) {
    const raw = button.dataset.runId;
    if (typeof raw !== 'string' || !/^[1-9]\d{0,4}$/.test(raw)) throw new TypeError('Invalid run token');
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value > lesson.LIMITS.runId) throw new TypeError('Invalid run token');
    return value;
  }
  function row(values) {
    const result = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      result.append(cell);
    }
    return result;
  }
  function render() {
    const totals = lesson.summary(state);
    const limited = totals.runs === lesson.LIMITS.comparisons;
    buttons.switch.disabled = state.phase !== 'ready' || limited;
    buttons.compare.disabled = state.phase !== 'switched';
    buttons.explain.disabled = state.phase !== 'compared';
    controls.policy.disabled = state.phase !== 'ready' || limited;
    controls.sample.disabled = controls.coverage.disabled = state.phase !== 'switched';
    controls.outcome.disabled = controls.reason.disabled = state.phase !== 'compared';
    for (const button of Object.values(buttons)) button.dataset.runId = String(state.runId);
    text('phase', `Run ${state.runId} · ${state.phase} · ${limited ? '12-comparison limit reached' : 'memory-only fixture'}`);
    text('teaching-clock', `${state.current ? state.current.atSeconds : state.phase === 'ready' ? 0 : 30} synthetic seconds`);
    text('fresh-reference', state.phase === 'ready' ? lesson.FIXTURE.oldAnswer : lesson.FIXTURE.newAnswer);
    text('current-status', state.current
      ? `${state.current.outcome.toUpperCase()} — attempted ${state.current.totals.attempted}, successful ${state.current.totals.successful}, interruptions ${state.current.totals.interruptions}, unknown ${state.current.totals.unknown}.`
      : state.phase === 'ready' ? 'No comparison yet; no outcome claim.'
        : 'Teaching answer switched. Compare the fixed observations; a fresh answer alone proves no convergence.');
    text('sample-agreement', state.current
      ? state.current.answersAgree === null ? 'Sample agreement: unknown — one observation is missing.'
        : `Sample agreement: ${state.current.answersAgree ? 'yes, only these three samples' : 'no, cached answers differ'}.`
      : 'Sample agreement: not measured.');
    text('interpretation', state.current && state.current.explanation
      ? `${state.current.explanation.verdict.toUpperCase()} — measured outcome stays ${state.current.outcome.toUpperCase()}. Retain old cached destinations for the declared overlap; sampled answers do not certify universal convergence.`
      : 'Interpretation: choose an outcome and a reason after comparing.');
    const trace = byId('trace-rows');
    trace.replaceChildren();
    if (state.current) {
      for (const item of state.current.rows) {
        trace.append(row([
          item.resolver, item.source, item.answer ?? 'UNKNOWN', item.destination ?? 'UNKNOWN',
          item.remainingSeconds === null ? 'UNKNOWN' : `${item.remainingSeconds} s`,
          item.usable === null ? 'UNKNOWN' : item.usable ? 'usable' : 'unusable',
          item.latencyMs === null ? 'UNKNOWN' : `${item.latencyMs} ms`,
          item.outcome.toUpperCase()
        ]));
      }
    }
    text('history-summary', `Comparisons ${totals.runs}/12 · attempted ${totals.attempted} · successful ${totals.successful} · interruptions ${totals.interruptions} · unknown ${totals.unknown}`);
    const history = byId('history-rows');
    history.replaceChildren();
    for (const item of state.history) {
      history.append(row([
        item.id, `${item.atSeconds} s`, item.policy, item.coverage, item.outcome.toUpperCase(),
        `${item.totals.successful}/${item.totals.attempted}`, item.totals.interruptions, item.totals.unknown,
        item.explanation ? item.explanation.verdict.toUpperCase() : 'not checked'
      ]));
    }
  }
  function act(type) {
    try {
      const command = { type, runId: token(buttons[type]) };
      if (type === 'switch') command.policy = controls.policy.value;
      if (type === 'compare') Object.assign(command, { sample: controls.sample.value, coverage: controls.coverage.value });
      if (type === 'explain') Object.assign(command, { outcome: controls.outcome.value, reason: controls.reason.value });
      state = lesson.transition(state, command);
      clearError();
      if (type === 'reset') form.reset();
      render();
      if (type === 'reset') (buttons.switch.disabled ? buttons.reset : buttons.switch).focus();
    } catch (error) {
      showError(error);
    }
  }
  form.addEventListener('submit', (event) => event.preventDefault());
  for (const [type, button] of Object.entries(buttons)) button.addEventListener('click', () => act(type));
  render();
}());
