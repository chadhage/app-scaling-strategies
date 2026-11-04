'use strict';

(() => {
  const form = document.getElementById('observe-form');
  const traceChoice = document.getElementById('trace-choice');
  const actionChoice = document.getElementById('action-choice');
  const output = document.getElementById('current-output');
  const history = document.getElementById('history-output');
  const totals = document.getElementById('totals');
  const error = document.getElementById('error-output');
  let state = S116.createState();

  const element = (tag, text) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const observed = (value) => value === null ? 'unknown (unobserved)' : String(value);

  function table(parent, caption, headings, rows) {
    const wrap = element('div');
    wrap.className = 'table-wrap';
    const node = element('table');
    node.append(element('caption', caption));
    const header = element('tr');
    for (const heading of headings) {
      const cell = element('th', heading);
      cell.scope = 'col';
      header.append(cell);
    }
    const head = element('thead');
    head.append(header);
    node.append(head);
    const body = element('tbody');
    for (const row of rows) {
      const line = element('tr');
      for (const value of row) line.append(element('td', observed(value)));
      body.append(line);
    }
    node.append(body);
    wrap.append(node);
    parent.append(wrap);
  }

  function renderObservation(parent, entry) {
    const { result } = entry;
    const heading = element('p', `Observation ${entry.id}: ${result.overall.toUpperCase()} - ${result.note}`);
    heading.className = result.overall;
    heading.dataset.overall = result.overall;
    parent.append(heading);
    parent.append(element('p', `Declared single writer: region-one. Observed synthetic writer target: ${observed(result.observedWriter)}. Multi-writer support: not supported by this fixture.`));
    table(parent, 'Fixed regional serving measurements', ['Serving origin', 'Fictional journey', 'Outcome', 'Synthetic ms'],
      result.serving.map((row) => [row.region, row.journey, row.status, row.durationMs]));
    if (result.routes) {
      table(parent, 'Observed synthetic write routes', ['Serving origin', 'Writer target', 'Route'],
        result.routes.map((row) => [row.servingRegion, row.targetWriter, row.route]));
    } else {
      parent.append(element('p', 'Write routes: unknown (unobserved); serving alone is not writer proof.'));
    }
    if (result.write) {
      const write = result.write;
      table(parent, 'Synthetic mutation observation', ['Measurement', 'Value'], [
        ['Requested writer target', write.targetWriter], ['Required epoch', write.expectedEpoch],
        ['Observed epoch', write.observedEpoch], ['Expected revision', write.expectedRevision],
        ['Current revision', write.currentRevision], ['Mutation outcome', write.status],
        ['Committed effects', write.effects], ['Committed revision', write.committedRevision],
        ['Synthetic duration ms', write.durationMs],
      ]);
      table(parent, 'Observed synthetic reader consistency', ['Reader', 'Revision', 'Client minimum', 'Replication lag synthetic ms', 'Read synthetic ms'],
        result.reads.map((row) => [row.region, row.revision, row.requiredRevision, row.replicationLagMs, row.durationMs]));
    } else {
      parent.append(element('p', 'Mutation and post-commit reader observations: unknown (unobserved).'));
    }
    const checks = element('ul');
    for (const check of result.checks) {
      const item = element('li', `${check.id}: ${check.status.toUpperCase()} - ${check.detail}`);
      item.dataset.check = check.id;
      item.dataset.result = check.status;
      checks.append(item);
    }
    parent.append(checks);
  }

  function render() {
    const summary = S116.summarize(state);
    totals.textContent = `Recorded ${summary.used}/12 | Positive ${summary.positive} | Negative ${summary.negative} | Unknown ${summary.unknown} | Remaining ${summary.remaining}`;
    output.replaceChildren();
    if (state.currentId === null) {
      output.append(element('p', 'No observation yet. Choose an action and record.'));
    } else {
      renderObservation(output, state.history[state.currentId - 1]);
    }
    history.replaceChildren();
    for (const entry of state.history) {
      const item = element('li');
      item.dataset.recordId = entry.id;
      const details = element('details');
      details.append(element('summary', `Observation ${entry.id}: ${entry.result.overall.toUpperCase()} - ${S116.scenarioLabels[entry.input.scenarioId]} / ${S116.actionLabels[entry.input.actionId]}`));
      renderObservation(details, entry);
      item.append(details);
      history.append(item);
    }
  }

  function clearError() {
    error.hidden = true;
    error.textContent = '';
  }

  function showError(problem) {
    error.textContent = `Observation not recorded: ${problem.message}`;
    error.hidden = false;
    error.focus();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const next = S116.record(state, { scenarioId: traceChoice.value, actionId: actionChoice.value });
      state = next;
      clearError();
      render();
    } catch (problem) {
      showError(problem);
    }
  });
  document.getElementById('restart-button').addEventListener('click', () => {
    try {
      state = S116.reset(state);
      form.reset();
      clearError();
      render();
      traceChoice.focus();
    } catch (problem) {
      showError(problem);
    }
  });
  render();
})();
