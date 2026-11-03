'use strict';

(function conduct() {
  const { DEFAULTS, createSession, step } = window.S076;
  const byId = (id) => document.getElementById(id);
  const form = byId('configuration');
  let state = createSession();
  let inputError = '';

  function cells(parent, values) {
    const row = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.append(cell);
    }
    parent.append(row);
  }

  function displayState() {
    return {
      ...state,
      interface: { inputError, verificationCurrent: !inputError },
      result: inputError ? {
        ...state.result, verifier: state.result.verifier === 'FAIL' ? 'FAIL' : 'UNKNOWN',
        reason: `Input rejected; no action ran. ${inputError}`
      } : state.result
    };
  }

  function render() {
    const view = displayState();
    const text = (id, value) => { byId(id).textContent = String(value); };
    text('verifier', view.result.verifier);
    byId('verifier').dataset.verdict = view.result.verifier;
    text('work-outcome', view.result.workOutcome);
    text('retirement-status', state.retirement);
    text('cleanup-status', state.result.cleanup);
    text('result-reason', view.result.reason);
    text('attempt-number', state.attempt);
    text('clock', state.clock);
    text('admission', state.admission);
    text('consumer-count', state.actualConsumers === null ? 'UNKNOWN' : state.actualConsumers);
    text('shutdown-deadline', state.drainDeadline === null ? 'not started' : state.drainDeadline);
    const metric = state.metrics;
    text('metrics', `Attempted ${metric.attempted} · successful ${metric.succeeded} · failed ${metric.failed} · unknown ${metric.unknown} · pending ${metric.pending} · effects ${metric.effects === null ? 'UNKNOWN' : metric.effects}`);
    byId('config-fields').disabled = state.phase !== 'IDLE';
    byId('start').disabled = state.phase !== 'IDLE';
    byId('input-error').hidden = !inputError;
    text('input-error', inputError);
    const last = state.lastAction;
    text('action-feedback', last ? `${last.verdict}: ${last.detail}` : 'Ready for one synthetic attempt.');
    byId('action-feedback').dataset.verdict = last?.verdict || 'READY';

    byId('work-rows').replaceChildren();
    if (state.job) {
      const job = state.job;
      cells(byId('work-rows'), [
        job.id, `${job.owner === null ? 'none' : job.owner} / ${job.epoch}`,
        `${job.progress} / ${job.units}`,
        job.checkpointAcknowledged ? `${job.checkpoint} acknowledged` : 'not acknowledged',
        job.leaseUntil === null ? 'released' : job.leaseUntil,
        job.deadline, job.status, job.effects === null ? 'UNKNOWN' : job.effects
      ]);
    }
    byId('trace-rows').replaceChildren();
    for (const event of state.events) {
      cells(byId('trace-rows'), [event.sequence, event.tick, event.action, event.verdict, event.detail]);
    }
    byId('history-rows').replaceChildren();
    for (const attempt of state.history) {
      cells(byId('history-rows'), [
        attempt.attempt, attempt.config?.mode || 'not started', attempt.result.verifier,
        attempt.result.workOutcome,
        `${attempt.metrics.failed} / ${attempt.metrics.unknown} / ${attempt.metrics.pending}`
      ]);
    }
    text('run-evidence', JSON.stringify(view, null, 2));
  }

  function integer(id) {
    const raw = byId(id).value;
    if (!/^[1-9]\d*$/.test(raw)) throw new TypeError(`${byId(id).labels[0].textContent.trim()} requires a whole number.`);
    return Number(raw);
  }

  function dispatch(action, payload) {
    try {
      state = step(state, action, payload);
      inputError = '';
      render();
      return state.lastAction?.verdict !== 'BLOCKED';
    } catch (error) {
      inputError = error.message;
      render();
      return false;
    }
  }

  function defaults() {
    byId('mode').value = DEFAULTS.mode;
    byId('condition').value = DEFAULTS.condition;
    byId('lease-ticks').value = DEFAULTS.leaseTicks;
    byId('grace-ticks').value = DEFAULTS.graceTicks;
    byId('work-budget').value = DEFAULTS.workBudget;
    byId('fault-consent').checked = false;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      dispatch('start', {
        mode: byId('mode').value, condition: byId('condition').value,
        leaseTicks: integer('lease-ticks'), graceTicks: integer('grace-ticks'),
        workBudget: integer('work-budget')
      });
    } catch (error) {
      inputError = error.message;
      render();
    }
  });
  form.addEventListener('reset', (event) => {
    event.preventDefault();
    if (dispatch('reset') && state.phase === 'IDLE') {
      defaults();
      render();
      byId('mode').focus();
    }
  });
  for (const action of ['begin-scale-in', 'tick', 'renew', 'checkpoint', 'release', 'claim', 'retire', 'verify']) {
    byId(action).addEventListener('click', () => dispatch(action));
  }
  byId('force-stop').addEventListener('click', () => {
    dispatch('force-stop', { confirmed: byId('fault-consent').checked });
    byId('fault-consent').checked = false;
  });
  defaults();
  render();
}());
