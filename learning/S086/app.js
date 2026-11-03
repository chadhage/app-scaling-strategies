'use strict';

(function run() {
  const F = window.ReadinessFixtures;
  const lesson = window.ExpiredReadiness.createLesson();
  const byId = (id) => document.getElementById(id);
  const controls = byId('lesson-controls');
  const predictionForm = byId('prediction-form');
  const text = (id, value) => { byId(id).textContent = value; };
  function table(id, values) {
    const fragment = document.createDocumentFragment();
    for (const cells of values) {
      const row = document.createElement('tr');
      for (const value of cells) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      }
      fragment.append(row);
    }
    byId(id).replaceChildren(fragment);
  }
  function clearError() {
    text('error', '');
    byId('error').hidden = true;
  }
  function error(message, target = 'error') {
    text('error', message);
    byId('error').hidden = false;
    byId(target).focus();
  }
  function render() {
    const state = lesson.snapshot();
    const c = state.current;
    const active = state.phase === 'active' && !c.terminal;
    const decision = c && c.decisions.at(-1);
    const canCheck = state.phase === 'active' && decision && c.lastDecisionRevision === c.revision;
    byId('configuration').disabled = state.phase !== 'idle';
    byId('start').disabled = state.phase !== 'idle';
    byId('advance').disabled = !active || c.advances >= 2 || (c.advances === 1 && !c.revalidated);
    byId('revalidate').disabled = !active || !c.advances || c.revalidated;
    byId('promote').disabled = !active || !c.advances || c.lastDecisionRevision === c.revision;
    byId('check').disabled = !canCheck;
    byId('prediction').disabled = !canCheck;
    byId('new-attempt').disabled = state.phase !== 'checked' || state.history.length >= F.historyLimit;
    byId('history-full').hidden = state.history.length < F.historyLimit;
    if (c) {
      const latest = c.observations.at(-1);
      const assessment = window.ExpiredReadiness.assessObservation({
        status: latest.status, observedAt: latest.observedAt,
      }, c.clock);
      text('clock', `Tick ${c.clock}`);
      text('original-evidence', `Healthy at tick 0; age ${c.clock}; ${c.clock < F.lifetimeTicks ? 'fresh' : 'EXPIRED'}.`);
      text('latest-evidence', latest.status === 'missing'
        ? `Observation #${latest.id}: MISSING at attempted tick ${latest.attemptedAt}; no health or timestamp returned.`
        : `Observation #${latest.id}: ${latest.status} at tick ${latest.observedAt}.`);
      text('evidence-age', assessment.age === null
        ? 'UNKNOWN — no observed timestamp.'
        : `Age ${assessment.age}; required < ${F.lifetimeTicks}; ${assessment.reason}.`);
      text('route', c.route === F.candidate ? 'blue-v1 0% / green-v2 100%' : 'blue-v1 100% / green-v2 0%');
      text('lesson-status', state.phase === 'checked'
        ? `Attempt ${c.id} retained. New attempt keeps all history.`
        : `Attempt ${c.id}; tick ${c.clock}; ${c.terminal ? 'synthetic promotion finished — check and retain.' : 'inspect evidence before the next action.'}`);
    } else {
      for (const id of ['clock', 'original-evidence', 'latest-evidence', 'evidence-age']) text(id, 'Not started');
      text('route', 'blue-v1 100% / green-v2 0%');
      text('lesson-status', 'Ready to start.');
    }
    text('promotion-result', decision
      ? `Promotion outcome: ${decision.outcome} — ${decision.reason}; ${decision.action} at tick ${decision.tick}.`
      : 'Promotion outcome: not attempted.');
    text('verifier-result', decision ? `Verifier: ${decision.verifier}.` : 'Verifier: not run.');
    text('user-impact', decision ? `User impact: ${decision.userImpact}.` : 'Actual user-transition outcome: UNVERIFIED — no live user journeys.');
    text('cleanup-result', 'Cleanup: N/A — no resources.');
    text('learning-result', state.phase === 'checked'
      ? `Learning check: ${c.correct ? 'CORRECT' : 'INCORRECT'} prediction ${c.prediction}; latest promotion ${c.outcome}. Not a user-migration verdict.`
      : 'No learning check yet.');
    table('decisions', c ? c.decisions.map((d) => [
      d.outcome, d.tick, `#${d.observationId} ${d.status}`, d.age === null ? 'UNKNOWN' : d.age,
      `${d.reason} / ${d.action}`, d.route,
    ]) : []);
    table('trace', c ? c.trace.map((e) => [e.step, e.clock, e.action, e.message]) : []);
    table('history', state.history.map((h) => [
      h.id, `${h.config.health} / ${h.config.delayTicks} ticks`,
      h.decisions.map((d) => `${d.outcome} (${d.reason})`).join(' → '),
      h.outcome, `${h.prediction} / ${h.correct ? 'CORRECT' : 'INCORRECT'}`,
    ]));
    const details = document.createDocumentFragment();
    for (const attempt of state.history) {
      const item = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = `Attempt ${attempt.id}: ${attempt.outcome} — complete retained evidence`;
      const evidence = document.createElement('pre');
      evidence.textContent = JSON.stringify(attempt, null, 2);
      item.append(summary, evidence);
      details.append(item);
    }
    byId('history-details').replaceChildren(details);
    const t = state.totals;
    text('totals', `Retained attempts: ${t.attempts}; correct predictions: ${t.correct}; decisions: ${t.decisions}; SUCCESS: ${t.SUCCESS}; FAILURE: ${t.FAILURE}; UNKNOWN: ${t.UNKNOWN}.`);
  }
  function act(action, focus) {
    clearError();
    try {
      action();
      render();
      if (focus) byId(focus()).focus();
    } catch (problem) {
      error(problem.message);
    }
  }
  controls.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    const delay = byId('delay-ticks').value;
    if (!/^[2-5]$/.test(delay)) {
      error('Enter exactly one integer from 2 to 5 synthetic ticks.', 'delay-ticks');
      return;
    }
    const health = byId('health').value;
    if (!F.health.includes(health)) {
      error('Choose a declared synthetic revalidation observation.', 'health');
      return;
    }
    act(() => lesson.start({ health, delayTicks: Number(delay) }), () => 'advance');
  });
  byId('advance').addEventListener('click', () => act(() => lesson.advance(), () => 'promote'));
  byId('promote').addEventListener('click', () => act(() => lesson.promote(), () => (
    byId('revalidate').disabled ? 'prediction' : 'revalidate'
  )));
  byId('revalidate').addEventListener('click', () => act(() => lesson.revalidate(), () => 'promote'));
  predictionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    const prediction = byId('prediction').value;
    if (!F.outcomes.includes(prediction)) {
      error('Choose SUCCESS, FAILURE or UNKNOWN before checking.', 'prediction');
      return;
    }
    act(() => lesson.check({ prediction }), () => (
      byId('new-attempt').disabled ? 'reset-lesson' : 'new-attempt'
    ));
  });
  function resetInputs() {
    HTMLFormElement.prototype.reset.call(controls);
    HTMLFormElement.prototype.reset.call(predictionForm);
  }
  byId('new-attempt').addEventListener('click', () => act(() => {
    lesson.newAttempt();
    resetInputs();
  }, () => 'start'));
  byId('reset-lesson').addEventListener('click', () => act(() => {
    lesson.reset();
    resetInputs();
  }, () => 'start'));
  render();
}());
