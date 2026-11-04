'use strict';
(() => {
  const form = document.getElementById('lesson-controls');
  const alert = document.getElementById('error');
  const result = document.getElementById('result');
  const reset = document.getElementById('reset-lesson');
  const model = globalThis.S128Lesson;
  function showError(failure) {
    alert.textContent = `${failure.code || 'ERR_MODEL'}: ${failure.message} No command ran. Correct the controls or reset.`;
    alert.focus();
  }
  if (!model || !['createState', 'transition', 'summarize'].every((name) => typeof model[name] === 'function')) {
    result.textContent = 'unknown — lesson model unavailable; no observations or pass.';
    form.querySelectorAll('select, button').forEach((control) => { control.disabled = true; });
    showError({ code: 'ERR_MODEL', message: 'Lesson model DATA unavailable. Reload the complete local bundle.' });
    return;
  }
  let state = model.createState();
  const node = (tag, text) => {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
  };
  function rows(id, values) {
    const body = document.getElementById(id);
    body.replaceChildren(...values.map((cells) => {
      const row = node('tr', '');
      cells.forEach((text) => row.append(node('td', String(text))));
      return row;
    }));
  }
  const show = (value) => value === null ? 'unknown' : String(value);
  function render() {
    const summary = model.summarize(state);
    result.textContent = `${summary.status} — ${summary.note}`;
    document.getElementById('journey-counts').textContent =
      `${summary.attempts} attempted; ${summary.passed} passed; ${summary.failed} failed; ${summary.unknown} unknown. Original budget: 400 ms per journey.`;
    document.getElementById('action-count').textContent = `${summary.actions}/${model.MAX_ACTIONS} actions retained; explicit reset clears only this page.`;
    rows('stage-rows', [
      ['Service selector separation', state.topology.status],
      ['Observed cohort destinations', state.traffic.status],
      ['Complete user journeys', state.journeys.status],
      ['Private-preview authorization', state.authorization.status],
    ]);
    rows('service-rows', state.topology.services.map((service) => [
      service.id, service.selectorId, service.matchedPods.join(', ') || '(none)',
      service.matchedBuilds.join(', ') || '(none)', service.status, service.note,
    ]));
    rows('route-rows', state.traffic.receipts.map((receipt) => [
      receipt.audience, receipt.desiredService, show(receipt.observedService), show(receipt.observedPod),
      show(receipt.observedSoftwareVersion), show(receipt.httpStatus), receipt.status,
    ]));
    rows('journey-rows', state.journeys.items.map((item) => [
      item.audience, show(item.observedSoftwareVersion), `${item.requestApiContract} → ${show(item.responseApiContract)}`,
      `${item.sessionBefore} → ${show(item.sessionAfter)}`, `${item.stateBefore} → ${show(item.stateAfter)}`,
      item.steps.map((step) => `${step.step}:${step.status}`).join(', '),
      `${show(item.completed)} / ${show(item.elapsedMs)} ms`, item.status,
    ]));
    rows('authorization-rows', state.authorization.probes.map((probe) => [
      probe.entryPath, probe.audience, probe.expectedPermission, show(probe.observedHttpStatus),
      show(probe.candidateReached), probe.status,
    ]));
    document.getElementById('capability-note').textContent = state.topology.capability.note;
    const history = document.getElementById('history');
    history.replaceChildren(...state.history.map((event) => node('li',
      `#${event.sequence} ${event.command.action} / ${event.command.fixture} / GA:${event.command.gaSelector} / preview:${event.command.previewSelector} / ${event.command.routing}: ${event.stageStatus}${event.held ? ' (held)' : ''}. ${event.note}`)));
    document.getElementById('state-view').textContent = JSON.stringify(state, null, 2);
  }
  const fixture = document.getElementById('fixture');
  fixture.replaceChildren(...Object.entries(model.DATA.FIXTURES).map(([value, label]) => {
    const option = node('option', label);
    option.value = value;
    return option;
  }));
  rows('pod-rows', model.DATA.PODS.map((pod) => [
    pod.id, pod.deploymentId, pod.audience, pod.softwareVersion, pod.apiContract,
    Object.entries(pod.labels).map(([key, value]) => `${key}=${value}`).join(', '),
  ]));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const command = {
        action: event.submitter?.value,
        gaSelector: document.getElementById('ga-selector').value,
        previewSelector: document.getElementById('preview-selector').value,
        routing: document.getElementById('routing').value,
        fixture: fixture.value,
      };
      state = model.transition(state, command);
      alert.textContent = '';
      render();
      if (!state.history.at(-1).held) {
        document.getElementById('control-note').textContent =
          `Recorded controls: GA ${command.gaSelector}, preview ${command.previewSelector}, ${command.routing}, ${command.fixture}. Changing controls does not rewrite observations.`;
      }
    } catch (failure) {
      showError(failure);
    }
  });
  form.querySelectorAll('select').forEach((control) => control.addEventListener('change', () => {
    document.getElementById('control-note').textContent =
      'Controls changed. Results still describe the last recorded choice. Inspect these controls again before observing or verifying.';
  }));
  reset.addEventListener('click', () => {
    HTMLFormElement.prototype.reset.call(form);
    state = model.createState();
    alert.textContent = '';
    document.getElementById('control-note').textContent = 'Record selectors first, destinations second, and complete journeys/access third.';
    render();
    document.getElementById('ga-selector').focus();
  });
  render();
})();
