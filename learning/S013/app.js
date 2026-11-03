(function () {
  'use strict';
  const model = globalThis.QueueScaleRehearsal;
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
    byId('enqueue-batch').disabled = value;
    byId('advance-window').disabled = value;
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
      schemaVersion: 1, cardId: 'A-S013', kano: 'S', kanoUnit: 'A-S013', packet: 'SC-S013',
      mode: 'synthetic-only', runNumber, uiError, effectiveVerdict: 'ERROR', state, archives,
      nativeProof: false, productionNode24Validated: false, parentComplete: false
    }, null, 2));
  }

  if (!model) {
    fatal(new Error('The local workload model did not load'));
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
    const { verdict, message } = summary.verification;
    text('verdict', verdict);
    byId('verdict').dataset.verdict = verdict;
    text('verdict-detail', message);
    text('command-result', `${state.lastResult.verdict}: ${state.lastResult.message}`);
    const alarm = ['INVALID', 'UNSUPPORTED', 'UNKNOWN', 'PROVISION_FAILED', 'LIMIT'].includes(state.lastResult.verdict);
    byId('input-error').hidden = !alarm;
    text('input-error', alarm ? `${state.lastResult.verdict}: ${state.lastResult.message}` : '');
    text('clock-value', `${state.clockSeconds} seconds`);
    text('requested-value', summary.capacity.requested);
    text('ready-value', known(summary.capacity.effectiveReady));
    const last = state.windows.at(-1);
    text('metric-value', last
      ? `${last.metric}: ${known(last.metricValue)} / ${last.threshold} at ${last.atSeconds}s`
      : 'NOT_OBSERVED');
    text('rule-decision', summary.rule.lastDecision);
    text('work-verdict', summary.work.verdict);
    text('capacity-detail', `Metric support: ${summary.rule.support} (teaching fixture only). Last-confirmed ready ${summary.capacity.lastConfirmedReady} (historical when current capacity is unknown); warming ${summary.capacity.warming}; ready transitions ${summary.capacity.readyTransitions}; failed transitions ${summary.capacity.failedTransitions}; unknown metric/capacity windows ${summary.rule.unknownWindows}.`);
    const work = summary.work;
    text('work-counts', `Submitted ${work.submitted}; modeled queued ${work.queued}; known completed ${work.completed}; on time ${work.onTime}; late ${work.late}; failed ${work.failed}; unknown ${work.unknown}; queued past original deadline ${work.pendingOverdue}; added-worker completions ${work.addedWorkerCompletions}. No success rate is inferred from zero or incomplete samples.`);
    text('history-counts', `Retained events ${summary.history.events}; windows ${summary.history.windows}; batches ${summary.history.batches}; invalid commands ${summary.history.invalid}.`);
    byId('window-rows').replaceChildren(...state.windows.map((entry) => row([
      `${entry.id} / ${entry.atSeconds}s`,
      `${known(entry.queueDepth)} / ${known(entry.concurrencyPerReady)}`,
      `${entry.metric}: ${known(entry.metricValue)} / ${entry.threshold}`,
      `${entry.requested} / ${known(entry.readyObserved)}`,
      `${entry.completed} / ${entry.failed} / ${entry.unknown} / ${known(entry.queueAfter)}`,
      `${entry.decision}: ${entry.message}`
    ])));
    byId('transition-rows').replaceChildren(...state.transitions.map((entry) => row([
      `${entry.id} / ${entry.metric}: ${entry.metricValue} ≥ ${entry.threshold}`,
      `${entry.from} → ${entry.to}`,
      `${entry.requestedAt}s / ${entry.readyAt === null ? 'not observed' : `${entry.readyAt}s`} / ${entry.failedAt === null ? 'none' : `${entry.failedAt}s`}`,
      entry.status
    ])));
    byId('work-rows').replaceChildren(...state.jobs.map((entry) => row([
      `${entry.id} / ${entry.batchId}`, `${entry.submittedAt}s / ${entry.deadlineAt}s`,
      `${known(entry.completedAt)} / ${known(entry.observedAt)}s`,
      known(entry.worker), `${entry.status}${entry.reason ? `: ${entry.reason}` : ''}`
    ])));
    text('archive-title', `Retained prior runs (${archives.length})`);
    byId('archive-list').replaceChildren(...archives.map((entry) => {
      const element = document.createElement('li');
      const workHistory = entry.summary?.work;
      element.textContent = `Run ${entry.runNumber}: ${entry.uiError ? 'ERROR' : entry.summary.verification.verdict}; ${entry.state.windows.length} windows, ${workHistory?.submitted || 0} items, ${workHistory?.late || 0} late, ${workHistory?.failed || 0} failed, ${workHistory?.unknown || 0} unknown. Full snapshot retained below.`;
      return element;
    }));
    text('run-evidence', JSON.stringify({
      schemaVersion: 1, cardId: 'A-S013', kano: 'S', kanoUnit: 'A-S013', packet: 'SC-S013',
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
      type: 'configure', batchSize: byId('batch-size').value,
      activeRequests: byId('active-requests').value, deadlineSeconds: byId('deadline-seconds').value,
      metric: byId('workload-metric').value, fault: byId('observation-condition').value
    });
  });
  byId('enqueue-batch').addEventListener('click', () => conduct({ type: 'enqueue' }));
  byId('advance-window').addEventListener('click', () => conduct({ type: 'tick' }));
  byId('restart-rehearsal').addEventListener('click', () => {
    try {
      if (state.events.length || uiError) {
        if (archives.length >= model.LIMITS.archives) {
          fatal(new Error('Archive limit reached; copy the retained JSON and reload. No archived run was deleted'));
          return;
        }
        let summary = null;
        try { summary = model.summarize(state); } catch {}
        archives.push(JSON.parse(JSON.stringify({ runNumber, state, summary, uiError })));
      }
      form.reset();
      state = model.initial();
      runNumber += 1;
      uiError = null;
      lock(false);
      render();
      text('command-result', 'Reset complete. Previous observations and errors are archived; default inputs and two ready workers restored.');
    } catch (error) {
      fatal(error);
    }
  });
  try { render(); } catch (error) { fatal(error); }
}());
