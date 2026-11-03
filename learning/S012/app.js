(function () {
  'use strict';
  const model = globalThis.ScaleOutRehearsal;
  const byId = (id) => document.getElementById(id);
  const form = byId('conduct-controls');
  const text = (id, value) => { byId(id).textContent = String(value); };
  const known = (value) => value === null ? 'UNKNOWN' : String(value);
  const archives = [];
  let state;
  let runNumber = 1;
  let uiError = null;

  function lock(value) {
    byId('input-fields').disabled = value;
    byId('advance-window').disabled = value;
    byId('observe-journeys').disabled = value;
  }

  function fatal(error) {
    uiError = `Unexpected rehearsal error: ${error.message}. No positive conclusion is available. Archive/reset to recover.`;
    lock(true);
    text('verdict', 'ERROR');
    byId('verdict').dataset.verdict = 'ERROR';
    text('verdict-detail', uiError);
    text('command-result', uiError);
    text('input-error', uiError);
    byId('input-error').hidden = false;
    text('run-evidence', JSON.stringify({
      cardId: 'A-S012', kano: 'S', kanoUnit: 'A-S012', packet: 'SC-S012',
      mode: 'synthetic-only', runNumber, uiError, effectiveVerdict: 'ERROR', state, archives,
      nativeProof: false, productionNode24Validated: false, parentComplete: false
    }, null, 2));
  }

  if (!model) {
    fatal(new Error('The local model did not load'));
    return;
  }
  state = model.initial();

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
    const summary = model.summarize(state);
    const invalid = state.lastResult.verdict === 'INVALID';
    const verdict = invalid ? 'INVALID' : summary.verification.verdict;
    text('verdict', verdict);
    byId('verdict').dataset.verdict = verdict;
    text('verdict-detail', invalid ? state.lastResult.message : summary.verification.message);
    text('command-result', `${state.lastResult.verdict}: ${state.lastResult.message}`);
    const alarm = ['INVALID', 'UNSUPPORTED', 'UNKNOWN', 'PROVISION_FAILED', 'LIMIT'].includes(state.lastResult.verdict);
    byId('input-error').hidden = !alarm;
    text('input-error', alarm ? `${state.lastResult.verdict}: ${state.lastResult.message}` : '');
    text('clock-value', `${state.clockSeconds} seconds`);
    text('requested-value', summary.capacity.requested);
    text('ready-value', known(summary.capacity.effectiveReady));
    const last = state.observations.at(-1);
    text('metric-values', last ? `${known(last.cpuPct)} / ${known(last.memoryPct)} at ${last.atSeconds}s` : 'NOT_OBSERVED');
    text('rule-decision', summary.rule.lastDecision);
    text('user-verdict', summary.users.verdict);
    text('capacity-detail', `Last-confirmed ready: ${summary.capacity.lastConfirmedReady} (historical when current capacity is unknown). Warming: ${summary.capacity.warming}. Saturated metric windows: ${summary.capacity.saturationWindows}; queued metric windows: ${summary.capacity.queuedWindows}.`);
    text('user-counts', `Attempts ${summary.users.attempts}; completed ${summary.users.completed}; uninterrupted ${summary.users.uninterrupted}; interrupted ${summary.users.interrupted}; unknown ${summary.users.unknown}. Maximum observed latency: ${known(summary.users.maxLatencyMs)} ms. No rate is claimed from zero or incomplete samples.`);
    const transition = summary.transition;
    text('transition-counts', `Transitions requested ${transition.requested}; observed ready ${transition.ready}; failed ${transition.failed}. Client samples: baseline ${transition.baselineSamples}, warming ${transition.warmingSamples}, post-scale ${transition.postScaleSamples}; post-scale samples served by added instances ${transition.addedInstanceSamples}.`);

    const metrics = byId('metric-rows');
    metrics.replaceChildren(...state.observations.map((entry) => row([
      `${entry.id} / ${entry.atSeconds}s`,
      `${known(entry.cpuPct)} / ${known(entry.memoryPct)} (raw ${known(entry.rawCpuPct)} / ${known(entry.rawMemoryPct)})`,
      `${entry.requested} / ${known(entry.readyObserved)}`,
      `${known(entry.queueRps)} rps / ${known(entry.saturated)}`,
      `${entry.decision}: ${entry.message}`
    ])));
    byId('transition-rows').replaceChildren(...state.transitions.map((entry) => row([
      `${entry.id} / ${entry.triggerMetrics.join(' OR ')}`,
      `${entry.from} → ${entry.to}`,
      `${entry.requestedAt}s / ${entry.readyAt === null ? 'not observed' : `${entry.readyAt}s`} / ${entry.failedAt === null ? 'none' : `${entry.failedAt}s`}`,
      entry.status
    ])));
    byId('journey-rows').replaceChildren(...state.journeys.map((entry) => row([
      `${entry.id} / ${entry.clientId} / ${entry.phase}`,
      `${known(entry.instance)} / ${known(entry.httpStatus)}`,
      `${known(entry.latencyMs)} / ${entry.budgetMs} ms / ${known(entry.queueRps)} rps`,
      `${known(entry.authenticated)} / ${known(entry.stateCorrect)} / ${known(entry.effects)}`,
      `${entry.outcome}${entry.reasons.length ? `: ${entry.reasons.join(' ')}` : ''}`
    ])));
    text('archive-title', `Retained prior runs (${archives.length})`);
    byId('archive-list').replaceChildren(...archives.map((entry) => {
      const element = document.createElement('li');
      element.textContent = `Run ${entry.runNumber}: ${entry.uiError ? 'ERROR' : entry.summary.verification.verdict}; ${entry.state.observations.length} metric windows, ${entry.summary.users.attempts} client attempts, ${entry.summary.users.interrupted} interrupted, ${entry.summary.users.unknown} unknown. Full immutable snapshot retained in JSON below.`;
      return element;
    }));
    text('run-evidence', JSON.stringify({
      cardId: 'A-S012', kano: 'S', kanoUnit: 'A-S012', packet: 'SC-S012',
      mode: 'synthetic-only', runNumber, uiError, effectiveVerdict: verdict,
      state, summary, archives, nativeProof: false, productionNode24Validated: false, parentComplete: false
    }, null, 2));
  }

  function conduct(event) {
    if (uiError) return;
    try {
      state = model.reduce(state, event);
      render();
    } catch (error) {
      fatal(error);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    conduct({
      type: 'apply', cpuUnits: byId('cpu-demand').value, memoryUnits: byId('memory-demand').value,
      offeredRps: byId('offered-load').value, latencyBudgetMs: byId('latency-budget').value,
      profile: byId('rule-profile').value, fault: byId('observation-condition').value
    });
  });
  byId('advance-window').addEventListener('click', () => conduct({ type: 'tick' }));
  byId('observe-journeys').addEventListener('click', () => conduct({ type: 'observe' }));
  byId('restart-rehearsal').addEventListener('click', () => {
    try {
      if (state.events.length || uiError) {
        if (archives.length >= 8) {
          fatal(new Error('Archive limit reached; copy the retained JSON and reload. No archived run was deleted'));
          return;
        }
        archives.push(JSON.parse(JSON.stringify({
          runNumber, state, summary: model.summarize(state), uiError
        })));
      }
      form.reset();
      state = model.initial();
      runNumber += 1;
      uiError = null;
      lock(false);
      render();
      text('command-result', 'Reset complete. Previous observations are archived for this page session; default inputs and two ready instances restored.');
    } catch (error) {
      fatal(error);
    }
  });
  try { render(); } catch (error) { fatal(error); }
}());
