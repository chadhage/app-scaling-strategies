(function () {
  'use strict';

  const lesson = globalThis.S023Lesson;
  const byId = id => document.getElementById(id);
  const form = byId('journey-form');
  const errorPanel = byId('error');
  const announcement = byId('announcement');
  let session = lesson.createSession();

  function row(values) {
    const element = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      element.append(cell);
    }
    return element;
  }

  function duration(value) {
    return value === null ? 'unknown' : String(value);
  }

  function clearError() {
    errorPanel.hidden = true;
    errorPanel.textContent = '';
  }

  function render() {
    const latest = session.history.at(-1);
    const history = byId('history-body');
    const trace = byId('trace-body');
    history.replaceChildren();
    trace.replaceChildren();
    byId('history-count').textContent = `${session.history.length}/6 observations. History is session-only; reset or page reload clears it.`;
    for (const result of session.history) {
      history.append(row([
        result.id,
        `${result.config.mode} / ${result.config.fixture} / isolated=${result.config.isolated}`,
        result.outcome,
        `${result.metrics.passed} / ${result.metrics.failed} / ${result.metrics.unmeasured}`,
        `${duration(result.metrics.journeyMs)} / ${result.config.budgetMs}`,
        `${duration(result.effects.fixtureCommits)} / ${result.effects.externalWrites}`
      ]));
    }
    if (!latest) {
      byId('outcome').textContent = 'Not assessed';
      byId('outcome').dataset.outcome = 'not-assessed';
      byId('readiness').textContent = 'Candidate readiness: not assessed.';
      byId('reason').textContent = 'No business evidence has been collected.';
      byId('endpoint-result').textContent = 'Not run';
      for (const id of ['passed', 'failed', 'unmeasured', 'duration']) byId(id).textContent = 'Not measured';
      byId('fixture-commits').textContent = 'Not exercised';
      byId('external-writes').textContent = '0 (no external operations exist)';
      return;
    }
    byId('outcome').textContent = latest.outcome;
    byId('outcome').dataset.outcome = latest.outcome;
    byId('readiness').textContent = latest.ready
      ? 'Candidate readiness: ready in this synthetic rehearsal only.'
      : `Candidate readiness: not ready (${latest.outcome}).`;
    byId('reason').textContent = latest.reason;
    byId('endpoint-result').textContent = latest.endpoint.status === null
      ? 'Not run (isolation guard)' : `HTTP ${latest.endpoint.status} / ${latest.endpoint.durationMs} ms (synthetic endpoint only)`;
    byId('passed').textContent = `${latest.metrics.passed}/3`;
    byId('failed').textContent = String(latest.metrics.failed);
    byId('unmeasured').textContent = String(latest.metrics.unmeasured);
    byId('duration').textContent = `${duration(latest.metrics.journeyMs)} / ${latest.config.budgetMs} ms`;
    byId('fixture-commits').textContent = latest.effects.fixtureCommits === null
      ? 'unknown (receipt unobserved)' : `${latest.effects.fixtureCommits}${latest.effects.receipt ? ` (${latest.effects.receipt})` : ''}`;
    byId('external-writes').textContent = `${latest.effects.externalWrites} (no external operations exist)`;
    for (const step of latest.steps) {
      trace.append(row([step.name, step.observation, step.status === null ? 'unmeasured' : step.status,
        step.durationMs === null ? 'unmeasured' : step.durationMs, step.detail]));
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const rawBudget = byId('budget-ms').value;
      if (!/^(?:0|[1-9]\d*)$/.test(rawBudget)) {
        throw new Error('INPUT: journey budget must be a whole number from 50 to 500 ms; no decimals or exponent notation.');
      }
      const config = {
        mode: byId('check-mode').value, fixture: byId('fixture').value,
        budgetMs: Number(rawBudget), isolated: byId('isolated').checked
      };
      const next = lesson.run(session, config);
      session = next;
      clearError();
      render();
      announcement.textContent = `Observation ${session.history.length}: ${session.history.at(-1).outcome}. History retained.`;
    } catch (error) {
      errorPanel.textContent = error.message;
      errorPanel.hidden = false;
      errorPanel.focus();
      announcement.textContent = 'Request rejected. Last valid observation and history are unchanged.';
    }
  });

  byId('reset-lesson').addEventListener('click', () => {
    form.reset();
    session = lesson.createSession();
    clearError();
    render();
    announcement.textContent = 'Lesson reset. Controls restored and history cleared; no external cleanup was needed.';
    byId('check-mode').focus();
  });

  render();
}());
