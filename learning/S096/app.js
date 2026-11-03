(function () {
  'use strict';

  const model = window.S096Model;
  const get = (id) => document.getElementById(id);
  const form = get('controls');
  const fields = {
    topology: 'topology',
    productionWorkers: 'production-workers',
    candidateWorkers: 'candidate-workers',
    slots: 'slot-count',
    productionDemand: 'production-demand',
    warmDemand: 'warm-demand',
    dependencyCapacity: 'dependency-capacity',
    journeyBudgetMs: 'journey-budget',
    warmupBudgetMs: 'warmup-budget',
    coverage: 'coverage',
  };
  const currentText = [
    'verdict', 'impact', 'admission', 'evidence-gaps', 'configured-compute', 'total-compute',
    'added-compute', 'slot-compute', 'production-headroom', 'candidate-headroom',
    'dependency-headroom', 'candidate-ready', 'journey-counts', 'transitions', 'transition-rate',
  ];
  const impactLabels = {
    'interrupted-production': 'Interrupted production journeys; no candidate exposure or migration.',
    'safe-abort-before-exposure': 'Safe abort before exposure. Production checks passed; no completed migration.',
    'unverified': 'Unverified warm-up rehearsal. Missing observations cannot establish uninterrupted service.',
    'production-preserved-no-transition': 'Production preserved in this synthetic warm-up only; no user migration.',
  };
  let state = model.createState();

  function text(id, value) {
    get(id).textContent = String(value);
  }

  function units(value) {
    return value === null ? 'Unknown (not observed)' : `${value} units`;
  }

  function duration(value) {
    return value === null ? 'Unknown (not observed)' : `${value} ms`;
  }

  function rows(id, values) {
    get(id).replaceChildren(...values.map((cells) => {
      const row = document.createElement('tr');
      for (const value of cells) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      }
      return row;
    }));
  }

  function clearError() {
    get('error').hidden = true;
    text('error', '');
    Object.values(fields).forEach((id) => get(id).removeAttribute('aria-invalid'));
  }

  function showError(error) {
    text('error', `${error.code || 'ERR_INPUT'}: ${error.message}`);
    get('error').hidden = false;
    if (fields[error.field]) get(fields[error.field]).setAttribute('aria-invalid', 'true');
    get('error').focus();
  }

  function configuration() {
    return Object.fromEntries(Object.entries(fields).map(([key, id]) => {
      const value = get(id).value;
      if (!Object.hasOwn(model.limits, key)) return [key, value];
      if (!/^(0|[1-9]\d*)$/.test(value)) {
        const error = new Error(`${key} requires a non-empty whole-number value.`);
        error.code = 'ERR_INPUT';
        error.field = key;
        throw error;
      }
      return [key, Number(value)];
    }));
  }

  function renderCurrent() {
    const result = get('result');
    result.hidden = !state.current;
    if (!state.current) {
      delete result.dataset.verdict;
      delete result.dataset.impact;
      currentText.forEach((id) => text(id, ''));
      ['gates', 'production-trace', 'warm-trace', 'phase-trace'].forEach((id) => get(id).replaceChildren());
      return;
    }
    const run = state.current;
    const metrics = run.metrics;
    result.dataset.verdict = run.verdict;
    result.dataset.impact = run.impact;
    text('verdict', `Warm-up acceptance: ${run.verdict}. Verifier: ${run.verification}.`);
    text('impact', impactLabels[run.impact]);
    text('admission', run.verdict === 'success'
      ? 'Synthetic warm-up gates passed. This lesson does not expose a candidate or migrate users.'
      : 'Candidate admission blocked before exposure; failed and unknown evidence remains recorded.');
    text('evidence-gaps', run.gaps.length ? run.gaps.join(' ') : 'Complete fixture observations; still no native evidence.');
    text('configured-compute', `Configured fixture compute: ${metrics.configuredTotalComputeUnits} units (intent, not observation). Baseline: one 100-unit production worker. Extra compute comes only from explicit workers, never slot count.`);
    text('total-compute', units(metrics.totalComputeUnits));
    text('added-compute', units(metrics.addedComputeUnits));
    text('slot-compute', '0 units (fixture rule, not native measurement)');
    text('production-headroom', units(metrics.productionHeadroom));
    text('candidate-headroom', run.config.topology === 'shared' ? 'N/A — no separate candidate plan' : units(metrics.candidateHeadroom));
    text('dependency-headroom', units(metrics.dependencyHeadroom));
    text('candidate-ready', `${run.warming.ready} / ${run.warming.attempted}; not ready ${run.warming.notReady}; unknown ${run.warming.unknown}`);
    text('journey-counts', `${run.production.successful} / ${run.production.interrupted} / ${run.production.unknown}`);
    text('transitions', '0 attempted / 0 successful');
    text('transition-rate', 'Unknown — empty transition sample, not 100% success');
    rows('gates', Object.entries(run.gates));
    rows('production-trace', run.productionTrace.map((row) => [row.journey, duration(row.latencyMs), duration(row.budgetMs), row.outcome]));
    rows('warm-trace', run.warmTrace.map((row) => [row.slot, duration(row.latencyMs), duration(row.budgetMs), row.readiness]));
    get('phase-trace').replaceChildren(...run.phaseTrace.map((event) => {
      const item = document.createElement('li');
      item.textContent = `${event.phase}: ${event.detail}`;
      return item;
    }));
  }

  function renderHistory() {
    const totals = model.totals(state);
    text('total-runs', `${totals.runs} / ${model.MAX_RUNS}`);
    for (const [id, key] of Object.entries({
      'total-attempted': 'attempted', 'total-success': 'successful', 'total-interrupted': 'interrupted',
      'total-unknown': 'unknown', 'total-transitions': 'successfulTransitions',
    })) text(id, totals[key]);
    get('history').replaceChildren(...state.history.map((run) => {
      const item = document.createElement('li');
      item.dataset.verdict = run.verdict;
      const summary = document.createElement('p');
      summary.textContent = `Run ${run.sequence}: ${run.verdict}; ${run.config.topology} plan; production workers ${run.config.productionWorkers}, separate candidate workers ${run.config.topology === 'separate' ? run.config.candidateWorkers : 0}, slots ${run.config.slots}. Observed compute ${units(run.metrics.totalComputeUnits)}, added ${units(run.metrics.addedComputeUnits)}. Production/dependency headroom ${units(run.metrics.productionHeadroom)} / ${units(run.metrics.dependencyHeadroom)}. Budgets production/warm-up ${run.config.journeyBudgetMs}/${run.config.warmupBudgetMs} ms. Production successful/interrupted/unknown ${run.production.successful}/${run.production.interrupted}/${run.production.unknown}. No user transitions.`;
      const detail = document.createElement('details');
      const label = document.createElement('summary');
      label.textContent = 'Inspect retained configuration, gates and synthetic trace';
      const trace = document.createElement('pre');
      trace.textContent = JSON.stringify(run, null, 2);
      detail.append(label, trace);
      item.append(summary, detail);
      return item;
    }));
  }

  function render() {
    renderCurrent();
    renderHistory();
    const exhausted = state.history.length >= model.MAX_RUNS;
    get('warm-run').disabled = state.phase !== 'ready' || exhausted;
    text('status', exhausted ? 'Six-run session limit reached. All evidence is retained; reload for a new lesson.'
      : state.phase === 'measured' ? `Run ${state.current.sequence} retained. Reset the current rehearsal to conduct another.`
        : `Ready to warm. ${state.history.length} of six runs retained; no observations for the current rehearsal.`);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    try {
      state = model.warm(state, configuration());
      render();
    } catch (error) {
      showError(error);
    }
  });

  get('reset-rehearsal').addEventListener('click', () => {
    state = model.reset(state);
    HTMLFormElement.prototype.reset.call(form);
    clearError();
    render();
    get('topology').focus();
  });

  render();
}());
