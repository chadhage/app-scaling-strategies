(function () {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const entries = [];
  let gate;
  let busy = false;
  function buttons() {
    for (const id of ['load', 'inspect', 'attach']) byId(id).disabled = busy || !gate || entries.length >= 16;
    byId('reset').disabled = busy;
    if (entries.length >= 16) byId('history-limit').textContent = 'History limit reached: further operations are refused, not dropped. Reset cannot erase history or replay protection.';
  }
  function renderContext() {
    const state = gate.snapshot();
    byId('metric').textContent = String(state.metrics.currentAttributedTierRecords);
    byId('native-metric').textContent = String(state.metrics.nativeAuthenticatedRecords);
    const context = state.currentExpectedContext;
    byId('context').textContent = context ? JSON.stringify({
      contextOrigin: context.contextOrigin, readStartedAtUtc: context.readStartedAtUtc,
      readCompletedAtUtc: context.readCompletedAtUtc, fixtureNamespace: context.fixtureNamespace,
      runId: context.runId, epoch: context.epoch, epochVersion: context.epochVersion, record: context.record,
      stateSha256: context.stateSha256, explicitlyFictional: {
        leaseId: context.leaseId, userId: context.userId, contextId: context.contextId,
        attemptId: context.attemptId, requestId: context.requestId
      }, association: context.association, fictionalObservationClock: context.fictionalObservationClock
    }, null, 2) : 'UNVERIFIED: current owner context unavailable; no previous-state fallback.';
  }
  function history(operation, outcome, code) {
    entries.push({ operation, outcome, code });
    const item = document.createElement('li');
    item.dataset.outcome = outcome;
    item.textContent = `${entries.length}. ${operation}: ${outcome} - ${code}`;
    byId('history').appendChild(item);
    buttons();
  }
  function display(result) {
    byId('status').dataset.outcome = result.outcome;
    byId('status').textContent = {
      'fixture-verified': 'FIXTURE VERIFIED: explicitly closed fictional scope only. Not attached; no native/authenticated correlation.',
      attached: 'ATTACHED: exactly three fictional tier records passed the private local guard. No native/authenticated identity or lease.',
      held: 'UNVERIFIED / HOLD: required correlation or complete observation is absent. Attachment blocked.',
      rejected: 'REJECTED: attribution blocked before the private attachment transition.'
    }[result.outcome] || 'UNVERIFIED: no attribution.';
    byId('error').textContent = result.outcome === 'rejected' ? result.code : '';
    byId('missing').textContent = result.missing ? `Unobserved, never inferred: ${result.missing.join(', ')}` : '';
    byId('fixture-status').textContent = result.fixtureScopeVerified ?
      'Fixture scope: VERIFIED - explicit fictional scope only' : 'Fixture scope: NOT VERIFIED for this candidate';
    byId('originals').replaceChildren();
    byId('replacement').textContent = '';
    byId('source').textContent = '';
    if (result.historical) {
      for (const attempt of result.historical.attempts) {
        const item = document.createElement('li');
        item.dataset.classification = attempt.classification;
        item.dataset.attempt = attempt.attemptId;
        item.textContent = `${attempt.attemptId}: ${attempt.classification}; saved requests ${attempt.requests}, saved replies ${attempt.responses}; current attributed records 0`;
        byId('originals').appendChild(item);
      }
      byId('replacement').textContent = result.historical.replacement;
      byId('source').textContent = JSON.stringify({
        source: result.historical.source, association: result.historical.association,
        originalRecordsAttributed: result.historical.originalRecordsAttributed
      }, null, 2);
    }
    renderContext();
  }
  async function operate(operation, action) {
    if (busy || !gate || entries.length >= 16) return;
    busy = true;
    buttons();
    try {
      const result = await action();
      display(result);
      history(operation, result.outcome, result.code);
    } catch (error) {
      const result = { outcome: 'rejected', code: error.code || 'INSPECTION_ERROR', fixtureScopeVerified: false };
      display(result);
      history(operation, result.outcome, result.code);
    } finally { busy = false; buttons(); }
  }
  byId('load').addEventListener('click', () => {
    if (busy || !gate || entries.length >= 16) return;
    try {
      byId('candidate').value = JSON.stringify(gate.getEvidence(byId('evidence').value), null, 2);
      byId('status').dataset.outcome = 'loaded';
      byId('status').textContent = 'JSON copy loaded, not inspected or eligible. Expected context remains fixture-owned.';
      byId('error').textContent = '';
      byId('missing').textContent = '';
      byId('fixture-status').textContent = 'Fixture scope: NOT VERIFIED for this newly loaded candidate';
    } catch (error) {
      display({ outcome: 'rejected', code: error.code || 'UNKNOWN_EVIDENCE_ID', fixtureScopeVerified: false });
      history('load', 'rejected', error.code || 'UNKNOWN_EVIDENCE_ID');
    }
  });
  byId('inspect').addEventListener('click', () => operate('inspect/correlate', () => gate.inspectText(byId('candidate').value)));
  byId('attach').addEventListener('click', () => operate('attach', () => gate.attachText(byId('candidate').value)));
  byId('reset').addEventListener('click', () => {
    if (busy || !gate) return;
    byId('evidence').value = '';
    byId('candidate').value = '';
    byId('error').textContent = '';
    byId('missing').textContent = '';
    byId('originals').replaceChildren();
    byId('source').textContent = '';
    byId('replacement').textContent = '';
    byId('status').dataset.outcome = 'reset';
    byId('status').textContent = 'Display reset only. Attribution, negative history and replay guards retained.';
    byId('fixture-status').textContent = 'Fixture scope: NOT VERIFIED for a new candidate';
    renderContext();
    byId('evidence').focus();
    buttons();
  });
  buttons();
  globalThis.C036Attribution.open().then((session) => {
    gate = session;
    renderContext();
    buttons();
  }).catch((error) => {
    byId('status').dataset.outcome = 'rejected';
    byId('status').textContent = 'UNVERIFIED: captured owner context is unavailable. No attribution.';
    byId('error').textContent = error.code || 'OWNER_CONTEXT_UNAVAILABLE';
    buttons();
  });
}());
