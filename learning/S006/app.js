(function () {
  'use strict';

  const model = globalThis.PreviewModel;
  const verifier = globalThis.PreviewVerifier;
  const element = (id) => document.getElementById(id);
  const historyLimit = 12;
  let history = [];
  let probeCount = 0;

  function node(tag, text) {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    return result;
  }
  function showValue(value) {
    return value === undefined ? 'missing' : JSON.stringify(value);
  }
  function addOptions(id, choices, selected) {
    for (const choice of choices) {
      const option = node('option', choice.label);
      option.value = choice.id;
      option.defaultSelected = choice.id === selected;
      element(id).append(option);
    }
  }
  function readInput() {
    return {
      identity: element('identity').value, route: element('route').value,
      policy: element('policy').value, callback: element('callback').value
    };
  }
  function updateControls() {
    const route = model.routes.find((item) => item.id === element('route').value);
    const usesCallback = Boolean(route && route.callback);
    element('path').textContent = route ? route.path : 'Unknown route — submitting will reject the configuration.';
    element('callback').disabled = !usesCallback;
    element('callback-help').textContent = usesCallback
      ? 'This path models login/callback. Missing, mismatched, or unapproved return evidence must block preview.'
      : 'Callback control is not used by this path. Candidate handlers still need their own identity gate.';
    element('policy-warning').hidden = element('policy').value !== 'obscurity-only';
  }
  function renderHistory() {
    element('history').replaceChildren(...history.map((item) => {
      const entry = node('li', item.text);
      entry.dataset.decision = item.decision;
      entry.dataset.verdict = item.passed ? 'pass' : 'fail';
      return entry;
    }));
    element('history-empty').hidden = history.length > 0;
  }
  function renderProbe(probe, verdict, impact) {
    element('outcome').hidden = false;
    element('decision').textContent = probe.decision;
    element('synthetic-status').textContent = String(probe.statusCode);
    element('served-version').textContent = probe.version || 'none';
    element('verifier-result').textContent = verdict.passed
      ? 'PASS — expected probe outcome' : 'FAIL — contract violated';
    element('verifier-result').dataset.verdict = verdict.passed ? 'pass' : 'fail';
    element('user-impact').textContent = impact.preview;
    element('ga-impact').textContent = impact.gaUnchanged
      ? 'unchanged GA attribution on v1' : 'GA continuity or attribution changed';
    element('cleanup-result').textContent = 'N/A — no resources or persistent state created. Displayed in-tab results remain until Reset.';
    for (const client of ['ga', 'preview']) {
      for (const phase of ['before', 'after']) {
        element(`${client}-${phase}`).textContent = JSON.stringify(probe[client][phase], null, 2);
      }
    }
    element('trace-body').replaceChildren(...probe.trace.map((event) => {
      const row = node('tr');
      row.dataset.stage = event.stage;
      for (const value of [event.sequence, event.stage, event.client, event.detail, event.version || '—']) {
        row.append(node('td', String(value)));
      }
      return row;
    }));
    element('assertion-body').replaceChildren(...verdict.assertions.map((assertion) => {
      const row = node('tr');
      row.dataset.assertion = assertion.id;
      row.dataset.verdict = assertion.passed ? 'pass' : 'fail';
      for (const text of [
        assertion.label, showValue(assertion.expected), showValue(assertion.actual),
        assertion.passed ? 'PASS' : 'FAIL'
      ]) row.append(node('td', text));
      return row;
    }));
  }
  function runSelected(event) {
    event.preventDefault();
    const probe = model.runProbe(readInput());
    const verdict = verifier.verifyProbe(probe);
    const impact = verifier.describeImpact(probe);
    renderProbe(probe, verdict, impact);
    probeCount += 1;
    history.unshift({
      text: `Probe ${probeCount}: ${probe.input.identity} → ${probe.input.route}; ${probe.input.policy}; callback ${probe.input.callback}. Decision ${probe.decision}, synthetic ${probe.statusCode}, version ${probe.version || 'none'}. Verifier ${verdict.passed ? 'PASS' : 'FAIL'}. User impact: ${impact.preview}.`,
      decision: probe.decision, passed: verdict.passed
    });
    history = history.slice(0, historyLimit);
    renderHistory();
    element('live-status').textContent = `Probe ${probeCount}: ${probe.decision}; ${probe.version || 'no version served'}; verifier ${verdict.passed ? 'PASS' : 'FAIL'}; ${impact.preview}. GA ${impact.gaUnchanged ? 'unchanged' : 'changed'}.`;
  }
  function compareRoutes() {
    const input = readInput();
    const probeTotal = model.routes.length * model.identities.length;
    let failures = 0;
    const rows = model.routes.map((route) => {
      const row = node('tr');
      row.dataset.route = route.id;
      const heading = node('th', `${route.label} — ${route.path}`);
      heading.scope = 'row';
      row.append(heading);
      for (const identity of model.identities) {
        const probe = model.runProbe({ ...input, route: route.id, identity: identity.id });
        const verdict = verifier.verifyProbe(probe);
        const impact = verifier.describeImpact(probe);
        if (!verdict.passed) failures += 1;
        const cell = node('td', `${probe.decision} · ${probe.version || 'none'} · ${probe.statusCode} · ${verdict.passed ? 'PASS' : 'FAIL'}`);
        cell.dataset.identity = identity.id;
        cell.dataset.decision = probe.decision;
        cell.dataset.verdict = verdict.passed ? 'pass' : 'fail';
        cell.title = impact.preview;
        row.append(cell);
      }
      return row;
    });
    element('comparison-body').replaceChildren(...rows);
    element('comparison-caption').textContent = `${probeTotal} synthetic probes · policy ${input.policy} · callback ${input.callback} · ${failures} verifier failures. Decision · version · synthetic status · verifier.`;
    element('live-status').textContent = `Compared ${probeTotal} synthetic probes: ${failures} verifier failures. Denied and unknown outcomes retained. Single-probe trace and history unchanged.`;
  }
  function reset() {
    history = [];
    probeCount = 0;
    HTMLFormElement.prototype.reset.call(element('exercise'));
    updateControls();
    element('outcome').hidden = true;
    for (const id of [
      'trace-body', 'assertion-body', 'comparison-body', 'decision', 'synthetic-status',
      'served-version', 'verifier-result', 'user-impact', 'ga-impact',
      'ga-before', 'ga-after', 'preview-before', 'preview-after'
    ]) element(id).replaceChildren();
    element('verifier-result').removeAttribute('data-verdict');
    renderHistory();
    element('comparison-caption').textContent = 'Not run. Cells will show decision · version · synthetic status · verifier.';
    element('cleanup-result').textContent = 'Reset complete — in-tab results and history cleared. No resources, cookies, or persistent application state were created.';
    element('live-status').textContent = 'Reset complete. Results and history cleared; no external cleanup needed.';
  }

  addOptions('identity', model.identities, 'approved');
  addOptions('route', model.routes, 'join-preview');
  element('exercise').addEventListener('submit', runSelected);
  element('route').addEventListener('change', updateControls);
  element('policy').addEventListener('change', updateControls);
  element('compare-routes').addEventListener('click', compareRoutes);
  element('reset').addEventListener('click', reset);
  updateControls();
}());
