(function () {
  'use strict';
  const model = globalThis.OscillationRehearsal;
  const byId = (id) => document.getElementById(id);
  const form = byId('oscillation-controls');
  const text = (id, value) => { byId(id).textContent = String(value); };
  const known = (value) => value === null ? 'UNKNOWN' : String(value);
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const archives = [];
  let state = null;
  let summary = null;
  let uiError = null;
  let runNumber = 1;

  function lock() {
    byId('input-fields').disabled = Boolean(uiError || state?.cursor);
    byId('observation-condition').disabled = Boolean(uiError);
    for (const id of ['advance-window', 'run-remaining']) {
      byId(id).disabled = Boolean(uiError || state?.cursor === 10);
    }
  }

  function evidence(verdict) {
    return {
      cardId: 'A-S016', workerId: 'worker-A-S016', kano: 'S', kanoUnit: 'A-S016',
      packet: 'SC-S016', mode: 'synthetic-only', runNumber, uiError, effectiveVerdict: verdict,
      state, summary, archives, nativeProof: false, productionNode24Validated: false, parentComplete: false
    };
  }

  function fatal(error) {
    uiError = `Unexpected rehearsal error: ${error.message}. No positive conclusion is available. Archive/reset to recover.`;
    lock();
    text('verdict', 'ERROR');
    byId('verdict').dataset.verdict = 'ERROR';
    text('verdict-detail', uiError);
    text('command-result', uiError);
    text('input-error', uiError);
    byId('input-error').hidden = false;
    text('run-evidence', JSON.stringify(evidence('ERROR'), null, 2));
  }

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
    summary = model.summarize(state);
    const rejected = ['INVALID', 'LIMIT'].includes(state.lastResult.verdict);
    const verdict = rejected ? state.lastResult.verdict : summary.verification.verdict;
    text('verdict', verdict);
    byId('verdict').dataset.verdict = verdict;
    text('verdict-detail', rejected ? state.lastResult.message : summary.verification.message);
    text('window-count', `${state.cursor} / 10 windows`);
    text('active-fixture', `Active fixture: ${state.config.pattern}; low ${state.config.lowRps} rps; high ${state.config.highRps} rps; down-stabilization ${state.config.stabilizationWindows} windows; cooldown ${state.config.cooldownWindows} windows; original budget ${state.config.budgetMs} ms. Unapplied field edits do not change this configuration.`);
    text('command-result', `${state.lastResult.verdict}: ${state.lastResult.message}`);
    const alarm = rejected || ['FAIL', 'UNKNOWN'].includes(summary.verification.verdict);
    byId('input-error').hidden = !alarm;
    text('input-error', alarm ? (rejected ? state.lastResult.message : summary.verification.message) : '');
    for (const name of ['immediate', 'stabilized']) {
      const lane = summary.lanes[name];
      text(`${name}-outcome`, lane.userOutcome);
      text(`${name}-capacity`, `Observed ready: ${known(lane.currentReady)}. Pending target: ${state.lanes[name].pending?.target ?? 'none'}. Max observed queue: ${known(lane.maxQueueRps)} rps.`);
      text(`${name}-changes`, `Scale requests ${lane.requestedChanges}; effective changes ${lane.effectiveChanges}; direction reversals ${lane.reversals}; unsafe removals ${lane.unsafeTransitions}; readiness failures ${lane.readinessFailures}.`);
      text(`${name}-clients`, `Attempts ${lane.attempts}; uninterrupted ${lane.uninterrupted}; interrupted ${lane.interrupted}; unknown ${lane.unknown}. Max observed latency ${known(lane.maxLatencyMs)} ms; original budget ${state.config.budgetMs} ms.`);
    }
    const traceRows = [];
    const journeyRows = [];
    for (const entry of state.observations) {
      for (const name of ['immediate', 'stabilized']) {
        const lane = entry.lanes[name];
        traceRows.push(row([
          `${entry.window} / ${entry.demandRps} rps`, name,
          `${lane.target} / ${known(lane.ready)} / ${lane.pendingTarget ?? 'none'}`,
          `${lane.decision} / ${lane.lowStreak} / ${lane.cooldownRemaining}`,
          `${known(lane.queueRps)} / ${lane.unsafeDown}`,
          lane.changes.length ? lane.changes.map((change) => `${change.phase} ${change.direction} ${change.from}→${change.to}`).join('; ') : 'none'
        ]));
        for (const journey of lane.journeys) {
          journeyRows.push(row([
            `${entry.window} / ${name} / ${journey.clientId}`,
            `${known(journey.completed)} / ${known(journey.httpStatus)}`,
            `${known(journey.latencyMs)} / ${journey.budgetMs}`,
            `${known(journey.stateCorrect)} / ${known(journey.effects)}`,
            `${journey.outcome}${journey.reasons.length ? `: ${journey.reasons.join(' ')}` : ''}`
          ]));
        }
      }
    }
    byId('trace-rows').replaceChildren(...traceRows);
    byId('journey-rows').replaceChildren(...journeyRows);
    text('archive-title', `Retained prior runs (${archives.length})`);
    byId('archive-list').replaceChildren(...archives.map((entry) => {
      const element = document.createElement('li');
      element.textContent = `Run ${entry.runNumber}: ${entry.uiError ? 'ERROR' : entry.summary?.verification.verdict ?? 'NOT_RUN'}; ${entry.state?.cursor ?? 0} windows. Full prior state, failures, unknowns and errors are retained in the JSON.`;
      return element;
    }));
    lock();
    text('run-evidence', JSON.stringify(evidence(verdict), null, 2));
  }

  function conduct(event) {
    if (uiError) return false;
    try {
      const previousWindow = state.cursor;
      const candidate = model.reduce(state, event);
      model.summarize(candidate);
      state = candidate;
      render();
      return state.cursor > previousWindow;
    } catch (error) {
      fatal(error);
      return false;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    conduct({
      type: 'configure', pattern: byId('demand-pattern').value,
      lowRps: byId('low-demand').value, highRps: byId('high-demand').value,
      stabilizationWindows: byId('stabilization-windows').value,
      cooldownWindows: byId('cooldown-windows').value, budgetMs: byId('latency-budget').value
    });
  });
  const nextWindow = () => conduct({ type: 'step', condition: byId('observation-condition').value });
  byId('advance-window').addEventListener('click', nextWindow);
  byId('run-remaining').addEventListener('click', () => {
    while (!uiError && state.cursor < 10) if (!nextWindow()) break;
  });
  byId('restart-rehearsal').addEventListener('click', () => {
    try {
      if ((state?.events.length || uiError) && archives.length === 6) {
        throw new Error('Archive limit reached. Copy the JSON and reload. No archived run was deleted');
      }
      const fresh = model.initial();
      model.summarize(fresh);
      if (state?.events.length || uiError) archives.push(copy({ runNumber, state, summary, uiError }));
      form.reset();
      state = fresh;
      runNumber += 1;
      uiError = null;
      render();
      text('command-result', 'Reset complete. Defaults restored and prior evidence archived in this page session.');
      byId('restart-rehearsal').focus();
    } catch (error) {
      fatal(error);
    }
  });
  try {
    if (!model) throw new Error('The local model did not load');
    state = model.initial();
    render();
  } catch (error) {
    fatal(error);
  }
}());
