'use strict';

(function start() {
  const byId = (id) => document.getElementById(id);
  const data = globalThis.S144Data;
  const core = globalThis.S144Lesson;
  const errorBox = byId('error');
  let state;

  function showError(error) {
    errorBox.textContent = `Rehearsal action rejected: ${error.message}`;
    errorBox.hidden = false;
    errorBox.focus();
  }

  function display(value) {
    return value === null ? 'unobserved' : String(value);
  }

  function table(id, rows) {
    const elements = rows.map((cells) => {
      const row = document.createElement('tr');
      cells.forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      });
      return row;
    });
    byId(id).replaceChildren(...elements);
  }

  function render() {
    const inspected = state.phase === 'inspected' || state.phase === 'measured';
    const report = state.history.find((entry) => entry.runId === state.run?.id)?.report;
    byId('phase').textContent = state.run
      ? `${state.phase} · ${state.run.id} · ${state.run.profile} · revision ${state.revision}`
      : `idle · revision ${state.revision}`;
    byId('profile').disabled = state.phase !== 'idle';
    byId('conduct').disabled = state.phase !== 'idle';
    byId('inspect').disabled = state.phase !== 'conducted';
    byId('measure').disabled = state.phase !== 'inspected';
    byId('probe').disabled = state.phase !== 'measured' || Boolean(state.probe);
    byId('mitigate').disabled = state.phase !== 'measured' || state.history.length !== 1 || report?.verdict === 'pass';
    byId('identify').disabled = state.phase !== 'measured';
    byId('trace').hidden = !inspected;
    byId('measurement').hidden = !report;
    byId('history').hidden = !state.history.length;
    byId('probe-result').hidden = !state.probe;
    byId('probe-result').textContent = state.probe
      ? 'Unrelated probe: HTTP 200, ready true, window unrelated-probe. It establishes neither the shared bottleneck/cause nor original completion; measurements and history are unchanged.'
      : '';
    byId('feedback').textContent = state.feedback
      ? `${state.feedback.correct ? 'Correct' : 'Not supported'}: ${state.feedback.explanation}` : '';

    if (inspected) {
      const input = data.profiles[state.run.profile];
      byId('trace-window').textContent = `Fictional profile ${input.id}; all joined tier, resource and queue records use ${input.windowId}, ${input.windowMs} ms.`;
      table('isolated-rows', input.isolated.map((row) => [
        row.tier, `${display(row.latencyMs)} / ${row.budgetMs}`, `${display(row.http)} / ${display(row.ready)}`,
      ]));
      table('tier-rows', input.tiers.map((row) => [
        row.tier, row.windowId, display(row.concurrency), display(row.latencyMs), display(row.requestsPerSecond),
      ]));
      table('contributor-rows', input.contributors.map((row) => [
        row.id, row.tier, row.windowId, display(row.connections),
      ]));
      byId('queue-input').textContent = `Fictional queue ${input.queue.windowId}: depth ${display(input.queue.depth)}, worker wait ${display(input.queue.workerWaitMs)} ms.`;
      byId('raw-input').textContent = JSON.stringify(input, null, 2);
      byId('raw-output').textContent = report ? JSON.stringify(report, null, 2)
        : 'Not yet measured. Isolated success is not combined acceptance.';
    } else {
      for (const id of ['isolated-rows', 'tier-rows', 'contributor-rows']) byId(id).replaceChildren();
      byId('raw-input').textContent = '';
      byId('raw-output').textContent = '';
      byId('queue-input').textContent = '';
      byId('trace-window').textContent = '';
    }

    if (report) {
      const shared = report.shared;
      byId('current-verdict').textContent = `Current fictional combined window: ${report.verdict.toUpperCase()}.`;
      byId('current-verdict').className = `verdict ${report.verdict}`;
      byId('resource-result').textContent = `database-connections: ${display(shared.observedConnections)} / ${shared.budget}; ${shared.status}. Known demand lower bound: ${shared.knownLowerBound}. Sum only the unique same-window contributors.`;
      byId('queue-result').textContent = `Queue depth ${display(report.downstream.queueDepth.observed)} / 4: ${report.downstream.queueDepth.status}. Worker wait ${display(report.downstream.workerWaitMs.observed)} / 400 ms: ${report.downstream.workerWaitMs.status}.`;
      const rate = report.throughput;
      byId('throughput-result').textContent = `Observed successful affected journeys: ${rate.successfulJourneys} / minimum ${rate.minimumPerWindow} per ${rate.windowMs} ms; known rate lower bound ${rate.knownLowerBoundPerSecond} / s; ${rate.status}. With unknowns, at most ${rate.possibleSuccessfulJourneys} could succeed. ${report.diagnostics.requestCount} requests, HTTP ${report.diagnostics.http}, readiness and average ${report.diagnostics.averageMs} ms are not continuity evidence.`;
      byId('bottleneck-result').textContent = `Observed bottleneck: ${report.bottleneck.observedResource ?? 'unobserved (or no breach in this complete window)'}. Physical root cause: unobserved. Recorded database waits: ${report.bottleneck.observedWaitJourneyIds.join(', ') || 'none observed'}. Unresolved completion: ${report.bottleneck.unresolvedJourneyIds.join(', ') || 'none in this window'}. Correlation does not prove a physical cause.`;
      table('journey-rows', report.journeys.map((row) => [
        row.id, `${display(row.elapsedMs)} / ${display(row.completedMs)} / ${row.budgetMs}`,
        `State ${display(row.stateCorrect)}; effects ${display(row.effectCount)} / ${row.expectedEffects}; ${Object.entries(row.versions).map(([tier, version]) => `${tier}:${display(version)}`).join(', ')}`,
        row.outcome, `Failures: ${row.failures.join(', ') || 'none observed'}; missing: ${row.missing.join(', ') || 'none'}`,
      ]));
    } else {
      for (const id of ['current-verdict', 'resource-result', 'queue-result', 'throughput-result', 'bottleneck-result']) {
        byId(id).textContent = '';
      }
      byId('journey-rows').replaceChildren();
    }

    const history = core.summarizeHistory(state.history);
    byId('history-summary').textContent = `${history.windows} measured windows: ${history.attempted} attempted; ${history.successful} successful; ${history.interrupted} interrupted; ${history.unknown} unknown. Retained verdict: ${history.verdict}.`;
    byId('history-list').replaceChildren(...state.history.map((entry) => {
      const item = document.createElement('li');
      item.textContent = `${entry.runId}, ${entry.report.windowId}: ${entry.report.verdict}; ${entry.report.journeys.map((row) => `${row.id} ${row.outcome}`).join('; ')}.`;
      return item;
    }));
    byId('retained-original').textContent = `Retained interrupted journeys: ${history.retainedInterruptedIds.join(', ') || 'none observed'}. Retained unknown journeys: ${history.retainedUnknownIds.join(', ') || 'none recorded'}. Fresh windows do not rewrite them.`;
  }

  function dispatch(type, extra = {}) {
    try {
      const command = {
        type, expectedRevision: state.revision,
        ...(!['conduct', 'reset'].includes(type) ? { runId: state.run?.id } : {}), ...extra,
      };
      state = core.transition(state, command);
      errorBox.hidden = true;
      errorBox.textContent = '';
      render();
      byId('notice').textContent = {
        conduct: 'Fixed fictional window conducted. Inspect the five tiers and shared records next.',
        inspect: 'Joined fixed records inspected. Measure the original declared budgets next.',
        measure: 'Combined fixed-data result measured. Inspect client failures and unknowns before identifying the bottleneck.',
        probe: 'Unrelated successful probe inspected. No journey or cause has been resolved.',
        mitigate: 'Fresh fixed mitigation window conducted. Prior measurements are retained; inspect and measure this new window.',
        identify: 'Evidence-based conclusion checked. The physical root cause remains unobserved.',
        reset: 'Explicit reset cleared this rehearsal history; stale commands remain rejected.',
      }[type];
      if (type === 'reset') {
        byId('profile').value = '';
        byId('bottleneck-choice').value = '';
        byId('profile').focus();
      } else if (type === 'conduct' || type === 'mitigate') {
        byId('bottleneck-choice').value = '';
      }
    } catch (error) {
      showError(error);
    }
  }

  try {
    if (!data || !core) throw new Error('Local teaching scripts are unavailable. Reopen the complete lesson bundle.');
    state = core.createState();
    byId('conduct-form').addEventListener('submit', (event) => {
      event.preventDefault();
      dispatch('conduct', { profile: byId('profile').value });
    });
    for (const action of ['inspect', 'measure', 'probe', 'mitigate']) {
      byId(action).addEventListener('click', () => dispatch(action));
    }
    byId('identify').addEventListener('click', () => dispatch('identify', { choice: byId('bottleneck-choice').value }));
    byId('start-again').addEventListener('click', () => dispatch('reset'));
    render();
  } catch (error) {
    document.querySelectorAll('button, select').forEach((element) => { element.disabled = true; });
    showError(error);
  }
}());
