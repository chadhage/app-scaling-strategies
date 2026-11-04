(function () {
  'use strict';
  const classifier = globalThis.C035Classifier;
  const session = classifier.createSession();
  const byId = (id) => document.getElementById(id);
  let busy = false;
  function show(state) {
    const latest = state.latest;
    byId('state').textContent = JSON.stringify(state, null, 2);
    byId('retained').textContent = `Retained decision: ${state.retainedDecision}; ${state.retainedEntries}/${state.maximumEntries} inspection/error entries. Reset never erases earlier UNKNOWN/HOLD or FAIL.`;
    byId('inspection-history').replaceChildren(...state.history.map((entry) => {
      const item = document.createElement('li');
      item.textContent = `${entry.entry}. ${entry.operation}; ${entry.selectedSource ?? 'no adopted source'}; ${entry.result.decision}; ${entry.result.valid ? 'classified' : `REJECTED ${entry.result.code}`}; originals ${entry.result.counts.originals}, PASS ${entry.result.counts.pass}, FAIL ${entry.result.counts.fail}, HOLD ${entry.result.counts.hold}.`;
      return item;
    }));
    byId('history-limit').textContent = state.overflowRefused ?
      'HISTORY_LIMIT_RETAINED: further classifications/errors refused, not dropped. Reset cannot free retained history.' : '';
    byId('error').textContent = state.error || (latest?.valid === false ? latest.code : '');
    byId('status').dataset.outcome = state.error || latest?.valid === false ? 'rejected' : latest ? 'classified' : 'unassessed';
    byId('status').textContent = state.error ? `${state.error}; retained evidence unchanged.` : latest ?
      `${latest.valid ? 'Classified' : 'Protectively rejected'}: ${latest.decision}. Not actual user mutation success.` :
      'Presentation reset or not inspected. Stored work unchanged; retained history remains.';
    byId('originals').replaceChildren();
    byId('comparison').textContent = '';
    byId('result').textContent = latest ? JSON.stringify(latest, null, 2) : '';
    byId('counts').textContent = latest ?
      `${latest.counts.originals} scoped originals = ${latest.counts.pass} PASS + ${latest.counts.fail} FAIL + ${latest.counts.hold} HOLD. Not healthy response counts or complete user journeys.` :
      'No current presentation denominator. Earlier originals remain in retained history.';
    byId('dimension-counts').textContent = latest ?
      `${latest.dimensionCounts.required} required original dimensions. ${JSON.stringify(latest.dimensionCounts.byDimension)}` :
      'Six required dimensions per original: context, schema, timing, state, terminal and provenance.';
    byId('scope').textContent = latest ? latest.scope || latest.boundary : 'No evidence selected for current presentation.';
    if (!latest) return;
    if (latest.schema === 'C035-comparison/1') byId('comparison').textContent = JSON.stringify({
      boundary: latest.boundary, denominatorMeaning: latest.denominatorMeaning,
      before: { decision: latest.before.decision, counts: latest.before.counts, originals: latest.before.originals },
      after: { decision: latest.after.decision, counts: latest.after.counts, originals: latest.after.originals }
    }, null, 2);
    for (const original of latest.originals) {
      const item = document.createElement('li');
      const heading = document.createElement('h3');
      heading.textContent = `${original.originalId}: ${original.classification} / ${original.decision}`;
      const scope = document.createElement('p');
      scope.textContent = `${original.sourceKind}. Cancel evidence: ${original.cancellationEvidence}. Cancelled work: ${original.cancelledWork}. No effects: ${original.noEffectsEvidence}. External undo: ${original.externalUndoEvidence}.`;
      const proof = document.createElement('pre');
      proof.textContent = JSON.stringify({
        dimensions: original.dimensions, missing: original.missingDimensions, violated: original.violatedDimensions,
        originalContext: original.originalContext, originalBudgetMs: original.originalBudgetMs,
        startedAt: original.startedAt, originalDeadline: original.originalDeadline, endedAt: original.endedAt,
        terminalEvidence: original.terminalEvidence, reasonCodes: original.reasonCodes
      }, null, 2);
      item.append(heading, scope, proof);
      byId('originals').append(item);
    }
  }
  async function act(command, focus = true) {
    if (busy) return;
    busy = true;
    for (const id of ['inspect', 'compare', 'load-copy', 'inspect-copy', 'reset']) byId(id).disabled = true;
    try { show(await session.apply(command)); }
    finally {
      busy = false;
      for (const id of ['inspect', 'compare', 'load-copy', 'inspect-copy', 'reset']) byId(id).disabled = false;
      if (focus) byId('result-heading').focus();
    }
  }
  byId('inspect').addEventListener('click', () => act({ type: 'inspect', id: byId('source-id').value }));
  byId('compare').addEventListener('click', () => act({ type: 'compare', id: byId('comparison-id').value }));
  byId('inspect-copy').addEventListener('click', () =>
    act({ type: 'inspect-copy', id: byId('source-id').value, text: byId('candidate').value }));
  byId('load-copy').addEventListener('click', async () => {
    if (busy) return;
    const id = byId('source-id').value;
    if (!classifier.ids.includes(id)) { await act({ type: 'inspect', id }); return; }
    byId('candidate').value = await classifier.sourceJson(id);
    show(await session.apply({ type: 'reset' }));
    byId('status').textContent = 'Exact selected-source data copied for inspection only; no context or authority adopted.';
    byId('candidate').focus();
  });
  byId('reset').addEventListener('click', async () => {
    await act({ type: 'reset' }, false);
    byId('source-id').value = '';
    byId('comparison-id').value = '';
    byId('candidate').value = '';
    byId('source-id').focus();
  });
  for (const id of ['source-id', 'comparison-id', 'candidate']) {
    byId(id).addEventListener(id === 'candidate' ? 'input' : 'change', async () => {
      show(await session.apply({ type: 'reset' }));
      byId('status').textContent = 'Input changed; stale result cleared from presentation, not from retained history.';
    });
  }
  byId('context').textContent = JSON.stringify({
    origin: 'BUNDLED_HISTORICAL_C015_PUBLIC_RESTORE_OBSERVATION_ONLY',
    capturedAtUtc: globalThis.C015ObservedSnapshot.capturedAtUtc,
    evidenceFile: globalThis.C015ObservedSnapshot.evidenceFile,
    runs: globalThis.C015ObservedSnapshot.runs.map((run) => run.result),
    actualBrowserDiskRead: false, actualBrowserCancellation: false, authenticatedCurrentAssociation: false
  }, null, 2);
  show(session.snapshot());
}());
