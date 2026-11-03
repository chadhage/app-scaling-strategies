(function () {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const form = byId('rehearsal-form');
  const level = byId('level');
  const strategy = byId('strategy');
  const rehearse = byId('rehearse');
  const inspect = byId('inspect');
  const resetLesson = byId('reset-lesson');
  const errorBox = byId('error');
  const status = byId('status');
  const bootError = byId('boot-error');
  let state;
  let model;

  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
    level.removeAttribute('aria-invalid');
    strategy.removeAttribute('aria-invalid');
  }
  const field = (value) => value === null ? 'not observed' : String(value);
  function metrics(current) {
    const observation = current.observation;
    if (!observation) return 'Model ports, capacity, journeys and p95 latency: not inspected.';
    return `Fictional model ports: ${field(observation.modelPorts)}; model capacity: ${field(observation.capacity)}; `
      + `journeys offered: ${observation.journeys}; completed: ${field(observation.completed)}; `
      + `failed: ${field(observation.failed)}; p95 latency: ${field(observation.p95Ms)} ms.`;
  }
  function render() {
    const view = model.summarize(state);
    const current = view.current;
    const full = view.attempts === view.maxAttempts;
    level.disabled = strategy.disabled = view.phase === 'pending' || full;
    rehearse.disabled = view.phase === 'pending' || full;
    inspect.disabled = view.phase !== 'pending';
    resetLesson.disabled = false;
    status.dataset.result = current ? current.result : 'unknown';
    status.textContent = !current ? 'Ready — choose a fixed fictional fixture. No observations yet.'
      : current.result === 'pending' ? 'Pending — inspect the fixed fictional observation before deciding.'
        : current.result === 'unknown' ? 'Unknown synthetic verifier — capacity or journey observations are unavailable.'
          : `${current.result === 'positive' ? 'Positive' : 'Negative'} synthetic verifier — `
            + (current.result === 'positive' ? 'authored capacity and journey budgets pass.'
              : 'authored capacity or journey budgets fail; interrupted fictional journeys are retained.');
    if (full && view.phase === 'complete') status.textContent += ' Six-attempt limit reached; reset explicitly.';
    const counts = view.counts;
    byId('counters').textContent = `Attempts: ${view.attempts} / ${view.maxAttempts}; positive: ${counts.positive}; `
      + `negative: ${counts.negative}; unknown: ${counts.unknown}; pending: ${counts.pending}.`;
    byId('summary').textContent = current
      ? `Fictional instances: ${current.instances}; offered connection demand: ${current.demand}; `
        + `strategy: ${current.strategy}; connections: ${current.connections}.`
      : 'Baseline reference: 1 instance; 12 direct connections.';
    byId('metrics').textContent = current ? metrics(current)
      : 'Model ports, capacity and journey outcomes have not been inspected.';
    byId('capacity-result').textContent = `Model-port capacity gate: ${current ? current.capacityResult : 'unknown'}. `
      + 'This is not native Azure capacity evidence.';
    byId('journey-result').textContent = `Journey gate: ${current ? current.journeyResult : 'unknown'}. `
      + 'Budget: zero failures; p95 at most 150 ms.';
    const snat = current && current.observation && current.observation.syntheticSnat;
    byId('synthetic-snat').textContent = snat
      ? `${snat.label}: used ${snat.used} / capacity ${snat.capacity}; never native evidence.`
      : `Fictional SNAT data: ${current && current.observation ? 'not observed' : 'not inspected'}; never native evidence.`;
    byId('native-snat').textContent = `Native Azure SNAT: ${view.nativeSnat.status}. ${view.nativeSnat.reason}`;
    const history = byId('history');
    history.replaceChildren();
    for (const row of view.history) {
      const item = document.createElement('li');
      item.dataset.result = row.result;
      item.dataset.action = row.type;
      item.textContent = `Event ${row.sequence}, attempt ${row.attempt}: `
        + `${row.type === 'rehearse' ? 'rehearsed' : 'inspected'} ${row.label}, ${row.strategy}; `
        + `demand ${row.demand}, connections ${row.connections}; ${row.result}. ${metrics(row)} `
        + 'Native SNAT: unverified.';
      history.append(item);
    }
  }
  function act(input) {
    try {
      const next = model.transition(state, input);
      state = next;
      clearError();
      render();
      if (input.type === 'rehearse') inspect.focus();
      else if (model.summarize(state).attempts === model.MAX_ATTEMPTS) resetLesson.focus();
      else level.focus();
    } catch (error) {
      render();
      errorBox.textContent = `Action rejected: ${error.message} No observation or history was changed.`;
      errorBox.hidden = false;
      if (!level.disabled) {
        level.setAttribute('aria-invalid', 'true');
        level.focus();
      } else if (!inspect.disabled) inspect.focus();
      else resetLesson.focus();
    }
  }
  try {
    model = globalThis.S109Model;
    if (!model || typeof model.initial !== 'function') throw new Error('The local model script is unavailable.');
    state = model.initial();
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      act({ type: 'rehearse', level: level.value, strategy: strategy.value });
    });
    inspect.addEventListener('click', () => act({ type: 'inspect' }));
    resetLesson.addEventListener('click', () => {
      HTMLFormElement.prototype.reset.call(form);
      state = model.initial();
      clearError();
      render();
      level.focus();
    });
    render();
    bootError.hidden = true;
  } catch (error) {
    for (const control of form.elements) control.disabled = true;
    status.dataset.result = 'unknown';
    status.textContent = 'Unavailable — no observations verified.';
    bootError.textContent = `Lesson unavailable: ${error.message} Keep the complete local bundle together and reload.`;
    bootError.hidden = false;
  }
})();
