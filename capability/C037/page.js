(async function () {
  'use strict';
  const el = (id) => document.getElementById(id);
  const buttons = ['load', 'inspect', 'compare', 'json', 'reset'].map(el);
  const pct = (share) => share === null ? 'UNOBSERVED' : `${(share * 100).toFixed(2)}%`;
  let model;
  let last = null;
  let busy = false;
  let selectionError = null;
  function text(id, value) { el(id).textContent = value; }
  function status(outcome, message, code = '') {
    el('status').dataset.outcome = outcome;
    text('status', message);
    text('error', code);
  }
  function render() {
    const snapshot = model.snapshot();
    text('context', JSON.stringify(snapshot.currentExpectedContext, null, 2));
    text('current-started', String(snapshot.currentMetrics.started));
    text('current-known', String(snapshot.currentMetrics.known));
    text('current-unknown', String(snapshot.currentMetrics.unknown));
    text('current-in-flight', String(snapshot.currentMetrics.inFlight));
    text('current-missing', String(snapshot.currentMetrics.missingDestination));
    text('actual-current', '0');
    text('session', `Session: ${snapshot.sessionDisposition}. Retained failures ${snapshot.retainedFailures.length}; retained HOLDs ${snapshot.retainedHolds.length}.`);
    const history = el('history');
    history.replaceChildren();
    for (const item of snapshot.history) {
      const li = document.createElement('li');
      li.textContent = `${item.index}. ${item.operation}: ${item.disposition} — ${item.code}; guarded fictional starts ${item.currentStarted}`;
      history.append(li);
    }
    if (selectionError) {
      const li = document.createElement('li');
      li.textContent = `Selection error retained: ${selectionError}`;
      history.prepend(li);
    }
    const observed = last?.observed;
    el('destinations').replaceChildren();
    for (const destination of C037Routing.targets) {
      const diff = last?.differences?.find((item) => item.destination === destination);
      const row = document.createElement('tr');
      const values = [destination, diff?.requestedWeightBps === null || !diff ? 'UNOBSERVED' : `${diff.requestedWeightBps / 100}% (declared)`,
        diff?.declaredExpectedCount ?? 'UNOBSERVED', diff?.observedCount ?? 0,
        pct(diff?.observedShare ?? null), diff?.deltaBps === null || !diff ? 'HOLD' :
          `${diff.deltaBps.toFixed(2)} bps / ${last.requested.toleranceBps} bps: ${diff.withinThreshold ? 'within' : 'OUTSIDE'}`];
      for (const value of values) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      }
      el('destinations').append(row);
    }
    el('counts').replaceChildren();
    for (const key of ['started', 'known', 'unknown', 'inFlight', 'missingDestination', 'interrupted', 'duplicateDeliveries', 'failedResponses']) {
      const term = document.createElement('dt');
      const value = document.createElement('dd');
      term.textContent = key;
      value.textContent = String(observed?.[key] ?? 0);
      el('counts').append(term, value);
    }
    text('classification', `Source: ${last?.sourceClassification ?? 'UNOBSERVED'}. Requested policy: ${last?.policyClassification ?? 'UNOBSERVED'}.`);
    text('policy', last?.requested ?
      `DECLARED fictional policy; exact total 10000 bps; tolerance ${last.requested.toleranceBps} bps; minimum ${last.requested.minimumStarted} started originals. NOT an observed actual requested policy.` :
      'Requested policy: UNOBSERVED / HOLD. No inferred 50/50 default.');
    text('missing', last?.missing?.length ? `HOLD: ${[...new Set(last.missing)].join(', ')}` : '');
    text('originals', last?.originals ? JSON.stringify(last.originals, null, 2) :
      'No historical originals selected. Summary-only replacement 7 never repairs an original or enters current metrics.');
    text('result-json', JSON.stringify(last ?? { outcome: 'UNOBSERVED', currentMetrics: snapshot.currentMetrics }, null, 2));
  }
  async function act(operation) {
    if (busy) return;
    busy = true;
    buttons.forEach((button) => { button.disabled = true; });
    try {
      if (operation === 'load') {
        el('candidate').value = JSON.stringify(model.getFixture(el('sample').value), null, 2);
        last = null;
        status('loaded', 'JSON copy loaded. No comparison or metric transition performed.');
      } else if (operation === 'reset') {
        last = null;
        el('candidate').value = '';
        el('sample').value = '';
        el('result-details').open = false;
        status('reset', 'Display reset only. Failures, HOLDs, originals, metrics and replay protection retained.');
      } else if (operation === 'json') {
        el('result-details').open = true;
        status('json', 'Result JSON shown; no comparison or metric transition performed.');
      } else {
        last = await model[`${operation}Text`](el('candidate').value);
        status(last.outcome, `${last.disposition}: ${last.code}`,
          last.outcome === 'rejected' ? last.code : '');
      }
    } catch (error) {
      selectionError ??= error.code || 'LOCAL_UI_ERROR';
      status('rejected', 'No evidence selected or available; no default policy or observed result.', error.code || 'LOCAL_UI_ERROR');
    } finally {
      render();
      busy = false;
      buttons.forEach((button) => { button.disabled = false; });
      if (operation === 'reset') el('sample').focus();
    }
  }
  try {
    model = await C037Routing.open();
    render();
    buttons.forEach((button) => {
      button.disabled = false;
      button.addEventListener('click', () => act(button.id));
    });
    status('ready', 'UNOBSERVED. Choose a source explicitly, load JSON, then inspect or compare.');
  } catch (error) { status('unavailable', 'Inspector unavailable / HOLD. No previous-state success fallback.', error.code || 'LOCAL_CONTEXT_UNAVAILABLE'); }
}());
