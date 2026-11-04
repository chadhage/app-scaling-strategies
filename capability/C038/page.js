(async function () {
  'use strict';
  const element = (id) => document.getElementById(id);
  const text = (id, value) => { element(id).textContent = value; };
  const json = (id, value) => text(id, JSON.stringify(value, null, 2));
  let session;
  let busy = false;
  const buttons = ['load', 'copy', 'inspect', 'compare', 'reset'];
  function controls() {
    const snapshot = session?.snapshot();
    const limit = snapshot && snapshot.history.length >= snapshot.historyLimit;
    for (const id of buttons) element(id).disabled = busy || !session ||
      (limit && ['load', 'inspect'].includes(id)) ||
      (id === 'compare' && snapshot.history.length < 2);
  }
  function history() {
    const snapshot = session.snapshot();
    element('history').replaceChildren(...snapshot.history.map((item) => {
      const line = document.createElement('li');
      line.textContent = `${item.index}. ${item.originalId ?? 'unknown original'} — ${item.decision} / ${item.code}; fresh ${item.coverage.filter((probe) => probe.status === 'FRESH_READY').length}/6. Original retained.`;
      return line;
    }));
    if (snapshot.history.length >= snapshot.historyLimit) text('history-limit', 'HISTORY LIMIT: new inspections refused, not dropped. Every original and replay guard retained; reset cannot authorize more work.');
    controls();
  }
  function render(result) {
    element('status').dataset.decision = result.decision;
    text('status', `${result.decision} / ${result.action} — ${result.code}`);
    text('error', result.rejected ? result.code : '');
    text('missing', result.missing.length ? `Missing / held: ${result.missing.join('; ')}` : 'No required fictional observations missing. Actual pool still UNKNOWN.');
    text('coverage-count', `${result.freshReadyProbes} / ${result.expectedProbes}`);
    element('coverage').replaceChildren(...result.coverage.map((item) => {
      const row = document.createElement('tr');
      for (const value of [item.instanceId, item.probeId, item.status,
        item.ageTicks === null ? 'UNKNOWN' : String(item.ageTicks), item.reasons.join('; ')]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      }
      return row;
    }));
    json('historical', result.historical ? {
      source: result.historicalSource, observations: result.historical,
      actualHistoryJoinedToCurrentLease: false
    } : { actualC034HistoryRemainsUnlinked: true, noOriginalJourneyRepaired: true });
    json('context', {
      origin: session.snapshot().ownerContextOrigin,
      association: session.snapshot().currentC015Association,
      historicalBrowserOnly: true, nativeCorrelationVerified: false
    });
    history();
  }
  try {
    session = await globalThis.C038Readiness.open();
    for (const id of globalThis.C038Readiness.ids) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = id.replaceAll('-', ' ');
      element('fixture').appendChild(option);
    }
    json('inventory', session.snapshot().expectedInventory);
    json('context', { origin: session.snapshot().ownerContextOrigin,
      association: session.snapshot().currentC015Association, historicalBrowserOnly: true });
    json('native-flags', globalThis.C038Readiness.flags);
    controls();
  } catch (error) {
    text('error', `UNKNOWN / HOLD — ${error.code || 'CONTEXT_UNAVAILABLE'}`);
    return;
  }
  element('load').addEventListener('click', () => {
    try {
      const candidate = session.getEvidence(element('fixture').value);
      element('candidate').value = JSON.stringify(candidate, null, 2);
      text('error', '');
      text('status', 'JSON copy loaded — no readiness decision made.');
      element('status').dataset.decision = 'LOADED';
    } catch (error) { text('error', error.code || 'UNKNOWN_FIXTURE_ID'); }
  });
  element('copy').addEventListener('click', () => {
    element('candidate').focus();
    element('candidate').select();
    text('status', 'JSON selected for copy. Press Ctrl+C. No readiness decision made.');
  });
  element('inspect').addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    controls();
    try { render(await session.inspectText(element('candidate').value)); }
    finally { busy = false; controls(); }
  });
  element('compare').addEventListener('click', () => {
    const records = session.snapshot().history.slice(-2);
    json('comparison', {
      previousOriginal: records[0], currentOriginal: records[1],
      previousOriginalUnchanged: true, comparisonDoesNotProveScaling: true,
      actualPoolReady: false
    });
  });
  element('reset').addEventListener('click', () => {
    element('candidate').value = '';
    element('fixture').value = '';
    element('coverage').replaceChildren();
    text('coverage-count', '0 / 6');
    text('comparison', 'Display cleared. Originals and replay protection retained.');
    text('historical', 'Display cleared; actual history remains UNLINKED.');
    text('error', '');
    text('missing', '');
    text('status', 'UNKNOWN / HOLD — display reset only; no model, original or replay state reset.');
    element('status').dataset.decision = 'UNKNOWN';
    history();
    element('fixture').focus();
  });
}());
