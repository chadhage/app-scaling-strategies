(function () {
  'use strict';
  const model = window.S124;
  if (!model || typeof model.initialState !== 'function') return;
  let state = model.initialState();
  const form = document.getElementById('comparison-form');
  const routingForm = document.getElementById('routing-form');
  const byId = (id) => document.getElementById(id);
  const text = (id, value) => { byId(id).textContent = String(value); };
  const inputs = ['strategy-select', 'fixture-select', 'admission-percent'];

  function clearError() {
    text('error', '');
    inputs.forEach((id) => byId(id).removeAttribute('aria-invalid'));
  }

  function render() {
    const result = model.project(state);
    text('phase', result.phase);
    text('compute', result.totalComputeUnits);
    text('plans', result.planLabels.join(', ') || 'Not compared');
    text('slots', result.slotLabels.join(', ') || (result.strategy ? 'Separate app content, not a shared-slot swap' : 'Not compared'));
    text('placements', `${result.workers} workers / ${result.placements} placements`);
    text('cost', result.fictionalCostUnits);
    text('isolation', result.strategy ? (result.computeIsolated ? 'Separate plan compute pools' : 'No: shared plan compute') : 'Not compared');
    text('fault-domains', 'Shared DATA-DEPENDENCY-COMMON; wider fault domains unverified');
    text('lifecycle', result.lifecycleControl);
    text('warm-up', result.warmUp);
    text('routing', `${result.requestedPercent}% / ${result.effectivePercent === null ? 'unknown' : `${result.effectivePercent}%`}`);
    text('remaining', `${result.outstandingWork} work / ${result.pinnedSessions} pinned sessions`);
    text('retention', result.retentionObserved ? 'Fixed DATA receipt at tick 1; no real timer' : 'Unobserved');
    text('counts', `${result.attempted} / ${result.passed} / ${result.failed} / ${result.unknown}`);
    text('safe-aborts', result.safeAborts);
    text('user-outcome', result.userOutcome);
    text('outcome', result.message);
    byId('outcome').dataset.outcome = result.classification;
    text('observations', JSON.stringify(result.latestData, null, 2));
    text('receipts', JSON.stringify(result.receipts, null, 2));
    byId('history').replaceChildren(...result.history.map((entry) => {
      const item = document.createElement('li');
      item.textContent = `${entry.step}. ${entry.command.type}: ${entry.classification} — ${entry.message} `
        + `[attempted ${entry.attempted}; passed ${entry.passed}; failed ${entry.failed}; unknown ${entry.unknown}]`;
      return item;
    }));
    const limited = result.history.length >= model.MAX_ACTIONS;
    byId('strategy-select').disabled = result.phase !== 'awaiting-compare';
    byId('fixture-select').disabled = result.phase !== 'awaiting-compare';
    byId('compare-button').disabled = result.phase !== 'awaiting-compare' || limited;
    byId('add-button').disabled = result.phase !== 'compared' || result.extraPlacement || limited;
    byId('warm-button').disabled = result.phase !== 'compared' || limited;
    byId('route-button').disabled = result.phase !== 'ready' || limited;
    byId('drain-button').disabled = result.strategy !== 'separate-plans' || result.phase !== 'exposed' || limited;
    byId('retain-button').disabled = result.phase !== 'retained' || result.retentionObserved || limited;
    byId('retire-button').disabled = result.phase !== 'retained' || !result.retentionObserved || limited;
    text('guard', limited ? '24-action limit reached. Explicit reset clears this in-memory trace.'
      : result.strategy === 'shared-slots'
        ? 'Native swap recycling cannot be application-drained by keeping old slot content. No native guarantee is made.'
        : 'Unavailable actions remain guarded. Failures and unknowns are retained until explicit reset.');
  }

  function reject(error, control) {
    text('error', `State/input rejected: ${error.message}`);
    if (inputs.includes(control.id)) control.setAttribute('aria-invalid', 'true');
    control.focus();
  }

  function run(command, control) {
    try {
      state = model.transition(state, command);
      clearError();
      render();
    } catch (error) {
      reject(error, control);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const strategy = byId('strategy-select');
    const fixture = byId('fixture-select');
    const target = !model.STRATEGIES.includes(strategy.value) ? strategy
      : !Object.hasOwn(model.FIXTURES, fixture.value) ? fixture : byId('compare-button');
    run({ type: 'compare', strategy: strategy.value, fixture: fixture.value }, target);
  });

  routingForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const control = byId('admission-percent');
    try {
      run({ type: 'route', percent: model.parsePercent(control.value) }, control);
    } catch (error) {
      reject(error, control);
    }
  });

  for (const [id, type] of [
    ['add-button', 'add-placement'], ['warm-button', 'warm'], ['drain-button', 'drain'],
    ['retain-button', 'retain'], ['retire-button', 'retire'],
  ]) {
    byId(id).addEventListener('click', () => run({ type }, byId(id)));
  }

  byId('reset-button').addEventListener('click', () => {
    HTMLFormElement.prototype.reset.call(form);
    HTMLFormElement.prototype.reset.call(routingForm);
    state = model.initialState();
    clearError();
    render();
    byId('strategy-select').focus();
  });

  byId('admission-percent').disabled = false;
  byId('reset-button').disabled = false;
  render();
  byId('startup-error').hidden = true;
}());
