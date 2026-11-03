'use strict';

(() => {
  const { DEFAULTS, createRehearsal } = globalThis.S044;
  const lesson = createRehearsal();
  const byId = (id) => document.getElementById(id);
  const controls = { prefixBytes: 'prefix', response: 'response', delayMs: 'delay', budgetMs: 'budget', hashEvidence: 'hash-evidence' };
  const list = (id, items) => byId(id).replaceChildren(...items.map((text) => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
  function defaults() {
    for (const [key, id] of Object.entries(controls)) byId(id).value = String(DEFAULTS[key]);
  }
  function clearError() {
    byId('input-error').hidden = true;
    byId('input-error').textContent = '';
  }
  function rejected(error) {
    byId('current-result').hidden = true;
    byId('input-error').textContent = `Rejected: ${error.message}`;
    byId('input-error').hidden = false;
    byId('input-error').focus();
  }
  function readConfig() {
    const config = {};
    for (const [key, id] of Object.entries(controls)) {
      const value = byId(id).value;
      if (['prefixBytes', 'delayMs', 'budgetMs'].includes(key)) {
        if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error(`Input ${key} must be a whole numeric value; empty and coerced values are invalid.`);
        config[key] = Number(value);
      } else config[key] = value;
    }
    return config;
  }
  function metrics(result) {
    const fields = [
      ['Attempted / succeeded / interrupted / unknown', `${result.counts.attempted} / ${result.counts.succeeded} / ${result.counts.interrupted} / ${result.counts.unknown}`],
      ['Synthetic request', `Range: ${result.request.range}; If-Range: ${result.request.ifRange}`],
      ['Synthetic response', `${result.response.status}; Content-Range: ${result.response.contentRange ?? 'absent'}`],
      ['Expected / retained / received / assembled bytes', `${result.bytes.expected} / ${result.bytes.retained} / ${result.bytes.received} / ${result.bytes.assembled}`],
      ['Missing byte offsets', result.bytes.missing.length ? result.bytes.missing.join(', ') : 'none'],
      ['Duplicated byte offsets', result.bytes.duplicates.length ? result.bytes.duplicates.join(', ') : 'none'],
      ['Observed SHA-256', result.hash.observed ?? 'UNKNOWN — no final checksum proof'],
      ['Original elapsed / budget', `${result.timing.elapsedMs} ms / ${result.timing.budgetMs} ms (clock starts at 0 ms)`],
      ['Resumed transfer only', `${result.timing.transferDurationMs} ms — not a replacement budget clock`],
      ['Correct artifact completion observed', result.timing.completedAtMs === null ? 'not verified' : `${result.timing.completedAtMs} ms`],
    ];
    byId('metrics').replaceChildren(...fields.flatMap(([label, value]) => {
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = label;
      detail.textContent = value;
      return [term, detail];
    }));
  }
  function render() {
    const state = lesson.snapshot();
    byId('configuration-fields').disabled = state.phase !== 'idle';
    byId('resume-download').disabled = state.phase !== 'paused';
    byId('rehearsal-reset').disabled = state.phase === 'verifying';
    byId('phase').textContent = {
      idle: 'Idle — choose assumptions, then admit the original prefix.',
      paused: 'Paused at cutover — original prefix and budget retained. Resume is required; completion is not yet proven.',
      verifying: 'Verifying original bytes, SHA-256 and budget…',
      complete: 'Complete — inspect the verifier and user impact. Reset to conduct another attempt.',
    }[state.phase];
    byId('paused-receipt').hidden = state.phase !== 'paused';
    if (state.active) {
      byId('paused-receipt').textContent = `Run ${state.active.runId}: ${state.active.config.prefixBytes} retained bytes; next missing offset ${state.active.config.prefixBytes}; original deadline ${state.active.config.budgetMs} ms.`;
    }
    byId('current-result').hidden = !state.result;
    if (state.result) {
      const result = state.result;
      byId('verdict').textContent = result.verdict;
      byId('impact').textContent = result.impact;
      metrics(result);
      list('checks', Object.entries(result.checks).map(([key, value]) => `${key}: ${value === null ? 'UNKNOWN' : value ? 'PASS' : 'FAIL'}`));
      list('reasons', result.reasons);
      list('trace', result.trace.map((event) => `${event.atMs} ms — ${event.detail}`));
      byId('cleanup').textContent = `Cleanup: ${result.cleanup}`;
    }
    byId('history-empty').hidden = state.history.length > 0;
    byId('history').replaceChildren(...state.history.map((result) => {
      const item = document.createElement('li');
      const heading = document.createElement('p');
      heading.textContent = `Run ${result.runId}: ${result.verdict} — ${result.impact}`;
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'Retained trace and receipt';
      const receipt = document.createElement('pre');
      receipt.textContent = JSON.stringify(result, null, 2);
      details.append(summary, receipt);
      item.append(heading, details);
      return item;
    }));
  }
  byId('configuration').addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    try {
      lesson.admit(readConfig());
      render();
      byId('resume-download').focus();
    } catch (error) {
      rejected(error);
    }
  });
  byId('resume-download').addEventListener('click', async () => {
    clearError();
    try {
      const pending = lesson.resume();
      render();
      await pending;
      render();
      byId('current-result').focus();
    } catch (error) {
      rejected(error);
    }
  });
  byId('rehearsal-reset').addEventListener('click', () => {
    try {
      lesson.reset();
      defaults();
      clearError();
      render();
      byId('prefix').focus();
    } catch (error) {
      rejected(error);
    }
  });
  defaults();
  render();
})();
