'use strict';
(() => {
  const byId = (id) => document.getElementById(id);
  const form = byId('prepare-form');
  const errorBox = byId('error');
  const status = byId('status');
  const buttons = ['begin', 'swap', 'probe', 'replay', 'evaluate', 'reset'];
  const model = window.S129Lesson;
  let state;

  function error(message, field) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    if (field && ['host', 'policy', 'budget', 'consent'].includes(field)) byId(field).setAttribute('aria-invalid', 'true');
    errorBox.focus();
  }
  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
    for (const field of ['host', 'policy', 'budget', 'consent']) byId(field).removeAttribute('aria-invalid');
  }
  function text(id, value) {
    byId(id).textContent = String(value);
  }
  function table(id, rows) {
    byId(id).replaceChildren(...rows.map((values) => {
      const row = document.createElement('tr');
      for (const value of values) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      }
      return row;
    }));
  }
  function render() {
    const result = model.assess(state);
    const run = state.current === null ? null : state.runs[state.current - 1];
    text('phase', result.phase);
    text('run-count', `${state.runs.length} / ${model.MAX_RUNS} retained runs`);
    text('swap-result', run && run.swap ? (run.swap.status === 'unsupported' ? run.swap.reason : 'successful; new triggers → candidate-v2; old slot retained; added compute 0') : 'unobserved');
    text('probe-result', result.probe);
    text('replay-result', run && run.replay ? `${result.recovery}; ${run.replay.observedTicks} observed / ${run.replay.requiredTicks} required recovery ticks; HTTP retry not provided` : 'unobserved');
    text('effects', run && run.queue ? `${result.knownQueueEffects} known queue effect(s); ${result.duplicateEffects} duplicate(s). HTTP effects remain unknown.` : 'not observed');
    text('checkpoint', run && run.queue ? `${run.queue.checkpoint} / ${run.queue.total}; ${run.queue.acknowledgment}` : 'not observed');
    text('http-result', result.unknownHttpEffects);
    text('verification', result.verification);
    text('impact', result.impact);
    text('metric', result.counts.attempted ? `${result.counts.uninterrupted} / ${result.counts.attempted} uninterrupted (${(result.uninterruptedRate * 100).toFixed(2)}%); interruptions and unknowns included` : 'No sample — not 100% success');
    text('claims', 'Native unverified; zero downtime not guaranteed; source parent incomplete');
    text('cleanup', result.cleanup);
    for (const [name, count] of Object.entries(result.counts)) text(name, count);
    const executions = [...result.originalExecutions, ...(result.replayedExecution ? [result.replayedExecution] : [])];
    table('executions', executions.map((execution) => [
      execution.id, `${execution.trigger} / ${execution.slot}`, execution.status,
      `${execution.checkpoint}; ${execution.acknowledgment}`,
    ]));
    table('journeys', result.journeys.map((journey) => [
      `${journey.id} / ${journey.execution}`, journey.destination, journey.outcome,
      `${journey.elapsed === null ? 'unknown' : journey.elapsed} / ${journey.budget} ticks`, journey.reason,
    ]));
    byId('history').replaceChildren(...state.runs.map((saved) => {
      const item = document.createElement('li');
      const summary = document.createElement('p');
      const count = (outcome) => saved.journeys.filter((journey) => journey.outcome === outcome).length;
      const measurement = saved.journeys.length
        ? `${count('uninterrupted')} uninterrupted, ${count('interrupted')} interrupted, ${count('unknown')} unknown / ${saved.journeys.length} started`
        : 'no started transition sample';
      summary.textContent = `Run ${saved.id} · ${model.hosts[saved.host]} · ${model.policies[saved.policy]} · budget ${saved.budget} · ${saved.phase}${saved.reset ? ' · reset; evidence retained' : ''} · ${measurement}`;
      item.append(summary);
      const events = document.createElement('ol');
      for (const recorded of saved.events) {
        const eventItem = document.createElement('li');
        const details = document.createElement('details');
        const title = document.createElement('summary');
        title.textContent = `${recorded.sequence}. ${recorded.type} — fixed observation DATA`;
        const data = document.createElement('pre');
        data.textContent = JSON.stringify(recorded.observation, null, 2);
        details.append(title, data);
        eventItem.append(details);
        events.append(eventItem);
      }
      item.append(events);
      return item;
    }));
    const enabled = {
      begin: state.current === null && state.runs.length < model.MAX_RUNS,
      swap: result.phase === 'prepared', probe: result.phase === 'swapped',
      replay: result.phase === 'probed', evaluate: ['replayed', 'unsupported'].includes(result.phase),
      reset: state.current !== null,
    };
    for (const name of buttons) byId(`${name}-button`).disabled = !enabled[name];
    for (const field of ['host', 'policy', 'budget', 'consent']) byId(field).disabled = state.current !== null;
  }
  function dispatch(command) {
    try {
      const next = model.send(state, command);
      state = next;
      clearError();
      if (command.type === 'reset') HTMLFormElement.prototype.reset.call(form);
      render();
      status.textContent = command.type === 'reset'
        ? 'Rehearsal reset. Every recorded run and original outcome remains in history.'
        : `Recorded ${command.type} as fixed teaching data; phase ${model.assess(state).phase}.`;
      if (command.type === 'reset') byId('host').focus();
    } catch (failure) {
      error(`${failure.code || 'ERR_LESSON'}: ${failure.message}`, failure.field);
      status.textContent = 'Action rejected. Observations and history were not changed.';
    }
  }
  try {
    if (!model || typeof model.createState !== 'function' || typeof model.send !== 'function' || typeof model.parseBudget !== 'function') {
      throw new Error('required local model data failed to load');
    }
    state = model.createState();
    render();
    status.textContent = 'Ready. Choose fixed inputs, confirm DATA ONLY, then begin.';
    form.addEventListener('submit', (submission) => {
      submission.preventDefault();
      try {
        dispatch({
          type: 'begin', host: byId('host').value, policy: byId('policy').value,
          budget: model.parseBudget(byId('budget').value), consent: byId('consent').checked,
        });
      } catch (failure) {
        error(`${failure.code || 'ERR_LESSON'}: ${failure.message}`, failure.field);
        status.textContent = 'Input rejected. No run or observation was added.';
      }
    });
    for (const type of buttons.slice(1)) byId(`${type}-button`).addEventListener('click', () => dispatch({ type }));
  } catch (failure) {
    for (const control of document.querySelectorAll('main button, main input, main select')) control.disabled = true;
    text('phase', 'unavailable');
    status.textContent = 'Lesson unavailable. No result is inferred; reload after restoring local lesson files.';
    error(`Lesson unavailable: ${failure.message}. No swap, recovery or success result is inferred.`);
  }
})();
