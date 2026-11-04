(function () {
  'use strict';
  const get = (id) => document.getElementById(id);
  const controls = () => document.querySelectorAll('button, input, select');
  const M = window.S120;
  if (!M) {
    get('load-status').textContent = 'Lesson load failed: fixed model unavailable; result unverified. Controls remain disabled.';
    return;
  }
  let state;
  const text = (id, value) => { get(id).textContent = value; };
  const node = (tag, content) => {
    const element = document.createElement(tag);
    if (content !== undefined) element.textContent = content;
    return element;
  };
  const counts = (result) => `${result.attempted} attempted · ${result.succeeded} succeeded · ${result.interrupted} interrupted · ${result.unknown} unknown`;
  function row(values) {
    const element = node('tr');
    values.forEach((value) => element.append(node('td', value)));
    return element;
  }
  function attempts(target, receipts) {
    target.replaceChildren(...receipts.map((item) => row([
      `${item.id} / ${item.cohort}`,
      item.destination,
      `${item.outcome} / ${item.httpStatus === null ? 'no acknowledgment' : item.httpStatus}`,
      `${item.latencyMs === null ? 'unknown' : `${item.latencyMs} ms`} / ${item.budgetMs} ms`,
      `${item.stateRevision === null ? 'state unknown' : `revision ${item.stateRevision}`} / ${item.effect}`
    ])));
  }
  function effects(target, records, pendingEffect) {
    const items = records.map((item) => {
      const element = node('li', `${item.key}: ${item.units} effect, revision ${item.stateRevision}; ${item.source}`);
      element.dataset.effect = item.key;
      return element;
    });
    if (pendingEffect === 'unresolved') items.push(node('li', 'pending-commit is unresolved: missing acknowledgment is neither success nor permission for a new mutation.'));
    if (!items.length) items.push(node('li', 'No observed effects yet.'));
    target.replaceChildren(...items);
  }
  function trace(target, events) {
    target.replaceChildren(...events.map((item) => node('li', `${item.tickMs} ms (synthetic tick) · ${item.detail}`)));
  }
  function history() {
    text('history-count', `${state.history.length} / ${M.LIMITS.archives} archived runs`);
    get('history').replaceChildren(...state.history.map((archive) => {
      const details = node('details');
      details.append(node('summary', `Run ${archive.runNumber} · ${counts(archive.result)} · verification ${archive.result.verification} · user impact ${archive.result.userImpact}`));
      details.append(node('p', `${archive.result.envelope}. ${archive.result.cleanup}. ${archive.result.reason}`));
      details.append(node('p', `${archive.result.affectedAttempts} affected attempts · ${archive.result.successfulMigrations} successful migrations`));
      const table = node('table');
      table.append(node('caption', `Run ${archive.runNumber}: all retained fixed receipts`));
      const head = node('thead');
      const headers = node('tr');
      ['Attempt / cohort', 'Destination', 'Outcome / HTTP', 'Latency / budget', 'State / effect'].forEach((value) => {
        const cell = node('th', value);
        cell.scope = 'col';
        headers.append(cell);
      });
      head.append(headers);
      table.append(head);
      const body = node('tbody');
      attempts(body, archive.attempts);
      table.append(body);
      const scroll = node('div');
      scroll.className = 'table-scroll';
      scroll.append(table);
      details.append(scroll);
      const effectList = node('ul');
      effects(effectList, archive.effects, archive.pendingEffect);
      details.append(effectList);
      const eventList = node('ol');
      trace(eventList, archive.events);
      details.append(eventList);
      return details;
    }));
  }
  function render() {
    const result = M.summarize(state);
    text('run-label', `Run ${state.runNumber} · action ${state.step} / ${M.LIMITS.actions}`);
    text('viable-count', `Viable destinations: ${result.viableDestinations.length}`);
    get('inventory').replaceChildren(...state.destinations.map((item) => row([
      `${item.id} / ${item.region}`, item.available ? 'reachable' : 'unavailable',
      `${item.capacityUnits} fixed units`, `${item.stateRevision} / ${item.writerEpoch}`
    ])));
    text('verification', result.verification);
    text('user-impact', result.userImpact);
    text('envelope', result.envelope);
    text('consistency', result.consistency);
    text('cleanup', result.cleanup);
    text('counts', counts(result));
    text('affected', `${result.affectedAttempts} affected attempts · ${result.successfulMigrations} successful migrations`);
    text('reason', result.reason);
    attempts(get('attempts'), state.attempts);
    effects(get('effects'), state.effects, state.pendingEffect);
    trace(get('trace'), state.events);
    history();
  }
  function clearError() {
    get('error').hidden = true;
    get('error').textContent = '';
    controls().forEach((control) => control.removeAttribute('aria-invalid'));
  }
  function execute(command, correction) {
    try {
      const next = M.act(state, command);
      state = next;
      clearError();
      render();
      if (command.type === 'reset') {
        Array.from(document.forms).forEach((form) => form.reset());
        get('destination').focus();
      }
    } catch (error) {
      const field = error.code === 'ERR_CONFIRMATION'
        ? command.type === 'remove' ? get('confirm-remove') : get('reconcile') : correction;
      controls().forEach((control) => control.removeAttribute('aria-invalid'));
      get('error').hidden = false;
      get('error').textContent = `Action rejected (${error.code || 'ERR_LESSON'}): ${error.message}`;
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    }
  }
  function submit(id, action) {
    get(id).addEventListener('submit', (event) => { event.preventDefault(); action(); });
  }
  try {
    state = M.create();
    get('observe').addEventListener('click', () => execute({ type: 'observe' }, get('observe')));
    submit('remove-form', () => execute({
      type: 'remove', destination: get('destination').value, confirmed: get('confirm-remove').checked
    }, get('destination')));
    submit('verdict-form', () => execute({ type: 'verify', claim: get('claim').value }, get('claim')));
    get('retry').addEventListener('click', () => execute({ type: 'retry' }, get('retry')));
    submit('recovery-form', () => execute({
      type: 'recover', destination: get('recover-destination').value, reconciled: get('reconcile').checked
    }, get('recover-destination')));
    get('start-over').addEventListener('click', () => execute({ type: 'reset' }, get('start-over')));
    render();
    controls().forEach((control) => { control.disabled = false; });
    text('load-status', 'Fixed fictional fixture loaded; all actions and durations are teaching data only.');
  } catch {
    controls().forEach((control) => { control.disabled = true; });
    text('load-status', 'Lesson load failed; results unverified. Reload only after the local scripts are available.');
  }
}());
