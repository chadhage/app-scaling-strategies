'use strict';

(function mountLesson() {
  const model = window.AuthRehearsal;
  const form = document.getElementById('controls');
  const byId = id => document.getElementById(id);
  const errorNode = byId('guard-error');
  if (!model) {
    errorNode.hidden = false;
    errorNode.textContent = 'Synthetic model unavailable. No result or exposure is permitted.';
    byId('status').textContent = 'Lesson initialization failed.';
    return;
  }
  let state = model.createState();
  const controls = {
    fixture: byId('fixture'),
    pilot: byId('pilot'),
    prediction: byId('prediction'),
    start: byId('start'),
    observe: byId('observe'),
    expand: byId('expand'),
    check: byId('check'),
    newAttempt: byId('new-attempt'),
    reset: byId('reset-all'),
  };
  const labels = {
    accepted: 'accepted — synthetic success',
    'forced-reauthentication': 'forced reauthentication — interruption',
    'rejected-valid-session': 'rejected valid session — interruption',
    'rejected-sign-in': 'rejected sign-in check — interruption',
    unknown: 'unknown — observation missing',
  };

  function text(id, value) {
    byId(id).textContent = value;
  }

  function addRow(body, values) {
    const row = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.append(cell);
    }
    body.append(row);
  }

  function render() {
    controls.fixture.disabled = state.phase !== 'DRAFT';
    controls.pilot.disabled = state.phase !== 'DRAFT';
    controls.prediction.disabled = state.phase !== 'GATED';
    controls.start.disabled = state.phase !== 'DRAFT';
    controls.observe.disabled = state.phase !== 'EXPOSED';
    controls.expand.disabled = state.phase !== 'OBSERVED';
    controls.check.disabled = state.phase !== 'GATED';
    controls.newAttempt.disabled = state.phase !== 'CHECKED' || state.history.length >= model.MAX_ATTEMPTS;
    controls.reset.disabled = false;
    text('phase', `Attempt ${state.attempt} · ${state.phase} · ${state.config ? `${state.config.pilot} of ${model.COHORT} synthetic candidate journeys` : 'not started'}`);
    text('outcome', state.result ? `${state.result.outcome} — measured synthetic journey result` : 'UNKNOWN — not observed');
    text('admission', state.result
      ? `Candidate admission ${state.result.admission}. Validation required: YES.`
      : state.config ? 'Candidate pilot started; observation required before expansion.' : 'No synthetic exposure has started.');
    text('gate', state.gate
      ? `Expansion ${state.gate.decision}. Current cohort ${state.gate.currentCohort}; proposed cohort ${state.gate.proposedCohort} NOT EXECUTED. ${state.gate.reason}`
      : 'Expansion gate has not been checked.');
    for (const [id, key] of [
      ['attempted', 'attempted'], ['successes', 'successes'], ['interruptions', 'interruptions'],
      ['unknown', 'unknown'], ['reauthentication', 'forcedReauthentication'],
      ['rejected-sessions', 'rejectedValidSessions'], ['rejected-sign-ins', 'rejectedSignIns'],
      ['old-only', 'oldOnlyControls'],
    ]) text(id, state.result ? state.result[key] : '—');
    text('denominator', state.result
      ? `${state.result.successes} / ${state.result.attempted} uninterrupted synthetic transitions. ${state.result.interruptions} interruptions and ${state.result.unknown} unknowns remain in the denominator; ${state.result.oldOnlyControls} old-only controls are excluded.`
      : 'No attempted-transition evidence yet.');
    const traceBody = byId('trace').querySelector('tbody');
    traceBody.replaceChildren();
    if (state.result) {
      state.result.rows.forEach(row => addRow(traceBody, [row.label, row.kind, row.expected, labels[row.observed]]));
    }
    text('verification', state.verification
      ? `Learner check ${state.verification.passed ? 'PASS' : 'FAIL'}: predicted ${state.verification.prediction}; measured journey result remains ${state.result.outcome}.`
      : 'Learner interpretation has not been checked.');
    text('history-count', `${state.history.length} of ${model.MAX_ATTEMPTS} checked attempts retained.${state.history.length === model.MAX_ATTEMPTS ? ' Limit reached: reset explicitly to continue.' : ''}`);
    const historyBody = byId('history').querySelector('tbody');
    historyBody.replaceChildren();
    for (const entry of state.history) {
      const fixture = model.fixtures.find(item => item.id === entry.config.fixtureId);
      addRow(historyBody, [
        entry.attempt, fixture.label, entry.result.attempted,
        `${entry.result.successes} / ${entry.result.interruptions} / ${entry.result.unknown}`,
        entry.result.outcome, `${entry.verification.passed ? 'PASS' : 'FAIL'} (${entry.verification.prediction})`,
      ]);
    }
  }

  function invoke(action, message, focusId, resetInputs = false) {
    try {
      state = model.transition(state, action);
      if (resetInputs) HTMLFormElement.prototype.reset.call(form);
      errorNode.hidden = true;
      errorNode.textContent = '';
      render();
      text('status', message);
      if (focusId) byId(focusId).focus();
      return true;
    } catch (error) {
      errorNode.textContent = error.code === 'ERR_SYNTHETIC_GUARD'
        ? error.message : 'Lesson action failed. No new result was accepted; reset to recover.';
      errorNode.hidden = false;
      errorNode.focus();
      return false;
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    invoke({
      type: 'start',
      fixtureId: controls.fixture.value,
      pilot: Number(controls.pilot.value),
    }, 'Synthetic pilot started. Observe the fixed outcomes before checking expansion.', 'observe');
  });
  controls.observe.addEventListener('click', () => invoke(
    { type: 'observe' }, 'Outcomes measured. Failures stop admission; missing evidence holds admission.', 'expand',
  ));
  controls.expand.addEventListener('click', () => invoke(
    { type: 'expand' }, 'Synthetic expansion gate checked. No larger cohort was executed.', 'prediction',
  ));
  controls.check.addEventListener('click', () => {
    const checked = invoke({ type: 'check', prediction: controls.prediction.value }, 'Interpretation checked and retained without rewriting journey impact.');
    if (checked) (controls.newAttempt.disabled ? controls.reset : controls.newAttempt).focus();
  });
  controls.newAttempt.addEventListener('click', () => invoke(
    { type: 'new' }, 'New attempt ready. Earlier checked outcomes remain in local history.', 'fixture', true,
  ));
  controls.reset.addEventListener('click', () => invoke(
    { type: 'reset' }, 'All local state and history cleared. Default controls restored.', 'fixture', true,
  ));
  render();
  text('status', 'Ready. Choose a fixed synthetic fixture and bounded pilot.');
})();
