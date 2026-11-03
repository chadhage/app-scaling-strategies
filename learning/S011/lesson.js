'use strict';

(function conduct() {
  const { createRehearsal, transition } = globalThis.S011ScaleOut;
  const byId = (id) => document.getElementById(id);
  const text = (id, value) => { byId(id).textContent = String(value); };
  const known = (value) => value === null ? 'unknown' : String(value);
  const count = (value, confirmed) => value === null ? `Unknown (${confirmed} confirmed)` : String(value);
  let state = createRehearsal();

  function row(values) {
    const element = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      element.append(cell);
    }
    return element;
  }

  function render() {
    const capacity = state.capacity;
    byId('configuration-fields').disabled = Boolean(state.configuration);
    text('requested-count', capacity.requested);
    text('deployed-count', count(capacity.deployed, capacity.confirmedDeployed));
    text('ready-count', count(capacity.ready, capacity.confirmedReady));
    text('eligible-count', capacity.eligible);
    text('clock-summary', `Logical time ${state.clockSeconds} s · phase ${state.phase} · observation epoch ${state.requestEpoch} · shared-compute slots ${state.slots} · current fixture ${state.activeCondition}.`);
    text('load-summary', `Synthetic demand: current ${state.load.observedRps}, planned ${state.load.plannedRps} requests/s. Ready capacity ${known(state.load.readyCapacityRps)}, traffic-eligible capacity ${state.load.eligibleCapacityRps} requests/s. Admission ceiling: 80% per pool and total. Observed old/new pool load: ${state.load.oldPoolRps} / ${state.load.newPoolRps} requests/s.`);
    text('connection-summary', `Dependency connections: observed ${known(state.connections.observed)} / limit ${state.connections.limit}; projected requested pools ${state.connections.projected}; ${state.connections.poolPerInstance} per deployed instance. Within limit: ${known(state.connections.withinLimit)}.`);
    text('share-summary', `Requested added-instance share: ${state.load.requestedNewSharePercent}%. Observed from client instance IDs: ${state.load.observedNewSharePercent === null ? 'not yet observed' : `${state.load.observedNewSharePercent}%`}. Configured percentages alone are not admissions evidence.`);
    text('last-action', `Last action: ${state.lastResult.verdict}${state.lastResult.action ? ` · ${state.lastResult.action}` : ''}`);
    text('action-reason', state.lastResult.reason);
    byId('input-error').hidden = state.lastResult.verdict !== 'INVALID';
    text('input-error', state.lastResult.verdict === 'INVALID' ? `Invalid input: ${state.lastResult.reason}` : '');
    text('cumulative-verdict', `Transition verifier: ${state.result.verdict} · user outcome: ${state.result.userOutcome}.`);
    const totals = state.totals;
    text('impact-summary', `Attempted transitions ${totals.attemptedTransitions}; successful ${totals.successfulTransitions}; interrupted ${totals.interruptedTransitions}; unknown ${totals.unknownTransitions}. Old-only journeys ${totals.oldOnlyJourneys}, old-only successful ${totals.oldOnlySuccessful} (excluded from transition numerator and denominator). Success fraction: ${state.result.successRate === null ? 'not measured' : `${totals.successfulTransitions}/${totals.attemptedTransitions}`}.`);
    text('cleanup-summary', `Cleanup: ${state.result.cleanup}`);
    byId('instance-rows').replaceChildren(...state.instances.map((instance) => row([
      instance.id, instance.baseline ? 'original' : 'additional',
      known(instance.deployed), instance.readiness,
      state.eligibleIds.includes(instance.id) ? 'yes' : 'no', known(instance.observedAtSeconds)
    ])));
    byId('client-rows').replaceChildren(...state.clients.map((client) => row([
      client.id, client.instanceId, client.affected ? 'transition' : 'old-only',
      `${known(client.latencyMs)} / ${client.budgetMs}`, client.connection,
      known(client.stateIntact), known(client.effectCount), client.outcome
    ])));
    const events = state.history.map((event) => {
      const item = document.createElement('li');
      const description = document.createElement('p');
      description.textContent = `${event.id} · ${event.logicalSeconds} s · ${event.action}: ${event.verdict}. Requested/deployed/ready/eligible ${event.capacity.requested}/${known(event.capacity.deployed)}/${known(event.capacity.ready)}/${event.capacity.eligible}. ${event.reason}`;
      item.append(description);
      if (event.assertions.length) {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = `${event.assertions.length} measured assertions`;
        const list = document.createElement('ul');
        for (const assertion of event.assertions) {
          const entry = document.createElement('li');
          entry.textContent = `${assertion.id}: ${assertion.status}; expected ${known(assertion.expected)}; observed ${known(assertion.observed)} ${assertion.unit}.`;
          if (Object.hasOwn(assertion, 'missingCompletions')) {
            entry.textContent += ` Incomplete ${assertion.missingCompletions}; completed over budget ${assertion.overBudgetCompletions}.`;
          }
          list.append(entry);
        }
        details.append(summary, list);
        item.append(details);
      }
      return item;
    });
    byId('action-history').replaceChildren(...events);
    text('run-evidence', JSON.stringify({
      cardId: 'A-S011', kano: 'S', kanoUnit: 'A-S011', packet: 'SC-S011',
      owner: 'worker-A-S011', sourceParent: 'D-S011', originalPrerequisite: 'D-S021',
      ...state
    }, null, 2));
  }

  function act(action, input) {
    state = transition(state, action, input);
    render();
  }

  byId('request-form').addEventListener('submit', (event) => {
    event.preventDefault();
    act('request', {
      targetInstances: byId('target-total').value,
      demandRps: byId('demand-rps').value,
      connectionLimit: byId('connection-ceiling').value,
      condition: byId('fixture-condition').value
    });
  });
  byId('admission-form').addEventListener('submit', (event) => {
    event.preventDefault();
    act('admit', { sharePercent: byId('added-share').value });
  });
  for (const [id, action] of [
    ['observe-capacity', 'observe'], ['verify-capacity', 'verify'],
    ['age-evidence', 'wait'], ['add-shared-slot', 'add-slot'], ['recover-fixture', 'recover']
  ]) {
    byId(id).addEventListener('click', () => act(action));
  }
  byId('restart-rehearsal').addEventListener('click', () => {
    byId('request-form').reset();
    byId('admission-form').reset();
    act('reset');
  });
  render();
}());
