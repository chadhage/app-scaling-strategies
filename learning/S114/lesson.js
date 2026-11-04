(function () {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const form = byId('operator-form');
  const errorBox = byId('error');
  const api = globalThis.S114;
  let state = null;
  const show = (value) => value === null ? 'UNKNOWN' : String(value);
  const health = (value) => value === null ? 'UNKNOWN' : value ? 'healthy' : 'unhealthy';

  function error(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    errorBox.focus();
  }
  function render() {
    const metrics = state.metrics;
    const configurable = ['idle', 'assessed'].includes(state.phase) && state.runCount < api.limits.maxRuns;
    ['fixture', 'budget', 'fault', 'isolate'].forEach((id) => { byId(id).disabled = !configurable; });
    ['detect', 'recover', 'journeys'].forEach((id) => {
      byId(id).disabled = state.phase !== { detect: 'isolated', recover: 'detected', journeys: 'recovered' }[id];
    });
    byId('status').dataset.result = state.conclusion;
    byId('status').textContent = `${state.conclusion.toUpperCase()} — ${state.phase === 'assessed' ? 'fixture-scoped result only' : `phase ${state.phase}; not yet a complete journey result`}. Full regional continuity remains UNKNOWN.`;
    byId('bound').textContent = `${state.runCount}/6 rehearsals; ${state.history.length}/24 retained actions. ${state.runCount === 6 && state.phase === 'assessed' ? 'Bound reached: explicitly reset before another run.' : 'Explicit reset clears history.'}`;
    byId('fault-state').textContent = state.modelFault
      ? `DATA ONLY: ${state.modelFault.region}, ${state.modelFault.kind}. Origins: ${state.modelFault.origins.map((item) => `${item.label} ${health(item.healthy)}`).join(', ')}. Dependencies: ${state.modelFault.dependencies.map((item) => `${item.label} ${health(item.healthy)}`).join(', ')}. These are model labels, not live failure observations.`
      : 'No fictional isolation selected.';
    byId('proxy-state').textContent = state.samples
      ? `DATA ONLY shallow proxy samples: north-a ${health(state.samples.primaryShallowHealthy)}; south-a ${health(state.samples.alternateShallowHealthy)}. Dependency-aware path: ${health(state.samples.dependencyAwareHealthy)}. A healthy HTTP sample does not certify capacity, state, transactions, client recovery or a region.`
      : 'Shallow proxy observation: UNKNOWN.';
    byId('recovery-state').textContent = `DATA ONLY fictional alternate: ${state.recovery}; destination ${state.destination || 'NONE'}. Selection is a teaching gate, not a real route change.`;
    const details = {
      detection: `Receipt +${show(metrics.detectionSeconds)}s; declared budget ${state.config ? state.config.budgetSeconds : 'not selected'}s. Missing detection remains UNKNOWN.`,
      capacity: `${show(metrics.survivingCapacity)} surviving / ${metrics.requiredCapacity} required capacity units.`,
      data: `Revision ${show(metrics.observedRevision)} / ${metrics.requiredRevision} required; dependency access ${health(metrics.dataAccess)}.`,
      transactions: `${show(metrics.committedEffects)} total effects / 1 required for lesson-order-001; unconfirmed is not inferred lost.`,
      clientRecovery: `${show(metrics.clientSeconds)} authored client seconds; profile/session and order semantics must both pass.`,
      budget: `${show(metrics.interruptionSeconds)} total interrupted seconds / ${state.config ? state.config.budgetSeconds : 'not selected'}s budget; detection + switching + client recovery. No final recovery means UNKNOWN duration.`,
    };
    Object.entries(state.checks).forEach(([name, result]) => {
      byId(`check-${name}`).textContent = result.toUpperCase();
      byId(`check-${name}`).dataset.result = result;
      byId(`detail-${name}`).textContent = details[name];
    });
    byId('metrics').textContent = metrics.successfulJourneys === null ? 'Journeys: not sampled.'
      : `DATA ONLY journeys: positive ${metrics.successfulJourneys}; interrupted ${metrics.interruptedJourneys}; unknown ${metrics.unknownJourneys}.`;
    byId('journey-results').replaceChildren(...state.journeys.map((journey) => {
      const item = document.createElement('li');
      item.dataset.result = journey.result;
      item.textContent = `${journey.name}: ${journey.result.toUpperCase()}; ${journey.note} ${journey.name === 'getProfile' ? `Session: ${show(journey.session)}.` : `Receipt: ${journey.receipt}; effects: ${show(journey.effects)}.`}`;
      return item;
    }));
    byId('history').replaceChildren(...state.history.map((event) => {
      const item = document.createElement('li');
      item.dataset.action = event.action.type;
      item.dataset.result = event.conclusion;
      item.textContent = `Run ${event.run}, ${event.action.type}: ${event.conclusion.toUpperCase()}. ${event.summary} Capacity ${show(event.metrics.survivingCapacity)}/80; revision ${show(event.metrics.observedRevision)}/7; interruption ${show(event.metrics.interruptionSeconds)}s.`;
      return item;
    }));
  }
  function attempt(action) {
    try {
      if (!state) throw new Error('Lesson unavailable: restore model.js and reload the complete bundle. No result is verified.');
      const next = api.applyAction(state, typeof action === 'function' ? action() : action);
      state = next;
      errorBox.hidden = true;
      errorBox.textContent = '';
      render();
      const target = { isolated: 'detect', detected: 'recover', recovered: 'journeys', assessed: state.runCount < 6 ? 'fixture' : 'reset-lesson', idle: 'fixture' }[state.phase];
      byId(target).focus();
    } catch (caught) {
      if (state) render();
      error(`${caught.message} No rehearsal state was changed.`);
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    attempt(() => ({
      type: 'isolate', fixture: byId('fixture').value, fault: byId('fault').value,
      budgetSeconds: api.parseBudget(byId('budget').value),
    }));
  });
  ['detect', 'recover', 'journeys'].forEach((type) => {
    byId(type).addEventListener('click', () => attempt({ type }));
  });
  byId('reset-lesson').addEventListener('click', () => {
    if (!state) {
      error('Lesson unavailable: restore model.js and reload the complete bundle. Reset cannot fabricate a result.');
      return;
    }
    HTMLFormElement.prototype.reset.call(form);
    attempt({ type: 'reset' });
  });
  try {
    if (!api || typeof api.createState !== 'function' || typeof api.applyAction !== 'function' || typeof api.parseBudget !== 'function') throw new Error('Lesson unavailable: model.js did not load. Restore the complete bundle and reload. No result is verified.');
    state = api.createState();
    render();
  } catch (caught) {
    state = null;
    ['fixture', 'budget', 'fault', 'isolate', 'detect', 'recover', 'journeys'].forEach((id) => { byId(id).disabled = true; });
    error(caught.message);
  }
}());
