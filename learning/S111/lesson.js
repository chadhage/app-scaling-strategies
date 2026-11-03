(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const form = byId('exercise-form');
  const model = globalThis.S111Model;
  if (!model || typeof model.createState !== 'function' || typeof model.transition !== 'function') return;
  let state = model.createState();
  const buttons = ['observe-baseline', 'record-loss', 'measure', 'recover'];
  const required = ['baseline', 'loss-ready', 'awaiting-measurement', 'measured'];
  const word = value => value === null ? 'unknown' : String(value);

  function row(cells) {
    const tr = document.createElement('tr');
    for (const value of cells) {
      const td = document.createElement('td');
      td.textContent = word(value);
      tr.append(td);
    }
    return tr;
  }

  function render() {
    const active = state.current === null ? null : state.runs[state.current - 1];
    const ready = state.phase === 'ready';
    const full = state.runs.length >= model.MAX_RUNS;
    byId('fixture').disabled = !ready || full;
    byId('scope-claim').disabled = !ready || full;
    byId('begin').disabled = !ready || full;
    buttons.forEach((id, index) => { byId(id).disabled = state.phase !== required[index]; });
    byId('reset-lesson').disabled = ready;
    byId('phase').textContent = `Phase: ${state.phase}. Rehearsals: ${state.runs.length}/${model.MAX_RUNS}.`;
    byId('status').textContent = active
      ? active.assessment
        ? `Overall: ${active.assessment.overall}. Workload/state contract: ${active.assessment.contract}. Scope claim: ${active.assessment.scopeClaim}.`
        : 'Post-loss result: unknown. Explicit observation is required; desired topology proves nothing.'
      : full ? 'Session full. All six rehearsals are retained; reload only to clear the session.'
        : 'Ready. Choose a fixed trace; no loss or recovery action operates on real systems.';
    byId('metrics').textContent = active && active.measurement
      ? `Surviving capacity: ${word(active.measurement.observedCapacityRps)} requests/s; demand: 60. Capacity gate: ${active.measurement.capacityGate}; state gate: ${active.measurement.stateGate}. Journeys: ${active.measurement.counts.successes} success, ${active.measurement.counts.interruptions} interruption, ${active.measurement.counts.unknown} unknown. Budget: 120 ms.`
      : active && active.baseline ? 'Authored baseline: 120 requests/s, six successful samples, matching state. A baseline is not post-loss evidence.'
        : 'No measured capacity or state yet.';
    byId('recovery').textContent = active && active.recovery
      ? 'Fictional recovery: worker-a returned; capacity 120 requests/s; 6 success, 0 interruption, 0 unknown. Earlier loss results are unchanged.'
      : active && active.loss ? 'Only worker-a has an authored absent record. No process, node, zone, region or network was changed.'
        : 'All actions reveal fixed fictional teaching DATA ONLY.';
    const observation = active && active.measurement;
    byId('evidence-help').textContent = observation
      ? 'Authored post-loss observations only. Unknown is not zero or healthy. A successful HTTP response must also meet latency and state requirements.'
      : 'No post-loss observations yet. Configured topology is not measured capacity.';
    byId('workers').replaceChildren(...(observation ? observation.workers.map(worker => row([
      worker.workerId, worker.observedServing, worker.capacityRps,
      worker.state === null ? 'unknown' : Object.keys(model.REQUIRED_STATE).map(key => `${key}: ${worker.state[key]}`).join('; '),
    ])) : []));
    byId('journeys').replaceChildren(...(observation ? observation.journeys.map(journey => row([
      `${journey.sample}: ${journey.operation}`, `${journey.workerId} / ${journey.version}`,
      journey.httpStatus, journey.elapsedMs, journey.stateMatches, journey.outcome,
    ])) : []));
    const domains = active && active.assessment ? Object.entries(active.assessment.scopeEvidence) : [];
    byId('scope-results').replaceChildren(...domains.map(([domain, explanation]) => {
      const li = document.createElement('li');
      li.textContent = `${domain}: ${explanation}`;
      return li;
    }));
    byId('history-count').textContent = `${state.runs.length} retained rehearsals; ${state.events.length}/${model.MAX_EVENTS} retained ordered actions.`;
    byId('history').replaceChildren(...state.runs.map(run => {
      const li = document.createElement('li');
      const result = run.assessment ? run.assessment.overall : 'unknown (unmeasured)';
      const counts = run.measurement
        ? `${run.measurement.counts.successes} success / ${run.measurement.counts.interruptions} interruption / ${run.measurement.counts.unknown} unknown`
        : 'no post-loss observations';
      li.textContent = `Run ${run.id}: ${model.FIXTURES[run.fixture]}; claim ${run.scopeClaim}; loss result ${result}; ${counts}; phase ${run.phase}${run.recovery ? '; recovery positive (authored only)' : ''}${run.reset ? '; controls reset, evidence retained' : ''}.`;
      return li;
    }));
  }

  function act(action, input) {
    try {
      const next = model.transition(state, action, input);
      state = next;
      byId('error').hidden = true;
      byId('error').textContent = '';
      if (action === 'reset') HTMLFormElement.prototype.reset.call(form);
      render();
      byId('feedback').focus();
    } catch (error) {
      byId('error').textContent = `Action rejected. ${error.message} Last valid state and history are unchanged.`;
      byId('error').hidden = false;
      byId('error').focus();
    }
  }

  try {
    byId('topology').replaceChildren(...model.TOPOLOGY.map(worker => row([
      `${worker.workerId} / ${worker.version}`, worker.node, worker.zone, worker.region, worker.role,
    ])));
    form.addEventListener('submit', event => {
      event.preventDefault();
      act('begin', { fixture: byId('fixture').value, scopeClaim: byId('scope-claim').value });
    });
    buttons.forEach(id => byId(id).addEventListener('click', () => act(id)));
    byId('reset-lesson').addEventListener('click', () => act('reset'));
    render();
    byId('boot-error').hidden = true;
  } catch {
    form.querySelectorAll('button, select').forEach(control => { control.disabled = true; });
    [...buttons, 'reset-lesson'].forEach(id => { byId(id).disabled = true; });
    byId('boot-error').hidden = false;
  }
}());
