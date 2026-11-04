(function () {
  'use strict';
  const form = document.getElementById('rehearsal-form');
  const trace = document.getElementById('trace');
  const alert = document.getElementById('error');
  const api = window.S142;
  const buttons = [...form.querySelectorAll('button')];

  function showError(message) {
    alert.textContent = message;
    alert.focus();
  }

  if (!api || typeof api.createState !== 'function' || typeof api.dispatch !== 'function' || typeof api.read !== 'function') {
    showError('Lesson unavailable: the local model did not load. No measurement is available; reopen the intact local files.');
    document.getElementById('phase').textContent = 'LOCAL SCRIPT ERROR - no result';
    return;
  }

  let state = api.createState();
  const text = (id, value) => { document.getElementById(id).textContent = value; };
  const shown = (value) => value === null ? 'UNKNOWN' : String(value);
  const decimal = (value) => value === null ? 'UNKNOWN' : Number(value.toFixed(2)).toString();

  function rows(id, values) {
    const body = document.getElementById(id);
    body.replaceChildren(...values.map((valuesInRow) => {
      const row = document.createElement('tr');
      for (const value of valuesInRow) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      }
      return row;
    }));
  }

  function render(view = api.read(state)) {
    const run = view.current;
    const instructions = {
      idle: 'Choose a fixed trace and record initialization. No demand or user operation will be generated.',
      initializing: 'Separate passing samples are available. Conduct the coupled burst to reveal shared competition.',
      burst: 'Inspect the shared window before measuring. Ready / HTTP 200 / average throughput are diagnostics only.',
      inspected: 'Measure all four original started journeys, including unknowns. You may then record the fixed recovery row.',
      measured: 'The measurement is retained. Record later recovery and inspect again, or reset to a new retained run.',
      recovered: 'Recovery is a later row, not a repair of history. Inspect this new observation before measuring again.',
    };
    text('phase', `Run ${run.id} / ${view.limits.maxRuns} · ${run.stage} · ${view.revision} / ${view.limits.maxCommands} retained commands`);
    text('instruction', instructions[run.stage]);
    trace.disabled = run.stage !== 'idle';
    document.getElementById('initialize').disabled = !view.availableCommands.includes('initialize');
    for (const button of form.querySelectorAll('[data-command]')) {
      button.disabled = !view.availableCommands.includes(button.dataset.command);
    }
    rows('tiers-body', view.separateTierSamples.map((sample) => [
      `${sample.tier}/${sample.version}`, sample.demandRps, sample.connections,
      sample.cpuPct, sample.latencyMs, sample.ready, sample.verdict,
    ]));
    rows('pressure-body', view.observations.map((record) => [
      `${record.id}: ${record.fromMs}–${record.throughMs}; shared sample ${record.sharedSampleAtMs}`,
      record.demand.rps,
      `${shown(record.initialization.connections)} + ${shown(record.demand.connections)} = ${shown(record.shared.connections)}`,
      `${shown(record.initialization.cpuPct)} + ${shown(record.demand.cpuPct)} = ${shown(record.shared.cpuPct)}`,
      record.queue.depth, shown(record.queue.waitMs), shown(record.initialization.completedAtMs),
      [record.initialization.requestedInstances, record.initialization.deployedInstances,
        record.initialization.readyInstances, record.initialization.trafficEligibleInstances].join('/'),
      `${record.health.ready} / ${record.health.httpStatus} / ${record.throughput.averageRps} requests/s`,
    ]));
    rows('journeys-body', view.journeySnapshots.map((record) => [
      `${record.id}/${record.observation}`, `${record.startedAtMs}/${shown(record.completedAtMs)}`,
      record.tierVersions.map((item) =>
        `${item.atMs}ms: ${item.frontend}/${item.api}/${item.data}/${item.worker}`).join(' → '),
      `${shown(record.stateIntact)}/${shown(record.businessEffects)}`,
      record.interruptions.length ? record.interruptions.map((item) => `${item.atMs}ms ${item.code}`).join(';') : 'None in this snapshot; prior snapshots retained',
    ]));
    const peak = view.observations[0];
    text('diagnostics', peak
      ? `${view.traceLabel}. Separate tier passes ${view.separateTierSamples.filter((item) => item.verdict === 'PASS').length} / ${view.separateTierSamples.length}; peak ready ${peak.health.ready}, HTTP ${peak.health.httpStatus}, average throughput ${peak.throughput.averageRps} requests/s. None replaces shared pressure or complete journeys.`
      : `${view.traceLabel}. Separate tier diagnostics are not a coupled-burst verdict.`);
    const result = view.latestMeasurement;
    const verdict = document.getElementById('verdict');
    verdict.dataset.verdict = result ? result.verdict.toLowerCase() : 'unmeasured';
    verdict.textContent = result ? result.verdict : 'NOT MEASURED';
    text('verifier', result
      ? `Synthetic verifier expected ${result.expectedVerdict}, measured ${result.verdict}, matched ${result.verifierMatched}. ${view.inspectionStale ? 'This is a PRIOR measurement; recovery requires fresh inspection.' : 'A detected negative fixture is not uninterrupted user success.'} Native proof false; five-nines certification false.`
      : 'Conduct, inspect and measure before drawing any synthetic verdict.');
    text('counts', result
      ? `Attempted ${result.counts.attempted}; successful ${result.counts.successful}; interrupted ${result.counts.interrupted}; unknown ${result.counts.unknown}. Uninterrupted transition fraction ${result.counts.successful} / ${result.counts.attempted} = ${decimal(result.successFraction * 100)}%.`
      : 'No measured transition verdict. Started outcomes, if any, remain in the retained-session denominator below.');
    text('latency', result
      ? `Known completion latency denominator ${result.latency.completedDenominator} / ${result.counts.attempted} started journeys; mean ${decimal(result.latency.meanMs)} ms; max ${shown(result.latency.maxMs)} ms; original budget ${result.latency.originalBudgetMs} ms. Means cannot hide an individual interruption.`
      : 'No complete-journey latency measurement.');
    const checks = [
      ...(result ? result.failedChecks.map((check) => `FAIL ${check.metric}: ${check.observed} > ${check.maximum} ${check.unit} (${check.record})`) : []),
      ...(result ? result.unknownChecks.map((check) => `UNKNOWN ${check.metric}: ${check.reason} (${check.record})`) : []),
      ...(result ? result.journeys.map((item) => `${item.id} ${item.outcome}; original latency ${shown(item.latencyMs)} / ${item.originalBudgetMs} ms; migration observed ${item.migrationObserved}${item.reasons.length ? '; ' + item.reasons.join('; ') : ''}`) : []),
    ];
    document.getElementById('checks').replaceChildren(...checks.map((value) => {
      const item = document.createElement('li');
      item.textContent = value;
      return item;
    }));
    text('measurement-json', JSON.stringify(result || { status: 'not measured', nativeProof: false }, null, 2));
    text('session-counts', `All retained runs: attempted ${view.sessionCounts.attempted}; successful ${view.sessionCounts.successful}; interrupted ${view.sessionCounts.interrupted}; unknown ${view.sessionCounts.unknown}. Reset and recovery do not delete these original journeys.`);
    document.getElementById('history').replaceChildren(...view.history.map((event) => {
      const item = document.createElement('li');
      item.textContent = `${event.sequence}. Run ${event.runId}: ${event.command.type}${event.command.traceId ? ' ' + event.command.traceId : ''}`;
      return item;
    }));
    text('retained-json', JSON.stringify({ summaries: view.runSummaries, runs: view.runs, history: view.history }, null, 2));
  }

  function execute(command) {
    try {
      const next = api.dispatch(state, command);
      const nextView = api.read(next);
      if (command.type === 'reset') form.reset();
      alert.textContent = '';
      render(nextView);
      state = next;
      const focusTarget = {
        initialize: 'burst', burst: 'inspect', inspect: 'measure',
        measure: 'recover', recover: 'inspect', reset: 'trace',
      }[command.type];
      const target = document.getElementById(focusTarget);
      if (target && !target.disabled) target.focus();
    } catch (cause) {
      showError(`Command rejected (${cause.code || 'LOCAL_ERROR'}): ${cause.message}. Retained records were not changed.`);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    execute({ type: 'initialize', traceId: trace.value });
  });
  for (const button of form.querySelectorAll('[data-command]')) {
    button.addEventListener('click', () => execute({ type: button.dataset.command }));
  }
  try { render(); }
  catch (cause) {
    buttons.forEach((button) => { button.disabled = true; });
    showError(`Local lesson unavailable: ${cause.message}. No result is certified.`);
  }
}());
