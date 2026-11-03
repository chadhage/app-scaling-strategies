'use strict';

(function () {
  const model = window.S017Model;
  const byId = (id) => document.getElementById(id);
  const form = byId('rehearsal-controls');
  const archives = [];
  let state = model.initial();
  let runNumber = 1;
  let runtimeError = null;
  let lastSummary = model.summarize(state);
  let archiveLimitRefused = false;
  const conductingIds = ['demand', 'apply-demand', 'start-in-place', 'prepare-replacement',
    'observation', 'advance-window', 'handoff-replacement'];
  const display = (value) => value === null ? 'UNKNOWN' : String(value);

  function exportRun(summary) {
    return {
      schemaVersion: 1, cardId: 'A-S017', kano: 'S', kanoUnit: 'A-S017',
      packet: 'SC-S017', parent: 'D-S017', source: 'S017', mode: 'synthetic-only',
      banner: model.constants.banner, runNumber, state, summary, archives,
      uiError: runtimeError, summaryIsLastKnown: Boolean(runtimeError), archiveLimitRefused,
      effectiveVerdict: runtimeError ? 'ERROR' : summary.verification,
      nativeProof: false, parentComplete: false, productionNode24Validated: false,
      cleanup: 'No cloud resources; old parallel deployment modeled as retained and charged.'
    };
  }
  function row(target, values) {
    const tr = document.createElement('tr');
    for (const value of values) {
      const td = document.createElement('td');
      td.textContent = display(value);
      tr.append(td);
    }
    target.append(tr);
  }
  function render() {
    const summary = model.summarize(state);
    lastSummary = summary;
    byId('verification').textContent = runtimeError ? 'ERROR' : summary.verification;
    byId('phase-route').textContent = `${state.phase} / ${state.route}`;
    byId('capacity').textContent = `${summary.requestedTargetCapacity} / ${display(summary.observedReadyCapacity)}`;
    byId('serving-capacity').textContent = display(summary.effectiveServingCapacity);
    byId('impact').textContent = summary.userImpact;
    byId('journeys').textContent = `${summary.attempted} / ${summary.successful} / ${summary.interrupted} / ${summary.unknown}`;
    byId('time-cost').textContent = `${summary.elapsedSeconds}s / ${summary.costCredits} credits`;
    byId('command-notice').textContent = runtimeError ? `ERROR: ${runtimeError.message}. Conducting stopped; archive/reset to recover.`
      : archiveLimitRefused ? 'Archive limit reached. Copy the JSON before reloading; earlier proof was not discarded.'
        : state.lastRejection?.message || (state.locked ? 'Command limit reached; archive/reset preserves this run.' : 'Ready for keyboard or pointer conducting.');
    const blocked = Boolean(runtimeError) || state.locked;
    const active = state.strategy !== null;
    for (const id of ['demand', 'apply-demand', 'start-in-place', 'prepare-replacement']) byId(id).disabled = blocked || active;
    byId('advance-window').disabled = blocked || !active || ['ABORTED', 'FAILED'].includes(state.phase);
    byId('observation').disabled = blocked || ['ABORTED', 'FAILED'].includes(state.phase);
    byId('handoff-replacement').disabled = blocked || state.phase !== 'READY';
    byId('reset-rehearsal').disabled = archives.length >= 4;
    byId('archive-notice').textContent = archives.length >= 4
      ? 'Four archives retained: copy JSON and reload to begin a new history. Reset cannot silently discard proof.'
      : `${archives.length}/4 archives retained in page memory. Copy JSON before reload or close. Limits: 12 windows and 40 commands/run.`;
    const trace = byId('window-trace');
    trace.replaceChildren();
    for (const window of state.windows) row(trace, [
      `${window.atSeconds}s`, window.observation, window.route, window.servingCapacity,
      window.candidateReadyAtEnd, `${window.successful} / ${window.interrupted} / ${window.unknown}`, window.costCredits
    ]);
    const comparison = byId('comparison-history');
    comparison.replaceChildren();
    for (const run of [...archives, { runNumber, state, summary, uiError: runtimeError }]) {
      if (!run.state.events.length && !run.uiError) continue;
      row(comparison, [
        run.runNumber, run.state.strategy || 'not started', run.state.demand, run.summary.windows,
        `${run.summary.successful} / ${run.summary.interrupted} / ${run.summary.unknown}`,
        run.summary.costCredits, run.uiError ? 'ERROR' : run.summary.verification
      ]);
    }
    byId('run-evidence').textContent = JSON.stringify(exportRun(summary), null, 2);
  }
  function fatal(error) {
    runtimeError = {
      message: String(error?.message || 'Unexpected application failure').slice(0, 240),
      afterCommand: state.events.length, atWindow: state.windows.length
    };
    for (const id of conductingIds) byId(id).disabled = true;
    byId('verification').textContent = 'ERROR';
    byId('command-notice').textContent = `ERROR: ${runtimeError.message}. Conducting stopped; archive/reset to recover.`;
    if (state.events.length) {
      const currentVerdict = byId('comparison-history').lastElementChild?.lastElementChild;
      if (currentVerdict) currentVerdict.textContent = 'ERROR';
    }
    byId('run-evidence').textContent = JSON.stringify(exportRun(lastSummary), null, 2);
  }
  function conduct(command) {
    if (runtimeError) return false;
    try {
      state = model.reduce(state, command);
      render();
      return !state.lastRejection && !state.locked;
    } catch (error) {
      fatal(error);
      return false;
    }
  }
  function start(type) {
    if (conduct({ type: 'configure', demand: byId('demand').value })) conduct({ type });
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    conduct({ type: 'configure', demand: byId('demand').value });
  });
  byId('start-in-place').addEventListener('click', () => start('in-place'));
  byId('prepare-replacement').addEventListener('click', () => start('prepare'));
  byId('advance-window').addEventListener('click', () => conduct({ type: 'tick', observation: byId('observation').value }));
  byId('handoff-replacement').addEventListener('click', () => conduct({ type: 'handoff' }));
  byId('reset-rehearsal').addEventListener('click', () => {
    try {
      if (archives.length >= 4) {
        archiveLimitRefused = true;
        render();
        return;
      }
      if (state.events.length || runtimeError) {
        archives.push({ runNumber, state, summary: lastSummary, uiError: runtimeError,
          effectiveVerdict: runtimeError ? 'ERROR' : lastSummary.verification });
        runNumber += 1;
      }
      HTMLFormElement.prototype.reset.call(form);
      state = model.initial();
      runtimeError = null;
      archiveLimitRefused = false;
      render();
      byId('demand').focus();
    } catch (error) {
      fatal(error);
    }
  });
  window.addEventListener('error', (event) => fatal(event.error || new Error(event.message)));
  window.addEventListener('unhandledrejection', (event) => fatal(event.reason));
  try { render(); } catch (error) { fatal(error); }
}());
