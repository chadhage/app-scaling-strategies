(function () {
  'use strict';

  const model = globalThis.S072;
  const byId = (id) => document.getElementById(id);
  const form = byId('controls');
  const error = byId('error');
  let session = model.createSession();
  const numericFields = ['requests', 'keys', 'dbCapacity', 'refillMs', 'budgetMs', 'refillLimit'];
  const allFields = ['strategy', ...numericFields, 'observation'];

  function clearError() {
    error.hidden = true;
    error.textContent = '';
    allFields.forEach((id) => {
      byId(id).removeAttribute('aria-invalid');
      byId(id).removeAttribute('aria-describedby');
    });
  }

  function readConfig() {
    const config = { strategy: byId('strategy').value, observation: byId('observation').value };
    numericFields.forEach((id) => {
      const value = byId(id).value;
      if (!/^[1-9]\d*$/.test(value)) {
        const invalid = new TypeError(`Invalid ${id}: use a whole decimal integer within its displayed range.`);
        invalid.field = id;
        throw invalid;
      }
      config[id] = Number(value);
    });
    return config;
  }

  function row(body, values) {
    const tr = document.createElement('tr');
    values.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      tr.appendChild(cell);
    });
    body.appendChild(tr);
  }

  function render() {
    const latest = session.history.at(-1);
    byId('latest').hidden = !latest;
    ['history', 'refills', 'journeys'].forEach((id) => byId(id).replaceChildren());
    const totals = session.totals;
    byId('totals').textContent = `Session: ${totals.attempted} attempted; ${totals.success} success; ${totals.failure} failure; ${totals.unknown} unknown.`;
    const capped = session.history.length >= model.MAX_RUNS;
    byId('run').disabled = capped;
    byId('limit-note').textContent = capped
      ? '12 runs retained. Reset explicitly before another burst; no earlier result was dropped.'
      : `${session.history.length} of 12 runs retained in this page's memory. Reload or explicit Reset clears this session.`;
    session.history.forEach(({ id, result }) => {
      const { config, data, counts } = result;
      row(byId('history'), [id, `${config.strategy} / ${config.observation}`,
        `${config.requests} / ${config.keys}`, `${config.dbCapacity} / ${config.refillLimit}`,
        `${config.refillMs} / ${config.budgetMs}`, `${data.attempted} / ${data.rejected} / ${data.peakActive}`,
        result.maxObservedLatencyMs === null ? 'Unknown' : result.maxObservedLatencyMs,
        counts.success, counts.failure, counts.unknown, result.verdict]);
    });
    if (!latest) {
      ['attempted', 'success', 'failure', 'unknown', 'db-attempted', 'db-peak', 'db-rejected'].forEach((id) => { byId(id).textContent = '0'; });
      byId('latency').textContent = 'Not observed';
      byId('interpretation').textContent = '';
      byId('status').textContent = 'No burst run. Choose a strategy and run the synthetic burst.';
      return;
    }
    const { result, id } = latest;
    const { data, counts } = result;
    ['attempted', 'success', 'failure', 'unknown'].forEach((key) => { byId(key).textContent = String(counts[key]); });
    byId('db-attempted').textContent = String(data.attempted);
    byId('db-peak').textContent = String(data.peakActive);
    byId('db-rejected').textContent = String(data.rejected);
    byId('latency').textContent = result.maxObservedLatencyMs === null ? 'Unknown' : `${result.maxObservedLatencyMs} ms`;
    byId('status').textContent = `Run ${id}: ${result.verdict}. ${counts.success} success; ${counts.failure} failure; ${counts.unknown} unknown of ${counts.attempted} attempted.`;
    byId('interpretation').textContent = result.stampede
      ? `Database-overloading stampede: ${data.rejected} refill attempts were rejected. These journey failures remain counted.`
      : result.verdict === 'failure'
        ? 'No database overload, but journey latency exceeded the original budget. Avoiding a stampede alone is not success.'
        : result.verdict === 'unknown'
          ? 'No known overload or deadline failure, but missing latency evidence prevents a successful result.'
          : 'All declared synthetic journeys met their original budget; this is not a live Azure result.';
    result.refills.forEach((refill) => row(byId('refills'),
      [refill.id, refill.key, refill.startMs, refill.endMs, refill.status]));
    result.journeys.forEach((journey) => row(byId('journeys'),
      [journey.id, journey.key, journey.refillId, journey.refillStartMs,
        journey.latencyMs === null ? 'Unknown' : journey.latencyMs, journey.outcome, journey.reason]));
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    try {
      session = model.runBurst(session, readConfig());
      render();
    } catch (failure) {
      error.textContent = `${failure.message} No run was added; retained results are unchanged.`;
      error.hidden = false;
      const field = allFields.includes(failure.field) ? byId(failure.field) : error;
      if (field !== error) {
        field.setAttribute('aria-invalid', 'true');
        field.setAttribute('aria-describedby', 'error');
      }
      field.focus();
    }
  });

  byId('restart').addEventListener('click', () => {
    session = model.resetSession(session);
    form.reset();
    clearError();
    render();
    byId('strategy').focus();
  });
  render();
}());
