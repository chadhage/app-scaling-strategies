'use strict';

(function mount() {
  const lesson = globalThis.WarmupLesson;
  const byId = (id) => document.getElementById(id);
  const form = byId('preparation-form');
  const inputs = ['timeout', 'ready-after', 'routing', 'receipt'].map(byId);
  let state = lesson.create();

  function numberInput(id, label) {
    const input = byId(id);
    if (!/^[1-9]\d*$/.test(input.value)) {
      input.setAttribute('aria-invalid', 'true');
      throw new TypeError(`${label} must be a whole number within its displayed range.`);
    }
    return Number(input.value);
  }

  function readConfig() {
    return {
      timeout: numberInput('timeout', 'Timeout'),
      readyAfter: numberInput('ready-after', 'Readiness delay'),
      routing: byId('routing').value,
      receipt: byId('receipt').value,
    };
  }

  const routeText = (routing) => routing ? `${routing.production}% / ${routing.candidate}%` : 'unknown (missing)';

  function render() {
    const view = lesson.inspect(state);
    byId('configuration').disabled = view.phase !== 'idle';
    byId('begin').disabled = view.phase !== 'idle';
    byId('advance').disabled = view.phase !== 'warming';
    byId('abort').disabled = view.phase !== 'warming';
    byId('phase').textContent = `Run ${view.runId}: ${view.phase}; elapsed ${view.elapsed}s; ${view.reason}. Candidate ${view.candidateEligible ? 'eligible for a separate, unexecuted migration' : 'ineligible'}.`;
    byId('verdict').textContent = `Verification verdict: ${view.verdict}.`;
    byId('user-outcome').textContent = `User-transition outcome: ${view.userOutcome}.`;
    byId('routing-result').textContent = `Routing command production/candidate: ${routeText(view.commandRouting)}. Last observed: ${routeText(view.observedRouting)}.`;
    const count = view.counts;
    byId('metrics').textContent = `Production requests attempted ${count.attempted}; successful ${count.successful}; interruptions ${count.interruptions}; unknown ${count.unknown}.`;
    byId('migration').textContent = `User migrations attempted ${view.migrations.attempted}; completed ${view.migrations.completed}. No promotion or migration control exists in this lesson.`;
    byId('preparation-error').hidden = !view.error;
    byId('preparation-error').textContent = view.error;
    const rows = view.events.map((event) => {
      const row = document.createElement('tr');
      for (const text of [
        `${event.sequence} / ${event.action}`, event.elapsed, `${event.phase} / ${event.reason}`,
        routeText(event.commandRouting), routeText(event.observedRouting), event.receipt,
      ]) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.append(cell);
      }
      return row;
    });
    byId('trace').replaceChildren(...rows);
    byId('history-summary').textContent = `Retained ${view.history.length} of 3 archived runs; evicted ${view.evicted}.`;
    const archives = view.history.map((run) => {
      const item = document.createElement('li');
      const detail = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = `Run ${run.runId}: ${run.verdict}; ${run.reason}; ${run.userOutcome}`;
      const contents = document.createElement('pre');
      contents.textContent = JSON.stringify(run, null, 2);
      detail.append(summary, contents);
      item.append(detail);
      return item;
    });
    byId('history').replaceChildren(...archives);
    return view;
  }

  function apply(operation, focus) {
    try {
      const next = operation();
      state = next;
      byId('validation-error').hidden = true;
      byId('validation-error').textContent = '';
      inputs.forEach((input) => input.removeAttribute('aria-invalid'));
      const view = render();
      if (focus) byId(focus).focus();
      else if (view.phase === 'ready' || view.phase === 'aborted') byId('results').focus();
    } catch (error) {
      const target = byId('validation-error');
      target.textContent = error.message;
      target.hidden = false;
      target.focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    apply(() => lesson.start(state, readConfig()), 'advance');
  });
  byId('advance').addEventListener('click', () => apply(() => lesson.advance(state)));
  byId('abort').addEventListener('click', () => apply(() => lesson.abort(state)));
  byId('archive-run').addEventListener('click', () => {
    apply(() => {
      const next = lesson.archiveReset(state);
      form.reset();
      return next;
    }, 'timeout');
  });
  render();
}());
