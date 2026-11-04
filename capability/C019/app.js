(function () {
  'use strict';

  const bankSha256 = '79cd3e32469f24b272ada7b2877195486991783f5c0ca5fb4751331f3d5f2240';
  const captureId = 'fixtures-48a23d44-bc90-4db6-a3eb-d8b5158c3652';
  const expected = Object.freeze({
    'missing-state': ['Missing selected state', 'STATE_MISSING'],
    'missing-run': ['Missing second run (not the first run)', 'STATE_MISSING'],
    'wrong-run': ['Rejected unknown run; run context unknown', 'UNKNOWN_RUN_ID'],
    'held-partial': ['Process exited during partial write; publication unobserved', 'HOLD_UNOBSERVED'],
    'held-flushed': ['Process exited after staging flush; publication unobserved', 'HOLD_UNOBSERVED'],
    'held-published': ['Process exited after publication before acknowledgment', 'HOLD_UNOBSERVED'],
    'corrupt-json': ['Owned malformed epoch; no previous-state fallback', 'CORRUPT_JSON'],
    'digest-mismatch': ['Owned state digest mismatch', 'STATE_DIGEST'],
    'ack-mismatch': ['Owned acknowledgment mismatch', 'ACKNOWLEDGMENT_MISMATCH'],
    'history-gap': ['Owned epoch gap; previous acknowledgment retained', 'HISTORY_GAP'],
    'stale-epoch': ['Rejected retry of an acknowledged epoch', 'STALE_EPOCH'],
    'invalid-epoch': ['Rejected string epoch; no numeric coercion', 'UNKNOWN_EPOCH'],
    'invalid-shape': ['Rejected additional input field', 'CLOSED_SCHEMA'],
  });
  const controls = Object.fromEntries(['case-id', 'inspect', 'action-id', 'perform', 'reset']
    .map((id) => [id, document.getElementById(id)]));
  const setText = (id, text) => { document.getElementById(id).textContent = text; };
  const types = globalThis.C019Errors;
  let console;
  let cases;
  let renderedRevision;

  function caseChoices(selected) {
    controls['case-id'].replaceChildren();
    if (selected === null) controls['case-id'].add(new Option('No valid selection — choose a historical fixture', ''));
    for (const [id, values] of Object.entries(expected)) controls['case-id'].add(new Option(values[0], id));
    controls['case-id'].value = selected === null ? '' : selected;
  }

  function render() {
    const state = console.state;
    const failure = state.failure;
    const selected = cases.has(controls['case-id'].value) ? controls['case-id'].value : null;
    caseChoices(selected);
    renderedRevision = state.revision;
    setText('status', `${state.notification.code} — ${state.notification.message}`);
    setText('outcome', state.status);
    setText('error-code', failure ? `${failure.error.source}.${failure.error.code}` : 'No typed error inspected');
    setText('error-type', failure && failure.error.name !== null ? failure.error.name : 'Unknown');
    setText('error-reason', failure ? types.map[failure.error.code].reason : 'No failure has been inspected.');
    setText('pending-run', failure && failure.context.runId !== null ? failure.context.runId : 'UNKNOWN — no run ID inferred or rejected input retained');
    setText('pending-epoch', failure && failure.context.epoch !== null ? String(failure.context.epoch) : 'UNKNOWN — not inferred from an earlier acknowledgment');
    setText('pending-step', failure && failure.context.pendingStep !== null ? failure.context.pendingStep : 'UNKNOWN — not inferred from an unacknowledged candidate');
    setText('inspection-count', `${state.inspectionCount} / 3`);
    setText('authority', `Recovery confirmed: false. Write authorized: false. Operator review needed: ${state.operatorReviewNeeded}. Need acknowledged: ${state.operatorReviewAcknowledged}. Operator review not performed.`);
    setText('prior-ack', failure && failure.priorAcknowledgment !== null
      ? JSON.stringify(failure.priorAcknowledgment, null, 2) : 'No earlier acknowledgment observed.');
    setText('last-inspection', state.lastInspection === null
      ? 'No read-only reinspection recorded.' : JSON.stringify(state.lastInspection, null, 2));
    setText('history-count', `${state.history.length} / 48`);
    controls['action-id'].replaceChildren();
    for (const action of state.actions) controls['action-id'].add(new Option(types.actions[action].label, action));
    if (state.actions.length === 0) controls['action-id'].add(new Option('No allowed actions', ''));
    controls['action-id'].disabled = state.actions.length === 0;
    controls.perform.disabled = state.actions.length === 0;
    const history = document.getElementById('history');
    history.replaceChildren();
    for (const entry of state.history) {
      const item = document.createElement('li');
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = `${entry.sequence}: ${entry.code} — ${entry.accepted ? 'allowed presentation step only' : 'rejected'} — ${entry.failure === null ? 'no observed failure' : entry.failure.error.code}`;
      const data = document.createElement('pre');
      data.textContent = JSON.stringify(entry, null, 2);
      details.append(summary, data);
      item.append(details);
      history.append(item);
    }
    setText('canonical-state', types.canonical(state));
  }

  async function initialize() {
    try {
      if (!types || !globalThis.C019Recovery || !globalThis.C019CapturedObservations ||
          !globalThis.crypto || !globalThis.crypto.subtle) throw new TypeError('Closed dependencies are unavailable.');
      const bank = types.record(globalThis.C019CapturedObservations, [
        'schemaVersion', 'cardId', 'mode', 'capturedAtUtc', 'captureId',
        'filesystemInspectionNow', 'recoveryConfirmed', 'cases',
      ]);
      if (!bank || bank.schemaVersion !== 1 || bank.cardId !== 'C019' ||
          bank.mode !== 'bundled-historical-C015-errors' || bank.captureId !== captureId ||
          bank.filesystemInspectionNow !== false || bank.recoveryConfirmed !== false ||
          typeof bank.capturedAtUtc !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(bank.capturedAtUtc) ||
          !Array.isArray(bank.cases)) throw new TypeError('The historical observation schema is invalid.');
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(types.canonical(bank)));
      const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (actual !== bankSha256 || bank.cases.length !== Object.keys(expected).length) {
        throw new TypeError('The immutable historical observation pin differs.');
      }
      cases = new Map();
      for (const value of bank.cases) {
        const entry = types.record(value, ['id', 'label', 'failure']);
        if (!entry || typeof entry.id !== 'string' || !Object.hasOwn(expected, entry.id) ||
            entry.label !== expected[entry.id][0] || cases.has(entry.id)) {
          throw new TypeError('A closed historical case is required.');
        }
        const failure = types.failure(entry.failure);
        if (!failure || failure.error.code !== expected[entry.id][1]) throw new TypeError('A genuine captured typed error is required.');
        cases.set(entry.id, failure);
      }
      console = new globalThis.C019Recovery.RecoveryConsole('historical-teaching');
      caseChoices('missing-state');
      controls['case-id'].disabled = false;
      controls.inspect.disabled = false;
      controls.reset.disabled = false;
      controls['case-id'].addEventListener('change', () => {
        console.reject(cases.has(controls['case-id'].value) ? 'SELECTION_CHANGED' : 'UNKNOWN_SELECTION');
        render();
      });
      controls.inspect.addEventListener('click', () => {
        if (cases.has(controls['case-id'].value)) console.observe(cases.get(controls['case-id'].value));
        else console.reject('UNKNOWN_SELECTION');
        render();
      });
      controls.perform.addEventListener('click', () => {
        console.dispatch(controls['action-id'].value, renderedRevision);
        render();
      });
      controls.reset.addEventListener('click', () => {
        console.resetView();
        caseChoices('missing-state');
        document.querySelectorAll('details').forEach((element) => { element.open = false; });
        render();
        controls['case-id'].focus();
      });
      render();
    } catch {
      for (const control of Object.values(controls)) control.disabled = true;
      setText('status', 'REJECTED INVALID_BUNDLE — Historical observations or their integrity could not be established. No live state or recovery is inferred.');
      setText('outcome', 'rejected');
      setText('canonical-state', '{"recoveryConfirmed":false,"status":"rejected","writesAuthorized":false}');
    }
  }
  initialize();
}());
