'use strict';

(() => {
  const model = globalThis.SlotCookieLesson;
  const byId = (id) => document.getElementById(id);
  const form = byId('lesson-controls');
  const controls = {
    weight: byId('green-percent'), client: byId('client-id'), reply: byId('reply-outcome'),
    apply: byId('apply-weight'), reassign: byId('reassign-client'),
    replay: byId('replay-cohort'), retire: byId('retire-blue'), archive: byId('archive-run')
  };
  const error = byId('input-error');
  let state = model.create();
  function element(tag, value) {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = String(value);
    return node;
  }
  function row(values) {
    const node = element('tr');
    values.forEach((value) => node.append(element('td', value)));
    return node;
  }
  function clearError() {
    error.hidden = true;
    error.textContent = '';
    [controls.weight, controls.client, controls.reply].forEach((input) => input.removeAttribute('aria-invalid'));
  }
  function render(message) {
    const view = model.inspect(state);
    byId('run-epoch').textContent = `${view.run} / ${view.epoch}`;
    byId('nominal').textContent = `${view.greenPercent}%`;
    byId('migrated').textContent = `${view.migrated} / 2`;
    byId('counts').textContent = `${view.attempted} / ${view.completed} / ${view.interrupted} / ${view.unknown}`;
    byId('impact').textContent = view.verdict;
    byId('retirement').textContent = view.retirement.state;
    byId('impact-detail').textContent = view.verdict === 'failure'
      ? 'Failure: at least one synthetic user request was interrupted. Recovery does not erase it.'
      : view.unknown > 0
        ? 'Unknown: at least one attempted reply is missing. Later evidence cannot fill that historical gap.'
        : view.verdict === 'success'
          ? 'Success within this four-client synthetic fixture only: all clients observed green without failed or unknown attempts.'
          : 'Unknown: nominal allocation and completed blue requests do not prove complete migration.';
    byId('bounds').textContent = `${view.actionsRemaining} actions remaining. ${view.evicted} archived runs evicted.`;
    byId('blockers').replaceChildren(...(view.retirement.blockers.length
      ? view.retirement.blockers : ['None in this bounded synthetic fixture.'])
      .map((blocker) => element('li', blocker)));
    byId('client-rows').replaceChildren(...view.clients.map((client) => row([
      `${client.id} / ${client.originalSlot || 'new, bucket 75'}`,
      client.cookie || 'none', client.requested || 'unobserved',
      client.observed || 'unknown', `${client.result}${client.status ? ` ${client.status}` : ''} / ${client.fresh ? 'fresh' : 'stale or absent'}`,
      client.originalSlot === 'blue' ? client.migrated ? 'yes' : 'no' : 'not a blue-pinned migration'
    ])));
    byId('action-log').replaceChildren(...view.timeline.map((entry) =>
      element('li', `Step ${entry.step}: ${entry.action.type} · ${entry.outcome}. ${entry.note} Impact: ${entry.verdict}.`)));
    byId('request-rows').replaceChildren(...view.requests.map((request) => row([
      `${request.number} / ${request.step} / ${request.epoch}`, request.clientId,
      `${request.cookieBefore || 'none'} → ${request.cookieAfter || 'none'}`,
      request.requested, request.observed || 'unknown',
      `${request.result}${request.status ? ` ${request.status}` : ' (no reply)'}`
    ])));
    const archives = view.archives.map((archive) => {
      const details = element('details');
      details.append(element('summary', `Run ${archive.run}: ${archive.summary.verdict}; `
        + `${archive.summary.attempted} attempts, ${archive.summary.interrupted} interrupted, ${archive.summary.unknown} unknown`));
      details.append(element('pre', JSON.stringify(archive, null, 2)));
      return details;
    });
    byId('archives').replaceChildren(...(archives.length ? archives : [element('p', 'No archived runs.')]));
    const terminal = view.blueRetired || view.actionsRemaining === 0;
    [controls.weight, controls.client, controls.reply, controls.apply, controls.replay, controls.retire]
      .forEach((input) => { input.disabled = terminal; });
    controls.reassign.disabled = terminal || !view.inspected;
    if (message) byId('announcement').textContent = message;
  }
  function operate(buildAction, invalidControl) {
    clearError();
    try {
      const action = buildAction();
      const next = model.apply(state, action);
      state = next;
      const view = model.inspect(state);
      const latest = view.timeline.at(-1);
      render(`${latest.note} Impact ${view.verdict}; retirement ${view.retirement.state}.`);
    } catch (problem) {
      if (invalidControl) invalidControl.setAttribute('aria-invalid', 'true');
      error.textContent = `${problem.message} Run and retained trace unchanged.`;
      error.hidden = false;
      error.focus();
    }
  }
  controls.apply.addEventListener('click', () => operate(() => {
    const value = controls.weight.value;
    if (!/^(?:0|[1-9]\d?|100)$/.test(value)) {
      throw new Error('Nominal green allocation must be a whole decimal 0–100, without spaces, signs or leading zeros.');
    }
    return { type: 'weight', greenPercent: Number(value) };
  }, controls.weight));
  controls.replay.addEventListener('click', () => operate(() => ({ type: 'replay' })));
  controls.reassign.addEventListener('click', () => operate(() => ({
    type: 'reassign', clientId: controls.client.value, result: controls.reply.value
  }), controls.client));
  controls.retire.addEventListener('click', () => operate(() => ({ type: 'retire' })));
  controls.archive.addEventListener('click', () => {
    clearError();
    try {
      state = model.reset(state);
      form.reset();
      render('Known defaults restored. Prior nonempty run archived with its complete trace and impact.');
      controls.weight.focus();
    } catch (problem) {
      error.textContent = problem.message;
      error.hidden = false;
      error.focus();
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    operate(() => { throw new Error('Use the named lesson controls; form submission is disabled.'); });
  });
  render();
})();
