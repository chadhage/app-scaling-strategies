'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const form = $('checkout-form');
  const api = globalThis.CheckoutLesson;
  function fatal(message) {
    $('error').textContent = `ERR_INIT: Lesson unavailable - ${message}. No checkout action is available.`;
    $('status').textContent = 'Initialization failed; no synthetic result is certified.';
    form.querySelectorAll('input, select, button').forEach((element) => {
      element.disabled = true;
      element.setAttribute('aria-disabled', 'true');
    });
  }
  if (!api || typeof api.createState !== 'function' || typeof api.execute !== 'function') {
    fatal('the fixed-data model resource did not load');
    return;
  }
  let state;
  const count = (value) => value === null ? 'unknown' : String(value);
  const counts = (result) => `orders ${count(result.counts.orders)} | effects ${count(result.counts.effects)} | payment markers ${count(result.counts.paymentMarkers)} | attempts ${result.counts.attempts}`;
  const verdict = (value) => value === null ? 'unknown' : value ? 'yes' : 'no';
  function row(body, cells, id) {
    const element = document.createElement('tr');
    if (id) element.id = id;
    for (const text of cells) {
      const cell = document.createElement('td');
      cell.textContent = text;
      element.append(cell);
    }
    body.append(element);
  }
  function list(id, items) {
    const element = $(id);
    element.replaceChildren();
    items.forEach((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      element.append(item);
    });
  }
  function records(data, idField) {
    return data === null ? 'unknown (not zero)' : `${data.length}: ${data.map((record) =>
      `${record[idField]} -> ${record.orderId} / ${record.checkoutId} / ${record.clientId} / ${record.cartId} / ${record.key}`).join('; ')}`;
  }
  function response(data) {
    return data === null ? 'unobserved; not success or failure'
      : `${data.statusCode} DATA / ${data.result} / ${data.orderId} / ${data.checkoutId} / ${data.clientId} / ${data.cartId}`;
  }
  function render() {
    $('phase').textContent = state.phase;
    $('history-count').textContent = `${state.history.length} / ${api.MAX_ACTIONS}`;
    $('run-count').textContent = `${state.runs.length} / ${api.MAX_RUNS}`;
    const available = {
      'load-button': ['ready', 'measured'].includes(state.phase) && state.history.length < api.MAX_ACTIONS,
      'retry-button': state.phase === 'lost',
      'inspect-button': state.phase === 'retried',
      'select-button': state.phase === 'inspected',
    };
    Object.entries(available).forEach(([id, allowed]) => $(id).setAttribute('aria-disabled', String(!allowed)));
    $('attempts-body').replaceChildren();
    if (state.active) {
      const initial = state.active.initial;
      row($('attempts-body'), [
        initial.attemptId, `${initial.route} / ${initial.key}`,
        `${initial.ack} / response lost`, `${initial.interruption}; first effect outcome ${initial.effectOutcome}`,
      ]);
      if (state.active.retryRevealed) {
        const retry = state.active.ledgerId === null ? null : api.LEDGERS[state.active.ledgerId].retry;
        row($('attempts-body'), retry ? [
          retry.attemptId, `${retry.route} / ${retry.key}`,
          `${retry.ack} / ${response(retry.response)}`, 'Selected alternative DATA only; see measured counts',
        ] : [
          'ATTEMPT-DEMO-02 alternatives', 'ROUTE-v2-DATA / inspect exact key per ledger',
          'Inspect ACK and response DATA per ledger', 'No effect inferred merely from retry or missing reply',
        ]);
      }
    }
    $('ledgers-body').replaceChildren();
    if (state.active?.inspected) {
      for (const id of api.LEDGER_IDS) {
        const ledger = api.LEDGERS[id];
        row($('ledgers-body'), [
          `${id}: ${ledger.label}`, ledger.retry.key, records(ledger.orders, 'orderId'),
          records(ledger.effects, 'effectId'), records(ledger.payments, 'paymentId'),
          ledger.finalState === null ? 'unknown (not empty)' : `${ledger.finalState.clientId} / ${ledger.finalState.cartId}`,
          `${ledger.retry.ack} / ${response(ledger.retry.response)}`,
        ], `ledger-${id}`);
      }
    }
    const result = state.active?.result;
    $('outcome').textContent = result ? result.outcome : 'not measured';
    $('counts').textContent = result ? counts(result) : 'not measured';
    $('one-order').textContent = result ? verdict(result.oneCorrectOrder) : 'not measured';
    $('client-outcome').textContent = result ? result.clientOutcome : 'not measured';
    $('interruptions').textContent = result ? String(result.interruptionCount) : 'not measured';
    $('claim').textContent = !result
      ? 'No checkout result has been measured. No native Azure or production reliability proof.'
      : result.outcome === 'positive'
        ? 'Positive bounded DATA: one correct order/effect/payment marker and matching client result. The original interruption and initially unknown outcome remain. No native or universal continuity claim.'
        : result.outcome === 'negative'
          ? 'Negative DATA: a known duplicate or mismatch prevents a correct checkout result, even with 200 DATA. This is a detected teaching failure, not a real order or payment.'
          : 'Explicit unresolved outcome (unknown DATA): client completion is unconfirmed. Missing acknowledgement proves neither order failure nor success and permits no duplicate order. Unknown counts remain unknown.';
    list('unknowns', result ? result.unknownObservations : []);
    list('reasons', result ? result.reasonCodes : []);
    list('history', state.history.map((event) =>
      `${event.sequence}. ${event.command.type} DATA${event.command.checkoutId ? ` / ${event.command.checkoutId}` : ''}${event.command.ledgerId ? ` / ${event.command.ledgerId}` : ''}`));
    list('run-history', state.runs.map((run) =>
      `Run ${run.runId} | ${run.ledgerId} | ${run.outcome} | ${counts(run)} | client ${run.clientOutcome} | interruption ${run.interruptionCount} | first effect outcome at response-loss boundary unknown`));
  }
  function dispatch(command) {
    try {
      state = api.execute(state, command);
      $('error').textContent = '';
      render();
      const messages = {
        lost: 'Response-loss DATA loaded. First outcome is unknown; reveal the fictional retry comparison.',
        retried: 'Retry DATA revealed. No order was submitted; inspect all alternative ledgers.',
        inspected: 'Seven fixed ledgers inspected. Choose one using counts, linked IDs, identity, state and response.',
        measured: 'Selection measured. Prior interruptions, negative results and unknowns remain in history.',
      };
      $('status').textContent = messages[state.phase];
      const next = { lost: 'retry-button', retried: 'inspect-button', inspected: 'ledger-id', measured: 'load-button' };
      $(next[state.phase]).focus();
    } catch (error) {
      if (!['ERR_INPUT', 'ERR_STATE', 'ERR_LIMIT'].includes(error.code)) {
        fatal('the local lesson encountered an unexpected error');
        return;
      }
      $('error').textContent = error.message;
      $('status').textContent = 'Safe hold. Current observations and all retained history are unchanged.';
      if (error.code === 'ERR_INPUT') $(command.type === 'load' ? 'checkout-id' : 'ledger-id').focus();
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    dispatch({ type: 'load', checkoutId: $('checkout-id').value });
  });
  $('retry-button').addEventListener('click', () => dispatch({ type: 'retry' }));
  $('inspect-button').addEventListener('click', () => dispatch({ type: 'inspect' }));
  $('select-button').addEventListener('click', () => dispatch({ type: 'select', ledgerId: $('ledger-id').value }));
  $('reset-button').addEventListener('click', () => {
    state = api.createState();
    HTMLFormElement.prototype.reset.call(form);
    $('error').textContent = '';
    render();
    $('status').textContent = 'Explicit reset cleared only this page’s in-memory DATA. Ready.';
    $('checkout-id').focus();
  });
  try {
    state = api.createState();
    render();
  } catch {
    fatal('the fixed-data model could not initialize');
  }
})();
