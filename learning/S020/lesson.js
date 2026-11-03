'use strict';

(() => {
  const lesson = globalThis.S020Lesson;
  const element = (id) => document.getElementById(id);
  const form = element('settings');
  const history = [];
  let run = lesson.createRun();
  let runId = 1;
  let pruned = 0;

  function node(tag, text) {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    return result;
  }

  function clearError() {
    element('error').hidden = true;
    element('error').textContent = '';
  }

  function reportError(error) {
    element('error').textContent = `${error.code || 'ERR_S020_INPUT'}: ${error.message}`;
    element('error').hidden = false;
    element('error').focus();
  }

  function appendSamples(body, current) {
    for (const sample of current.samples) {
      const row = node('tr');
      for (const value of [sample.id, sample.probe, sample.fixture, sample.route,
        sample.httpStatus ?? 'Unknown', sample.latencyMs ?? 'Unknown',
        sample.businessCorrect === null ? 'Unknown' : 'Correct', sample.outcome]) {
        row.append(node('td', String(value)));
      }
      body.append(row);
    }
  }

  function appendTrace(list, current) {
    for (const event of current.trace) {
      list.append(node('li', `${event.action}: ${event.message} Requested ${event.requestedTotal}; `
        + `allocated ${event.allocatedTotal}; reserved ${event.reservedUnits}; route ${event.route}.`));
    }
  }

  function renderHistory() {
    element('history').replaceChildren();
    for (const archived of history) {
      const summary = lesson.summarize(archived.run);
      const article = node('article');
      article.className = 'archived-run';
      article.dataset.runId = String(archived.id);
      article.dataset.verdict = summary.verdict;
      article.append(node('h3', `Run ${archived.id}: ${summary.verdict}`));
      article.append(node('p', `${summary.attemptedExisting} attempted; ${summary.successfulExisting} successful; `
        + `${summary.failedExisting} failed; ${summary.unknownExisting} unknown. ${summary.userOutcome}.`));
      article.append(node('p', `Allowance ${archived.run.config.allowance}; requested ${archived.run.requestedTotal}; `
        + `allocated ${archived.run.allocatedTotal}; reserve ${archived.run.reservedUnits}; `
        + `${summary.unsupportedNewJourneysPerWindow} unsupported new journeys/window. `
        + `${summary.nativeAzureQuota}. Cleanup: ${summary.cleanup}.`));
      const details = node('details');
      details.append(node('summary', 'Inspect retained trace and journey samples'));
      const trace = node('ol');
      appendTrace(trace, archived.run);
      details.append(trace);
      const table = node('table');
      table.append(node('caption', `Run ${archived.id} synthetic observations`));
      const head = node('thead');
      const headers = node('tr');
      for (const label of ['ID', 'Probe', 'Fixture', 'Route', 'HTTP', 'Latency ms', 'State/effect', 'Outcome']) {
        headers.append(node('th', label));
      }
      head.append(headers);
      const body = node('tbody');
      appendSamples(body, archived.run);
      table.append(head, body);
      const wrap = node('div');
      wrap.className = 'table-wrap';
      wrap.append(table);
      details.append(wrap);
      article.append(details);
      element('history').append(article);
    }
    element('history-count').textContent = String(history.length);
    element('pruned-count').textContent = String(pruned);
  }

  function render() {
    const summary = lesson.summarize(run);
    const values = {
      'run-id': runId,
      'declared-allowance': run.config.allowance,
      'requested-total': run.requestedTotal,
      'allocated-total': run.allocatedTotal,
      'reserved-units': run.reservedUnits,
      'rejection-source': summary.rejectionSource,
      promotion: run.promotion,
      route: run.route,
      'unsupported-units': summary.unsupportedUnits,
      'unsupported-journeys': summary.unsupportedNewJourneysPerWindow,
      'withheld-journeys': summary.withheldSandboxJourneysPerWindow,
      'promoted-journeys': summary.promotedNewJourneys,
      verdict: summary.verdict,
      reason: summary.reason,
      attempted: summary.attemptedExisting,
      successful: summary.successfulExisting,
      failed: summary.failedExisting,
      unknown: summary.unknownExisting,
      'user-outcome': summary.userOutcome,
      cleanup: summary.cleanup,
      'native-quota': summary.nativeAzureQuota
    };
    for (const [id, value] of Object.entries(values)) element(id).textContent = String(value);
    element('results').dataset.verdict = summary.verdict;
    element('configuration-fields').disabled = run.exhausted;
    element('configuration-status').textContent = `${run.exhausted ? 'Locked' : 'Applied'} envelope: `
      + `${run.config.allowance} total units, ${run.config.extraUnits} unsafe extra units, ${run.config.budgetMs} ms budget.`;
    element('exhaust').disabled = run.exhausted;
    element('unsafe-expansion').disabled = !run.exhausted || Boolean(run.rejection);
    element('promote').disabled = !run.rejection || run.promotion === 'blocked';
    element('probe').disabled = run.promotion !== 'blocked' || run.probes >= lesson.LIMITS.probes;
    element('samples').replaceChildren();
    appendSamples(element('samples'), run);
    element('trace').replaceChildren();
    appendTrace(element('trace'), run);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (run.trace.length) throw new Error('Configuration is locked after the first action; archive/reset to change it.');
      if (!form.checkValidity()) {
        throw new Error('Use whole numbers: allowance 3-6, extra units 1-3, budget 100-500 ms. No configuration was changed.');
      }
      const configured = lesson.createRun({
        allowance: Number(element('allowance').value),
        extraUnits: Number(element('extra-units').value),
        budgetMs: Number(element('budget-ms').value)
      });
      run = configured;
      clearError();
      render();
      element('status').textContent = 'Configuration applied. Exhaust the sandbox allowance to start.';
      element('exhaust').focus();
    } catch (error) {
      reportError(error);
    }
  });

  for (const action of ['exhaust', 'unsafe-expansion', 'promote', 'probe']) {
    element(action).addEventListener('click', () => {
      try {
        run = lesson.act(run, action, action === 'probe' ? element('observation').value : undefined);
        clearError();
        render();
        element('status').textContent = `${run.trace.at(-1).message} Verifier: ${lesson.summarize(run).verdict}.`;
        if (action === 'exhaust') element('unsafe-expansion').focus();
        else if (action === 'unsafe-expansion') element('promote').focus();
        else if (action === 'promote') element('observation').focus();
        else if (run.probes === lesson.LIMITS.probes) element('archive-run').focus();
      } catch (error) {
        reportError(error);
      }
    });
  }

  element('archive-run').addEventListener('click', () => {
    if (run.trace.length) {
      history.unshift({ id: runId, run });
      if (history.length > lesson.LIMITS.archives) {
        history.pop();
        pruned += 1;
      }
    }
    runId += 1;
    run = lesson.createRun();
    HTMLFormElement.prototype.reset.call(form);
    element('observation').value = 'healthy';
    clearError();
    render();
    renderHistory();
    element('status').textContent = 'New default run: UNKNOWN, zero observations. Earlier nonempty runs remain in bounded page-memory history.';
    element('allowance').focus();
  });

  render();
  renderHistory();
})();
