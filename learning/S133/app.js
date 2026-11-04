(function () {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const text = (id, value) => { byId(id).textContent = value; };
  const form = byId('controls');
  const api = globalThis.FormContinuity;
  if (!api || !['createState', 'execute', 'inspect'].every((name) => typeof api[name] === 'function')) {
    form.addEventListener('submit', (event) => event.preventDefault());
    text('error', 'ERR_MODEL: Safe hold. Required local model DATA did not load. No measured result is available.');
    text('phase', 'unavailable');
    text('status', 'Lesson unavailable; no form journey, validation or submission was performed.');
    text('run-summary', 'No measured result. Restore the local model file and reload.');
    for (const button of form.querySelectorAll('button')) button.disabled = true;
    return;
  }
  let state = api.createState();
  const rejected = [];
  const actionPhases = {
    start: ['idle'], cutover: ['old-step'], continue: ['cutover'], submit: ['continued'],
    retry: ['submitted'], measure: ['submitted', 'retried'], reset: ['idle', 'old-step', 'cutover', 'continued', 'submitted', 'retried', 'measured'],
  };
  function row(body, values, result) {
    const item = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = value;
      item.append(cell);
    }
    if (result) item.className = `result-${result}`;
    body.append(item);
  }
  function list(body, values) {
    body.replaceChildren();
    for (const value of values) {
      const item = document.createElement('li');
      item.textContent = value;
      body.append(item);
    }
  }
  function render() {
    const inspected = api.inspect(state);
    const current = state.current;
    text('phase', state.phase);
    text('history-count', `${state.history.length} / ${api.MAX_HISTORY}`);
    text('active-preset', current ? api.PRESETS[current.presetId] : 'not started');
    text('current-journey', current ? current.form.journeyId : 'not started');
    text('version', current ? current.activeVersion : 'not started');
    text('answers', current ? `symbol=${current.form.answers.symbol}; colour=${current.form.answers.colour === null ? 'KNOWN LOST' : current.form.answers.colour}; delivery=${current.form.answers.delivery === null ? 'not completed' : current.form.answers.delivery}` : 'not started');
    text('prior-validation', current ? `${current.form.priorValidation.status}; schema=${current.form.priorValidation.schema}` : 'not started');
    text('prior-token', current ? `${current.form.priorValidation.tokenValue}; accepted=${current.form.priorValidation.tokenAccepted}; bound=${current.form.priorValidation.journeyId}/${current.form.priorValidation.identityId}/${current.form.priorValidation.sessionId}` : 'not started');
    text('identity-session', current ? `${current.form.identityId}; ${current.form.sessionId}` : 'not started');
    text('permissions', current ? `continue=${current.form.permissions.continue}; submit=${current.form.permissions.submit}` : 'not started');
    text('final-step', current ? `${current.finalStep}; validation=${current.finalValidation === null ? 'not observed' : current.finalValidation.status}` : 'not attempted');
    text('attempt-summary', current ? `${current.attempts.length} attempts; ${current.effects === null ? 'UNKNOWN observed effect count' : `${current.effects.length} observed fictional effects`}` : '0 attempts; no measured final effect');
    text('http-statuses', current && current.attempts.length ? `${current.attempts.map((attempt) => attempt.httpStatus).join(', ')} (DATA ONLY; not journey proof)` : 'not observed');
    const report = inspected.lastReport;
    text('outcome', report ? `${report.outcome}${report.incomplete ? ' (incomplete reset)' : ''}` : 'no measured journey');
    text('verifier', report ? (report.verifierPassed === null ? 'not evaluated: incomplete' : (report.verifierPassed ? 'matched fixed preset expectation' : 'MISMATCH - investigate')) : 'not measured');
    const counts = inspected.counts;
    text('run-summary', `attempted=${counts.attempted}; preserved=${counts.preserved}; interrupted=${counts.interrupted}; unknown=${counts.unknown}; unmeasured=${counts.attempted - counts.preserved - counts.interrupted - counts.unknown}`);
    byId('checks-body').replaceChildren();
    for (const check of inspected.checks) row(byId('checks-body'), [check.label, check.detail, check.result], check.result);
    byId('attempts-body').replaceChildren();
    if (current) {
      for (const attempt of current.attempts) row(byId('attempts-body'), [
        `${attempt.ordinal} / ${attempt.key} / ${attempt.version}`,
        `${attempt.httpStatus} / ${attempt.clientResult}`,
        `${attempt.receiptId === null ? 'UNKNOWN or rejected; see client DATA' : attempt.receiptId} / deduplicated=${attempt.deduplicated}`,
      ]);
    }
    list(byId('history'), state.history.map((event) => `${event.ordinal}. ${event.command.type}${event.command.presetId ? ` (${event.command.presetId})` : ''} | ${event.runId === null ? 'no active run' : event.runId} | phase=${event.phaseAfter}`));
    list(byId('rejected-history'), rejected);
    byId('run-history').replaceChildren();
    for (const run of state.runs) {
      const item = document.createElement('li');
      const report = run.report;
      const summary = document.createElement('p');
      summary.textContent = `${run.runId} | ${api.PRESETS[run.presetId]} | ${report.outcome}${report.incomplete ? ' (incomplete reset)' : ''} | attempts=${report.attemptCount}; effects=${report.effectCount === null ? 'UNKNOWN' : report.effectCount}; verifier=${report.verifierPassed === null ? 'not evaluated' : report.verifierPassed}`;
      const details = document.createElement('details');
      const heading = document.createElement('summary');
      heading.textContent = `Inspect retained fixed DATA for ${run.runId}`;
      const data = document.createElement('pre');
      data.textContent = JSON.stringify(run, null, 2);
      details.append(heading, data);
      item.append(summary, details);
      byId('run-history').append(item);
    }
    for (const [action, phases] of Object.entries(actionPhases)) {
      const withinBounds = state.history.length < api.MAX_HISTORY && (action !== 'start' || state.runs.length < api.MAX_RUNS);
      byId(`${action}-button`).setAttribute('aria-disabled', String(!withinBounds || !phases.includes(state.phase)));
    }
  }
  function perform(command) {
    try {
      const next = api.execute(state, command);
      state = next;
      if (command.type === 'reset') HTMLFormElement.prototype.reset.call(form);
      render();
      text('error', '');
      text('status', `Accepted ${command.type}; phase=${state.phase}. Earlier failures, unknowns and rejected actions are retained.`);
      if (command.type === 'reset') byId('preset').focus();
      return true;
    } catch (error) {
      const message = error instanceof api.LessonError ? error.message : 'ERR_UI: Safe hold. The lesson could not complete this action; no successful result is inferred.';
      if (rejected.length < 12) rejected.push(`${rejected.length + 1}. rejected ${command.type} | ${message}`);
      list(byId('rejected-history'), rejected);
      text('error', rejected.length < 12 ? message : `${message} Retained rejected-action history is bounded at 12; no earlier entries were discarded.`);
      text('status', 'Rejected action; prior journey state, measured results and accepted history are unchanged.');
      if (command.type === 'start') byId('preset').focus();
      return false;
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    perform({ type: 'start', presetId: byId('preset').value });
  });
  for (const action of ['cutover', 'continue', 'submit', 'retry', 'measure', 'reset']) {
    byId(`${action}-button`).addEventListener('click', () => perform({ type: action }));
  }
  render();
}());
