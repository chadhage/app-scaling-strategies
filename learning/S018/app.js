(function () {
  'use strict';
  const model = globalThis.S018Lesson;
  const byId = (id) => document.getElementById(id);
  const tiers = ['frontend', 'api', 'worker'];
  const names = { frontend: 'Frontend', api: 'API', worker: 'Worker' };
  let state = model.createLesson();
  const unknown = (value) => value === null ? 'UNKNOWN' : String(value);
  const actionText = (action) => {
    if (action.type === 'scale') return `Scale only ${names[action.tier]} to ${action.count}.`;
    if (action.type === 'scale-all') return 'Indiscriminate comparison: scale every tier to 2.';
    return `Observe: ${action.proof} downstream evidence; ${action.contract} tier contracts.`;
  };
  function row(values) {
    const element = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      element.append(cell);
    }
    return element;
  }
  function commandList(run) {
    return run.commands.map((action) => {
      const item = document.createElement('li');
      item.textContent = actionText(action);
      return item;
    });
  }
  function render() {
    const run = state.current;
    const latest = run.observations.at(-1);
    const full = run.commands.length >= model.LIMITS.commands;
    const observed = run.observations.length >= model.LIMITS.observations;
    byId('active-fixture').textContent =
      `Run ${run.id}: ${names[run.bottleneck]} is constrained (6 journeys/instance/window); other tiers handle 12. Demand 10; DB limit 12; original journey budget 150 ms.`;
    for (const tier of tiers) {
      byId(`count-${tier}`).textContent = String(run.counts[tier]);
      byId(`${tier}-instances`).disabled = full;
      byId(`scale-${tier}`).disabled = full;
    }
    byId('bottleneck').value = run.bottleneck;
    byId('bottleneck').disabled = run.commands.length > 0;
    byId('configure-fixture').disabled = run.commands.length > 0;
    byId('scale-all').disabled = full;
    byId('observe-window').disabled = full || observed;
    byId('completion-proof').disabled = full || observed;
    byId('tier-contract').disabled = full || observed;
    byId('bounds').textContent =
      `${run.commands.length}/24 commands · ${run.observations.length}/8 observations · ${state.archives.length}/6 archived runs${full || observed ? ' · Bound reached; archive/reset remains available.' : ''}`;
    byId('run-verdict').textContent = run.verdict;
    byId('run-verdict').dataset.verdict = run.verdict;
    byId('latest-verdict').textContent = latest?.verdict || 'NOT_RUN';
    byId('latest-verdict').dataset.verdict = latest?.verdict || 'NOT_RUN';
    const total = run.observations.reduce((sum, window) => ({
      completed: sum.completed + window.completed, failed: sum.failed + window.failed, unknown: sum.unknown + window.unknown
    }), { completed: 0, failed: 0, unknown: 0 });
    byId('cumulative-summary').textContent = run.observations.length
      ? `${run.observations.length} windows: ${total.completed} verified successful, ${total.failed} failed, ${total.unknown} unknown journeys. Historical failures and unknowns are retained.`
      : 'No observations. Neither capacity settings nor an unrun fixture can PASS.';
    byId('latest-summary').textContent = latest
      ? `Window ${latest.window}: ${latest.admitted}/10 admitted; tier capacities F/A/W ${tiers.map((tier) => latest.capacities[tier]).join('/')}; configured connection demand ${latest.requestedConnections}; observed DB ${unknown(latest.observedConnections)}/12; excess ${unknown(latest.connectionExcess)}; successful ${latest.completed}, failed ${latest.failed}, unknown ${latest.unknown}; maximum latency ${unknown(latest.maxLatencyMs)}${latest.maxLatencyMs === null ? '' : ' ms'} / 150 ms.`
      : 'No observed connections, completions or latency.';
    const assertionNames = {
      tierCapacity: 'Every tier can admit all 10 journeys',
      connections: 'Occupied downstream connections ≤ 12',
      contracts: 'Cross-tier contracts remain compatible',
      journeys: 'All 10 journeys correct and within 150 ms'
    };
    byId('assertion-rows').replaceChildren(...Object.entries(assertionNames)
      .map(([key, label]) => row([label, latest?.assertions[key] || 'NOT_RUN'])));
    byId('journey-rows').replaceChildren(...(latest?.journeys || [])
      .map((journey) => row([journey.id, journey.outcome, journey.reason, unknown(journey.latencyMs)])));
    byId('observation-rows').replaceChildren(...run.observations.map((window) => row([
      window.window, tiers.map((tier) => window.counts[tier]).join('/'), window.admitted,
      unknown(window.observedConnections), `${window.completed} / ${window.failed} / ${window.unknown}`, window.verdict
    ])));
    byId('command-history').replaceChildren(...commandList(run));
    byId('archives').replaceChildren(...state.archives.map((archive) => {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = `Run ${archive.id} — ${archive.verdict} — ${archive.observations.length} observations — ${names[archive.bottleneck]} bottleneck`;
      const commands = document.createElement('ol');
      commands.append(...commandList(archive));
      const trace = document.createElement('pre');
      trace.textContent = JSON.stringify(archive.observations, null, 2);
      details.append(summary, commands, trace);
      return details;
    }));
    byId('run-evidence').textContent = JSON.stringify(state, null, 2);
  }
  function commit(makeAction, message) {
    try {
      const action = makeAction();
      const next = model.dispatch(state, action);
      state = next;
      if (action.type === 'reset') document.querySelectorAll('form').forEach((form) => form.reset());
      render();
      byId('input-error').hidden = true;
      byId('input-error').textContent = '';
      byId('action-status').textContent = message;
      if (action.type === 'reset') byId('bottleneck').focus();
    } catch (error) {
      byId('input-error').textContent = `Action rejected: ${error.message} Previous synthetic evidence is unchanged.`;
      byId('input-error').hidden = false;
      byId('input-error').focus();
    }
  }
  byId('fixture-form').addEventListener('submit', (event) => {
    event.preventDefault();
    commit(() => ({ type: 'configure', bottleneck: byId('bottleneck').value }), 'Bottleneck configured. No observation has been conducted.');
  });
  for (const tier of tiers) {
    byId(`${tier}-form`).addEventListener('submit', (event) => {
      event.preventDefault();
      commit(() => {
        const text = byId(`${tier}-instances`).value;
        if (!/^[1-3]$/.test(text)) throw new Error('Instance count must be exactly 1, 2 or 3; no spaces, decimals or exponent notation.');
        return { type: 'scale', tier: event.currentTarget.dataset.tier, count: Number(text) };
      }, `${names[tier]} scaling applied. Observe the unchanged downstream and journey budgets before claiming success.`);
    });
  }
  byId('scale-all').addEventListener('click', () => commit(() => ({ type: 'scale-all' }),
    'All tiers scaled to 2 for comparison. Observe downstream pressure; this is not a successful-user result.'));
  byId('observation-form').addEventListener('submit', (event) => {
    event.preventDefault();
    commit(() => ({
      type: 'observe', proof: byId('completion-proof').value, contract: byId('tier-contract').value
    }), 'One synthetic window observed. Read both latest and cumulative results; no live Azure operation occurred.');
  });
  byId('archive-reset').addEventListener('click', () => commit(() => ({ type: 'reset' }),
    'Archived the nonempty run and reset to a fresh default API fixture. Up to six earlier runs remain; page reload clears memory.'));
  render();
}());
