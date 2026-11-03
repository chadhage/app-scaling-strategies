(function () {
  'use strict';

  const model = globalThis.S040Lesson;
  const lesson = model.createLesson();
  const byId = (id) => document.getElementById(id);
  const form = byId('controls');
  const history = byId('history');
  const error = byId('input-error');

  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }

  function showError(reason) {
    error.textContent = reason.message;
    error.hidden = false;
    error.focus();
  }

  function render() {
    const state = lesson.snapshot();
    const result = state.current;
    const locked = state.phase !== 'ready';
    byId('conditions').disabled = locked;
    byId('rehearse').disabled = locked;
    byId('run-state').textContent = `${state.phase === 'exhausted' ? 'Exhausted' : state.phase === 'checked' ? 'Checked — reset before another run' : 'Ready'} · ${state.used}/${model.MAX_REHEARSALS} recorded rehearsals · ${state.remaining} remaining`;
    byId('verdict').textContent = result ? `${result.verdict.toUpperCase()} — synthetic rehearsal ${result.run}` : 'UNKNOWN — not yet rehearsed';
    byId('verdict').className = result ? result.verdict : 'unknown';
    byId('counts').textContent = result
      ? `${result.metrics.passed} passed · ${result.metrics.failed} failed · ${result.metrics.unknown} unknown checks`
      : '0 passed · 0 failed · 0 unknown checks';
    byId('impact').textContent = result ? result.userImpact : 'No current observation. Choose a contract, then rehearse.';
    const metrics = result ? result.metrics : {};
    byId('metrics').textContent = `${metrics.observedClients || 0}/2 observed · ${metrics.moved || 0}/2 moved · ${metrics.identitiesPreserved || 0}/2 identities · ${metrics.statesPreserved || 0}/2 work states · ${metrics.withinOriginalBudget || 0}/2 in budget`;
    byId('cleanup').textContent = result ? result.cleanup : 'No live resources exist. All data is in memory only.';
    byId('trace').replaceChildren();
    byId('assertions').replaceChildren();
    if (result) {
      for (const client of result.clients) {
        for (const phase of ['before', 'after']) {
          const observation = client[phase];
          const row = document.createElement('tr');
          const label = element('th', `${client.kind} / ${phase}`);
          label.scope = 'row';
          row.append(label);
          const cells = observation ? [
            `${observation.destination} · HTTP ${observation.status} · ${observation.subject || 'REJECTED'}${phase === 'after' ? ` · cookies ${observation.cookiesSent} · ${observation.identityEvidence}` : ''}`,
            observation.work ? JSON.stringify(observation.work) : 'MISSING required work',
            `${observation.elapsedMs} ms / ${observation.originalDeadlineMs} ms`,
          ] : ['UNKNOWN — observation unavailable', 'UNKNOWN', 'UNKNOWN / original 300 ms'];
          for (const text of cells) row.append(element('td', text));
          byId('trace').append(row);
        }
      }
      for (const check of result.checks) {
        byId('assertions').append(element('li', `${check.status.toUpperCase()} · ${check.client} · ${check.name}: ${check.detail}`));
      }
    }
    for (const record of state.history.slice(history.children.length)) {
      const item = document.createElement('li');
      const details = document.createElement('details');
      details.append(
        element('summary', `Rehearsal ${record.run}: ${record.verdict.toUpperCase()} — ${record.metrics.passed} passed / ${record.metrics.failed} failed / ${record.metrics.unknown} unknown`),
        element('pre', JSON.stringify(record, null, 2)),
      );
      item.append(details);
      history.append(item);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const input = Object.fromEntries(Object.keys(model.CHOICES).map((key) => [key, byId(key).value]));
      lesson.rehearse(input);
      error.hidden = true;
      error.textContent = '';
      render();
      byId('result-heading').focus();
    } catch (reason) {
      showError(reason);
    }
  });

  byId('reset-lesson').addEventListener('click', () => {
    lesson.reset();
    form.reset();
    error.hidden = true;
    error.textContent = '';
    render();
    byId(lesson.snapshot().phase === 'ready' ? 'cookies' : 'result-heading').focus();
  });

  render();
}());
