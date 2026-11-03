(function () {
  'use strict';
  const model = window.StableEndpointLesson;
  const element = (id) => document.getElementById(id);
  const form = element('operator-controls');
  const errorPanel = element('error-panel');
  if (!model) {
    errorPanel.hidden = false;
    errorPanel.textContent = 'Lesson model unavailable. Reload the complete local bundle; no live fallback exists.';
    document.querySelectorAll('button, select').forEach((control) => { control.disabled = true; });
    errorPanel.focus();
    return;
  }
  let state = model.createState();
  const descriptions = {
    endpoint: 'Exact public hostname and getProfile endpoint retained',
    backendChange: 'Actual blue release changed to green',
    http: 'HTTP 200 before and after',
    contract: 'Existing profile.v1 payload and caller data contract retained',
    authentication: 'Same signed-in synthetic identity retained',
    navigation: 'Profile navigation and displayed name retained',
    budget: 'Complete synthetic journey stays within 100 ms',
  };
  function text(tag, content) {
    const node = document.createElement(tag);
    node.textContent = content;
    return node;
  }
  function clearError() {
    errorPanel.textContent = '';
    errorPanel.hidden = true;
  }
  function showError(error) {
    errorPanel.textContent = `${error.code || 'ERR_LESSON_UI'}: ${error.message || 'Rehearsal action failed. Reset or reload the local bundle.'}`;
    errorPanel.hidden = false;
    errorPanel.focus();
  }
  function currentRecord() {
    return model.results(state).find((record) => record.runId === state.runId) || null;
  }
  function clearCheck() {
    element('learner-check').textContent = 'Not checked.';
    element('learner-check').dataset.verdict = 'unchecked';
  }
  function renderCaller(caller) {
    const item = document.createElement('li');
    item.dataset.caller = caller.id;
    item.append(text('h3', `${caller.id}: ${caller.outcome}`));
    const after = caller.after;
    const observations = [
      ['Caller endpoint', `${caller.before.endpoint} → ${after ? after.endpoint : 'unknown'}`],
      ['Observed backend release', `${caller.before.backendRelease} → ${after ? after.backendRelease : 'unknown'}`],
      ['Observed API contract', `${caller.before.apiContract} → ${after ? after.apiContract : 'unknown'}`],
      ['HTTP status', `${caller.before.httpStatus} → ${after ? after.httpStatus : 'unknown'}`],
      ['Identity', `${caller.before.authentication.subject} → ${after ? String(after.authentication.subject) : 'unknown'}`],
      ['Navigation', `${caller.before.navigation.page} → ${after ? after.navigation.page : 'unknown'}`],
      ['Summed synthetic journey time', caller.journeyMs === null ? 'Unknown completion; not a successful journey' : `${caller.journeyMs} ms / 100 ms`],
    ];
    const list = document.createElement('dl');
    observations.forEach(([label, value]) => list.append(text('dt', label), text('dd', value)));
    item.append(list);
    const checks = document.createElement('ul');
    checks.className = 'checks';
    Object.entries(caller.checks).forEach(([key, value]) => {
      const result = value === null ? 'UNKNOWN' : value ? 'PASS' : 'FAIL';
      checks.append(text('li', `${result}: ${descriptions[key]}`));
    });
    item.append(checks);
    return item;
  }
  function render() {
    const all = model.results(state);
    const record = currentRecord();
    element('condition').disabled = state.phase !== 'prepared';
    element('switch-backend').disabled = state.phase !== 'prepared';
    element('measure-journeys').disabled = state.phase !== 'switched';
    element('restore-blue').disabled = !['switched', 'measured'].includes(state.phase);
    element('check-outcome').disabled = record === null;
    element('operator-status').textContent = `Run ${state.runId} / 8; phase ${state.phase}; configured backend ${state.backend} (${model.constants.backendReleases[state.backend]}). ${state.history.length} / 40 accepted actions.`;
    element('cleanup-status').textContent = `No resources created. Synthetic route is ${state.backend}; restoring or resetting never erases prior outcomes.`;
    element('outcome').dataset.outcome = record ? record.outcome : 'unmeasured';
    element('outcome').textContent = record ? `Measured outcome: ${record.outcome}` : `Not measured in run ${state.runId}; earlier results are retained below.`;
    element('verifier').textContent = record ? record.verifier : 'Not run';
    element('user-impact').textContent = record ? record.impact : 'No observed transition';
    const explanations = {
      positive: 'Both existing callers kept their endpoint, profile.v1 contract, identity and navigation while the actual backend release changed. An additive optional field did not change the API contract. This is synthetic evidence only.',
      negative: 'A required complete-journey check failed despite HTTP 200 and an observed green release. Matching this expected negative test does not turn interrupted callers into successful migrations.',
      unknown: 'Both caller journeys started. The browser caller passed; the service completion was not observed. One unknown remains in the two-attempt denominator and cannot be counted as successful.',
      'not-transitioned': 'The configured route says green, but both actual observations remain on blue. Working old-only callers and route intent do not establish migration.',
    };
    element('explanation').textContent = record ? explanations[record.outcome]
      : 'Measure after switching. A stable route, HTTP 200, or an empty sample alone cannot prove migration.';
    element('caller-results').replaceChildren(...(record ? record.callers.map(renderCaller) : []));
    const totals = model.summary(state);
    const ids = { attempted: 'attempted', successful: 'successful', interrupted: 'interrupted',
      unknown: 'unknown', notTransitioned: 'not-transitioned' };
    Object.entries(ids).forEach(([key, id]) => { element(id).textContent = String(totals[key]); });
    element('denominator').textContent = totals.attempted
      ? `${totals.successful} / ${totals.attempted} complete successful synthetic caller transitions; interruptions, unknowns and not-transitioned callers are retained. Not a reliability certification.`
      : 'Empty sample: no migration evidence.';
    element('history').replaceChildren(...all.map((entry) => {
      const item = text('li', `Run ${entry.runId}: ${entry.condition}; outcome ${entry.outcome}; verifier ${entry.verifier}; user impact ${entry.impact}.`);
      item.dataset.runId = String(entry.runId);
      item.dataset.outcome = entry.outcome;
      const details = document.createElement('details');
      details.append(text('summary', 'Raw synthetic observations'), text('pre', JSON.stringify(entry, null, 2)));
      item.append(details);
      return item;
    }));
    element('action-history').replaceChildren(...state.history.map((event) =>
      text('li', `#${event.sequence} Run ${event.runId}: ${event.command.type}${event.command.condition ? ` (${event.command.condition})` : ''}${event.measurement ? ` → ${event.measurement.outcome}` : ''}`)));
  }
  function action(type, focusResult = false) {
    try {
      const next = model.act(state, { type });
      state = next;
      clearError();
      clearCheck();
      if (type === 'reset') {
        HTMLFormElement.prototype.reset.call(form);
        element('expected-outcome').value = 'positive';
      }
      render();
      if (focusResult) element('result-panel').focus();
      if (type === 'reset') element('condition').focus();
    } catch (error) { showError(error); }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const configured = model.act(state, { type: 'configure', condition: element('condition').value });
      const switched = model.act(configured, { type: 'switch' });
      state = switched;
      clearError(); clearCheck(); render();
      element('measure-journeys').focus();
    } catch (error) { showError(error); }
  });
  element('measure-journeys').addEventListener('click', () => action('measure', true));
  element('restore-blue').addEventListener('click', () => action('rollback'));
  element('reset-rehearsal').addEventListener('click', () => action('reset'));
  element('check-outcome').addEventListener('click', () => {
    try {
      const record = currentRecord();
      const expected = element('expected-outcome').value;
      if (!['positive', 'negative', 'unknown', 'not-transitioned'].includes(expected)) {
        const error = new Error('Choose a declared predicted outcome; unknown or coerced values are rejected.');
        error.code = 'ERR_LESSON_INPUT';
        throw error;
      }
      if (!record) {
        const error = new Error('Measure this run before checking an explanation.');
        error.code = 'ERR_LESSON_STATE';
        throw error;
      }
      const matched = record.outcome === expected;
      element('learner-check').dataset.verdict = matched ? 'matched' : 'mismatch';
      element('learner-check').textContent = `${matched ? 'Lesson check matched' : 'Lesson check mismatch'}: measured ${record.outcome}; user impact remains ${record.impact}. Educational checks never change measured success counts.`;
      clearError();
    } catch (error) { showError(error); }
  });
  element('expected-outcome').addEventListener('change', clearCheck);
  render();
}());
