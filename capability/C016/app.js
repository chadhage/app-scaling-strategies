(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const elements = Object.fromEntries(['journey', 'scope', 'conduct', 'retry', 'inspect', 'reset',
    'status', 'errors', 'impact', 'history', 'result'].map((id) => [id, byId(id)]));
  const api = globalThis.C016Journal;
  const data = globalThis.C016Observations;
  const guard = globalThis.C001ContractGuard;
  const approval = globalThis.C001ApprovedContract;
  let journal;
  let busy = false;

  function selected() {
    const value = data.cases.find((item) => item.id === elements.journey.value);
    if (!value) throw new Error('UNKNOWN_REPLAY_CASE: Only the five declared historical cases are supported.');
    return value;
  }
  function controls() {
    const known = data?.cases.find((item) => item.id === elements.journey.value);
    const next = known?.entries[journal?.entries.length || 0];
    const previous = journal?.entries.at(-1)?.result;
    elements.conduct.disabled = busy || !next;
    elements.inspect.disabled = busy || !journal?.entries.length;
    elements.retry.disabled = busy || !next || !previous ||
      next.result.commandId !== previous.commandId || previous.allowedRecovery === 'operator-review-no-marker-reclamation';
  }
  function impact() {
    elements.impact.textContent = `Original user impact: ${journal.originalUserImpact}; latest recorded outcome: ${journal.latestOutcome}. ` +
      `Original unknown attempts remain: ${journal.unknownAttempts.join(', ') || 'none'}. Verifier success is separate from user outcome.`;
  }
  function clear(message, focus = false) {
    journal = api.replay([]);
    elements.history.replaceChildren();
    elements.result.textContent = 'No recorded attempt selected.';
    elements.errors.textContent = '';
    elements.status.textContent = message;
    impact();
    controls();
    if (focus) elements.journey.focus();
  }
  function showHistory() {
    elements.history.replaceChildren(...journal.entries.map((entry) => {
      const item = document.createElement('li');
      item.textContent = `Attempt ${entry.attempt}: ${entry.result.outcome} — ${entry.result.code}; ` +
        `received stdout exit ${entry.process.exitCode}; recovery: ${entry.result.allowedRecovery}.`;
      return item;
    }));
    impact();
  }
  async function permit() {
    const comparison = await guard.guardOperation(elements.scope.value, approval.approval);
    if (!comparison.allowed) throw new Error(comparison.reasons.map((reason) => `${reason.code}: ${reason.message}`).join('; '));
  }
  async function action(operation) {
    if (busy) return;
    busy = true;
    controls();
    try {
      await permit();
      await operation();
    } catch (error) {
      elements.errors.textContent = error.message;
      elements.status.textContent = 'Replay rejected or unavailable; no disk operation or implicit recovery occurred.';
    } finally {
      busy = false;
      controls();
    }
  }
  function conduct(identicalOnly) {
    return action(() => {
      const next = selected().entries[journal.entries.length];
      if (!next) throw new Error('REPLAY_COMPLETE: No new command or process is invented after the captured case.');
      const previous = journal.entries.at(-1)?.result;
      if (identicalOnly && (!previous || next.result.commandId !== previous.commandId ||
          previous.allowedRecovery === 'operator-review-no-marker-reclamation')) {
        throw new Error('RETRY_NOT_ALLOWED: No captured matching retry or operator-reviewed recovery is available.');
      }
      journal = api.append(journal, next);
      showHistory();
      elements.result.textContent = JSON.stringify(journal, null, 2);
      elements.errors.textContent = next.result.errors.map((error) => `${error.code}: ${error.message}`).join('; ');
      elements.status.textContent = `Recorded ${next.result.outcome} — ${next.result.code}. ` +
        `Last positively recorded epoch: ${journal.observedEpoch ?? 'unconfirmed'}. This click is not a disk operation or fresh process.`;
    });
  }
  elements.reset.addEventListener('click', () => {
    if (api) clear('Display reset only; no files, markers, original evidence or consent changed.', true);
  });
  if (!api || !data || !guard || !approval) {
    elements.status.textContent = 'DEPENDENCY_UNAVAILABLE: Historical replay is disabled; no filesystem or consent fallback.';
    elements.errors.textContent = 'Required accepted contract or owned observation bundle is unavailable.';
    return;
  }
  try {
    if (data.schemaVersion !== 1 || data.cardId !== 'C016' ||
        data.kind !== 'actual-fresh-node-local-command-observations' || data.cases.length !== 5) {
      throw new Error('OBSERVATION_SCOPE: Unknown historical observation bundle.');
    }
    for (const item of data.cases) api.replay(item.entries);
    clear('Ready for bounded historical replay. No current consent or disk state is inferred.');
    elements.journey.addEventListener('change', () => {
      clear('Selection changed; stale display cleared, original evidence unchanged.');
      try { selected(); } catch (error) {
        elements.errors.textContent = error.message;
        elements.status.textContent = 'Unknown replay case rejected; no disk operation or fallback.';
      }
    });
    elements.scope.addEventListener('change', () => clear('Authority comparison changed; stale display cleared, no write is authorized.'));
    elements.conduct.addEventListener('click', () => conduct(false));
    elements.retry.addEventListener('click', () => conduct(true));
    elements.inspect.addEventListener('click', () => action(() => {
      journal = api.replay(journal.entries);
      elements.result.textContent = JSON.stringify({ source: 'bundled historical observations', filesystemOperationNow: false,
        retainedHistoricalFileCount: selected().actualEpochFiles, historicalScratchCleaned: selected().exactOwnedScratchCleaned,
        journal }, null, 2);
      elements.status.textContent = 'Guarded journal inspected; historical file count is captured evidence, not a live read or browser counter.';
    }));
  } catch (error) {
    elements.status.textContent = 'Historical replay failed closed; no disk operation.';
    elements.errors.textContent = error.message;
    elements.conduct.disabled = elements.retry.disabled = elements.inspect.disabled = true;
  }
}());
