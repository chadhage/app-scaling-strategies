(function () {
  'use strict';
  const model = globalThis.S108Lesson;
  const byId = (id) => document.getElementById(id);
  const form = byId('comparison-form');
  const error = byId('error');
  const policy = byId('policy');
  const recovery = byId('recovery');
  const actionIds = {
    apply: 'apply-policy', inspect: 'inspect-traffic', restore: 'restore-policy', verify: 'verify-recovery',
  };
  let state;

  function requestText(request) {
    if (!request) return 'Pending: not inspected';
    if (request.status === null) return 'Unknown: observation unavailable';
    return `${request.status} ${request.observation}; rule ${request.rule || 'none'}; valid fictional session`;
  }
  function outcomeText(result) {
    return result === 'positive' ? 'all required requests allowed; complete journey'
      : result === 'negative' ? 'valid journey interrupted by a blocked request or asset'
        : 'unverified; missing or pending observations';
  }
  function render() {
    const availability = model.availability(state);
    for (const [action, id] of Object.entries(actionIds)) byId(id).disabled = !availability[action];
    policy.disabled = !availability.apply;
    recovery.disabled = !availability.apply;
    const current = state.current;
    const result = state.phase === 'verified' ? current.recoveryResult
      : state.phase === 'inspected' ? current.result : 'unknown';
    const descriptions = {
      ready: 'Ready: choose the fixed fixtures. No traffic has been inspected.',
      applied: 'Fictional policy applied. Inspect valid traffic; policy labels alone prove nothing.',
      inspected: `Comparison ${current ? current.id : ''}: ${outcomeText(current ? current.result : 'unknown')}. Restore next.`,
      restored: 'Baseline label restored. Recovery remains unknown until measured.',
      verified: `Recovery ${current ? current.id : ''}: ${outcomeText(current ? current.recoveryResult : 'unknown')}. Earlier comparison outcomes remain counted.`,
    };
    const status = byId('status');
    status.textContent = descriptions[state.phase];
    if (state.stats.comparisons === model.config.limits.comparisons && state.phase === 'verified') {
      status.textContent += ' Four-comparison bound reached; reset explicitly to start again.';
    }
    status.dataset.result = result;
    byId('policy-state').textContent = `Phase: ${state.phase}; desired fictional policy: ${state.activePolicy}; route label: ${model.config.route}.`;
    byId('comparison-result').textContent = current
      ? `Comparison: ${current.result} — ${outcomeText(current.result)}.`
      : 'Comparison: unknown — no observation.';
    byId('comparison-result').dataset.result = current ? current.result : 'unknown';
    byId('recovery-result').textContent = current
      ? `Recovery: ${current.recoveryResult} — ${outcomeText(current.recoveryResult)}.`
      : 'Recovery: unknown — no observation.';
    byId('recovery-result').dataset.result = current ? current.recoveryResult : 'unknown';
    const stats = state.stats;
    byId('metrics').textContent = `Comparisons: ${stats.comparisons}/4; inspected journeys: ${stats.inspected}; positive: ${stats.positive}; negative: ${stats.negative}; unknown: ${stats.unknown}; pending: ${stats.pendingInspections}; blocked journey requests: ${stats.blockedJourneys}; blocked assets: ${stats.blockedAssets}.`;
    byId('recovery-metrics').textContent = `Measured recoveries: ${stats.recoveries}; positive: ${stats.recoveryPositive}; negative: ${stats.recoveryNegative}; unknown: ${stats.recoveryUnknown}; pending: ${stats.pendingRecoveries}.`;
    const rows = model.config.requests.map((request, index) => {
      const row = document.createElement('tr');
      row.dataset.request = request.id;
      const label = document.createElement('th');
      label.scope = 'row';
      label.textContent = request.path;
      row.append(label);
      for (const text of [request.kind, requestText(current && current.requests && current.requests[index]),
        requestText(current && current.recoveryRequests && current.recoveryRequests[index])]) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.append(cell);
      }
      return row;
    });
    byId('requests').replaceChildren(...rows);
    byId('history').replaceChildren(...state.history.map((event) => {
      const item = document.createElement('li');
      item.dataset.action = event.action;
      item.dataset.result = event.result;
      item.dataset.comparison = String(event.comparisonId);
      const counts = event.counts;
      const trace = event.requests ? event.requests.map((request) =>
        `${request.id}: ${request.status === null ? 'unknown' : request.status}, rule ${request.rule || 'none'}`).join('; ')
        : 'No request observations at this action';
      item.textContent = `${event.sequence}. Comparison ${event.comparisonId}: ${event.action}; policy ${event.activePolicy}; recovery fixture ${event.recoveryFixture}; ${event.result}. Requests attempted ${counts.attempted}, allowed ${counts.allowed}, blocked ${counts.blocked}, unknown ${counts.unknown}; journeys attempted ${counts.journeysAttempted}, successful ${counts.journeysSuccessful}, interrupted ${counts.journeysInterrupted}, unknown ${counts.journeysUnknown}. ${trace}.`;
      return item;
    }));
  }
  function clearError() {
    error.hidden = true;
    error.textContent = '';
    policy.removeAttribute('aria-invalid');
    recovery.removeAttribute('aria-invalid');
    policy.removeAttribute('aria-describedby');
    recovery.removeAttribute('aria-describedby');
  }
  function showError(problem) {
    error.textContent = `No action recorded: ${problem.message}`;
    error.hidden = false;
    if (problem.code === 'ERR_S108_INPUT') {
      for (const control of [policy, recovery]) {
        control.setAttribute('aria-invalid', 'true');
        control.setAttribute('aria-describedby', 'error');
      }
    }
    error.focus();
  }
  function conduct(input) {
    try {
      const next = model.transition(state, input);
      state = next;
      clearError();
      render();
      const focus = { apply: 'inspect-traffic', inspect: 'restore-policy', restore: 'verify-recovery', verify: 'policy' };
      byId(input.type === 'verify' && !model.availability(state).apply ? 'reset-lesson' : focus[input.type]).focus();
    } catch (problem) {
      showError(problem);
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    conduct({ type: 'apply', policy: policy.value, recovery: recovery.value });
  });
  for (const type of ['inspect', 'restore', 'verify']) {
    byId(actionIds[type]).addEventListener('click', () => conduct({ type }));
  }
  byId('reset-lesson').addEventListener('click', () => {
    try {
      state = model.createState();
      HTMLFormElement.prototype.reset.call(form);
      clearError();
      render();
      policy.focus();
    } catch (problem) {
      showError(problem);
    }
  });
  try {
    if (!model || typeof model.createState !== 'function' || typeof model.transition !== 'function'
        || typeof model.availability !== 'function' || !model.config) {
      throw new Error('Lesson model unavailable; no synthetic result can be computed. Reload the complete bundle.');
    }
    state = model.createState();
    render();
  } catch (problem) {
    for (const control of form.elements) control.disabled = true;
    byId('status').textContent = 'Model unavailable: no synthetic result. Reload the complete bundle.';
    byId('status').dataset.result = 'unknown';
    showError(problem);
  }
}());
