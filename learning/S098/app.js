(function () {
  'use strict';

  const model = globalThis.S098Lesson;
  const fixture = globalThis.S098Fixture;
  const get = (id) => document.getElementById(id);
  const form = get('exercise');
  let current = model.create();

  function text(id, value) { get(id).textContent = String(value); }
  function rows(id, values) {
    const body = get(id);
    body.replaceChildren(...values.map((valuesInRow) => {
      const row = document.createElement('tr');
      for (const value of valuesInRow) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.appendChild(cell);
      }
      return row;
    }));
  }
  function clearError() {
    const error = get('lesson-error');
    error.hidden = true;
    error.textContent = '';
    form.querySelectorAll('[aria-invalid]').forEach((control) => control.removeAttribute('aria-invalid'));
  }
  function runToken() {
    const raw = form.dataset.runId;
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
      const error = new Error('ERR_INPUT: Run token must be a positive safe integer.');
      error.code = 'ERR_INPUT';
      throw error;
    }
    return Number(raw);
  }
  function render() {
    const total = model.summary(current);
    const decision = current.decision;
    const waitingForRecovery = current.phase === 'WRITES_COMMITTED';
    const waitingForAnswer = current.phase === 'DECIDED';
    form.dataset.runId = String(current.runId);
    get('apply-writes').disabled = current.phase !== 'BASELINE' || total.remaining === 0;
    get('recovery-plan').disabled = !waitingForRecovery;
    get('read-observation').disabled = !waitingForRecovery;
    get('rehearse-recovery').disabled = !waitingForRecovery;
    get('prediction').disabled = !waitingForAnswer;
    get('check-interpretation').disabled = !waitingForAnswer;
    text('phase', current.phase);
    text('effective-version', current.servingVersion);
    text('desired-version', decision ? decision.desiredVersion : 'NOT_REQUESTED');
    text('recovery-outcome', decision ? decision.outcome : 'NOT_ATTEMPTED');
    text('retained-effects', current.ledger.length);
    text('committed-total', current.phase === 'BASELINE' ? fixture.oldSnapshotTotal : fixture.expectedTotal);
    text('interpreted-effects', decision ? decision.interpretedEffects.length : 'No recovery read');
    text('observed-total', decision && decision.observedTotal !== null ? decision.observedTotal : 'No observation');
    text('read-budget', `${decision && decision.observedReadMs !== null ? `${decision.observedReadMs} ms` : 'No observation'} / ${fixture.readBudgetMs} ms`);
    text('learning-verdict', current.learningVerdict);
    text('result-explanation', decision ? decision.explanation : current.phase === 'WRITES_COMMITTED'
      ? 'All three fixed effects are committed. Choose a plan that retains and correctly interprets them.'
      : 'Apply the fixed new writes before recovery.');
    for (const name of ['decisions', 'attempted', 'success', 'failure', 'unknown', 'rejected']) text(`total-${name}`, total[name]);
    text('remaining-decisions', total.remaining);
    text('success-fraction', total.attempted ? `${total.success} / ${total.attempted}` : 'No sample');
    text('capacity-notice', total.remaining
      ? `At most 12 decisions, including safe rejections. ${total.remaining} remain. Reset retains all history; reload explicitly discards it.`
      : 'Workbook full: all 12 decisions remain recorded. Reset cannot create another decision. Reload explicitly discards in-memory history.');
    rows('ledger-body', current.ledger.map((entry) => [
      entry.id, entry.writtenBy, JSON.stringify(entry.payload),
      fixture.expectedEffects.find((effect) => effect.id === entry.id).delta,
    ]));
    rows('read-body', decision ? decision.interpretedEffects.map((effect) => [effect.id, effect.delta]) : []);
    rows('history-body', current.history.map((entry) => [
      `${entry.number} / ${entry.runId}`, entry.plan, entry.observation, entry.outcome,
      `${entry.retainedEffects} / ${entry.interpretedEffects.length}`,
      `${entry.observedTotal === null ? 'Unknown / not read' : entry.observedTotal} / ${entry.expectedTotal}`,
      entry.effectiveVersion, entry.learningVerdict,
    ]));
    get('trace-list').replaceChildren(...current.trace.map((message) => {
      const item = document.createElement('li');
      item.textContent = message;
      return item;
    }));
  }
  function act(action, focusId, inputIds = []) {
    try {
      const next = action();
      current = next;
      clearError();
      render();
      get(focusId).focus();
    } catch (error) {
      clearError();
      for (const id of inputIds) get(id).setAttribute('aria-invalid', 'true');
      const alert = get('lesson-error');
      alert.textContent = error.code ? error.message : 'ERR_STATE: The local command failed; no recovery result is certified.';
      alert.hidden = false;
      alert.focus();
    }
  }

  get('apply-writes').addEventListener('click', () => {
    act(() => model.applyNewWrites(current, runToken()), 'recovery-plan');
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    act(() => model.recover(current, {
      expectedRunId: runToken(), plan: get('recovery-plan').value, observation: get('read-observation').value,
    }), 'prediction', ['recovery-plan', 'read-observation']);
  });
  get('check-interpretation').addEventListener('click', () => {
    act(() => model.checkPrediction(current, {
      expectedRunId: runToken(), prediction: get('prediction').value,
    }), 'reset-lesson', ['prediction']);
  });
  get('reset-lesson').addEventListener('click', () => {
    act(() => {
      const next = model.reset(current);
      form.reset();
      return next;
    }, 'apply-writes');
    if (get('apply-writes').disabled) get('reset-lesson').focus();
  });
  render();
}());
