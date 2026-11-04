(function () {
  'use strict';
  const element = (id) => document.getElementById(id);
  const api = globalThis.C034Trace;
  const inspections = [];
  function clear() {
    for (const id of ['error', 'replacement', 'context', 'source']) element(id).textContent = '';
    element('originals').replaceChildren();
    element('events').replaceChildren();
  }
  function history(id, result) {
    const entry = document.createElement('li');
    entry.textContent = `${inspections.length + 1}. ${id || 'no trace selected'} - ${result.valid ? 'source-consistent historical copy' : result.code}`;
    inspections.push({ id, valid: result.valid, code: result.code });
    element('inspection-history').appendChild(entry);
    if (inspections.length === 16) {
      element('history-limit').textContent = 'History capacity reached. Further inspections are refused, not dropped. Reload starts a new view; saved original history remains immutable.';
      for (const id of ['inspect', 'inspect-copy', 'load-copy']) element(id).disabled = true;
    }
  }
  function render(result) {
    for (const attempt of result.attempts) {
      const item = document.createElement('li');
      item.dataset.attempt = attempt.attemptId;
      item.dataset.classification = attempt.classification;
      item.textContent = `${attempt.attemptId}: ${attempt.classification}; profile ${attempt.original.profileId}; draft ${attempt.original.draft}; original start ${attempt.startedAt}, deadline ${attempt.deadline}, budget ${attempt.original.budgetMs} ms; end ${attempt.endedAt === null ? 'NOT SAVED - unknown' : attempt.endedAt}; ${attempt.requests} requests / ${attempt.responses} responses.`;
      element('originals').appendChild(item);
      let acknowledgement = 0;
      for (const event of attempt.events) {
        const row = document.createElement('tr');
        row.dataset.action = event.code;
        row.dataset.attempt = event.attemptId;
        const version = event.code === 'ACTUAL_READ_ACKNOWLEDGED' ? attempt.observedVersions[acknowledgement++] : null;
        const action = `${event.code}${event.implementation ? ` (requested/acknowledged ${event.implementation}, ordinal ${event.ordinal})` : ''}`;
        for (const text of [event.attemptId, action, `${event.at} / ${event.elapsedMs}`,
          version ? `${version.implementationVersion}; ${version.apiContract}; ${version.deploymentStamp} (local fixture label)` : 'Not observed at this action']) {
          const cell = document.createElement('td');
          cell.textContent = text;
          row.appendChild(cell);
        }
        element('events').appendChild(row);
      }
    }
    const replacement = result.replacementSummary;
    element('replacement').textContent = `Historical report records replacement ${replacement.replacementId} after ${replacement.originalInterruptedId}. That original remains unknown. Replacement summary only: full actions, original start/deadline/end and per-reply versions were NOT SAVED here; ordering and outcome are unverified, not reconstructed.`;
    element('context').textContent = JSON.stringify(result.context, null, 2);
    element('source').textContent = JSON.stringify(result.source, null, 2);
  }
  function inspect(copy) {
    if (inspections.length >= 16) return;
    clear();
    const id = element('trace').value;
    const result = copy ? api.inspectCandidate(element('candidate').value, id) : api.inspectSaved(id);
    history(id, result);
    if (!result.valid) {
      element('status').textContent = 'Inspection rejected. No stale result, live run, approval or identity was adopted.';
      element('status').dataset.result = 'rejected';
      element('error').textContent = result.code;
      return;
    }
    render(result);
    element('status').textContent = 'Source-consistent HISTORICAL saved copy. Ordering checked; not a live run, approval, authenticated identity, migration or full-journey success.';
    element('status').dataset.result = 'historical';
  }
  element('inspect').addEventListener('click', () => inspect(false));
  element('inspect-copy').addEventListener('click', () => inspect(true));
  element('load-copy').addEventListener('click', () => {
    if (inspections.length >= 16) return;
    clear();
    try {
      element('candidate').value = JSON.stringify(api.getSavedTrace(element('trace').value), null, 2);
      element('status').textContent = 'Loaded a historical JSON copy for inspection only; no observation has been adopted.';
      element('status').dataset.result = 'copy-loaded';
      element('candidate').focus();
    } catch (error) {
      element('candidate').value = '';
      element('error').textContent = error.code || 'SAVED_TRACE_UNAVAILABLE';
      element('status').textContent = 'No saved copy loaded. No default trace.';
      element('status').dataset.result = 'rejected';
    }
  });
  element('trace').addEventListener('change', () => {
    clear();
    element('candidate').value = '';
    element('status').textContent = 'Selection changed. Not inspected; no live run is active.';
    element('status').dataset.result = 'not-inspected';
  });
  element('reset').addEventListener('click', () => {
    clear();
    element('candidate').value = '';
    element('trace').value = '';
    element('status').textContent = 'Display reset only. Saved originals and inspection errors remain unchanged. No live run is active.';
    element('status').dataset.result = 'reset';
    element('trace').focus();
  });
}());
