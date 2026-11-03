(function () {
  'use strict';
  const model = globalThis.S024;
  const form = document.getElementById('settings-form');
  const alert = document.getElementById('input-error');
  const controls = {
    scope: document.getElementById('validation-scope'),
    setting: document.getElementById('dependency-setting'),
    identity: document.getElementById('identity-access'),
    network: document.getElementById('network-access'),
    background: document.getElementById('background-mode')
  };
  let state = model.create();
  const configuration = () => Object.fromEntries(Object.entries(controls).map(([key, control]) => [key, control.value]));
  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }
  function error(message) {
    alert.textContent = message;
    alert.hidden = false;
    alert.focus();
  }
  function clearError() {
    alert.hidden = true;
    alert.textContent = '';
  }
  function comparison() {
    const rows = model.compare(configuration());
    const body = document.getElementById('comparison-rows');
    body.replaceChildren(...rows.map((row) => {
      const tr = document.createElement('tr');
      const label = element('th', row.key);
      label.scope = 'row';
      tr.append(label, ...['staging', 'production', 'effective', 'rule'].map((key) => element('td', row[key])));
      return tr;
    }));
  }
  function trace(attempt) {
    const item = document.createElement('li');
    item.append(element('strong', `Validation ${attempt.step}: ${attempt.verdict.toUpperCase()} (${attempt.config.scope})`));
    item.append(element('p', attempt.explanation));
    const checks = document.createElement('ul');
    for (const check of attempt.checks) {
      checks.append(element('li', `${check.key}: ${check.status.toUpperCase()} — expected ${check.expected}; observed ${check.observed}.`));
    }
    item.append(checks);
    item.append(element('p', `Production workers: ${attempt.productionBackgroundWorkers}; candidate starts: ${attempt.candidateBackgroundStarts}; duplicate starts: ${attempt.duplicateBackgroundStarts}; unsafe starts prevented: ${attempt.preventedDuplicateStarts}.`));
    return item;
  }
  function render() {
    const summary = model.summarize(state);
    document.getElementById('verdict').textContent = `Run ${state.runId}: ${summary.verdict.toUpperCase()}`;
    document.getElementById('counters').textContent = `Validations ${summary.validations}/6 · success ${summary.successful} · failure ${summary.failed} · unknown ${summary.unknown} · safety-blocked ${summary.blocked} · checks passed ${summary.checksPassed}`;
    document.getElementById('worker-counts').textContent = `Production workers: 1 · candidate background starts: ${summary.candidateBackgroundStarts} · duplicate starts: ${summary.duplicateBackgroundStarts} · unsafe starts prevented: ${summary.preventedDuplicateStarts}`;
    document.getElementById('trace').replaceChildren(...state.attempts.map(trace));
    document.getElementById('history-counts').textContent = `Retained ${state.history.length}/3 full runs · evicted ${state.evictedRuns} · page-memory only`;
    document.getElementById('history').replaceChildren(...state.history.map((run) => {
      const details = document.createElement('details');
      details.append(element('summary', `Run ${run.runId}: ${run.summary.verdict.toUpperCase()} · ${run.summary.validations} validations`));
      const list = document.createElement('ol');
      list.append(...run.attempts.map(trace));
      details.append(list);
      return details;
    }));
    document.getElementById('run-evidence').textContent = JSON.stringify({
      cardId: 'A-S024', kanoUnit: 'A-S024', packet: 'SC-S024', mode: 'synthetic-only',
      state, summary, nativeProof: false, productionNode24Validated: false, parentComplete: false
    }, null, 2);
  }
  form.addEventListener('change', () => {
    try { comparison(); clearError(); } catch (failure) { error(failure.message); }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const next = model.validate(state, configuration());
      state = next;
      comparison();
      clearError();
      render();
    } catch (failure) {
      error(failure.message);
    }
  });
  document.getElementById('archive-run').addEventListener('click', () => {
    try {
      state = model.reset(state);
      form.reset();
      comparison();
      clearError();
      render();
      controls.scope.focus();
    } catch (failure) {
      error(failure.message);
    }
  });
  comparison();
  render();
}());
