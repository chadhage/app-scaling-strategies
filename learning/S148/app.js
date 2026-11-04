'use strict';

(() => {
  const model = globalThis.S148Model;
  const form = document.getElementById('lesson-controls');
  const selection = document.getElementById('packet-selection');
  const confirmation = document.getElementById('confirmation');
  const notice = document.getElementById('notice');
  const errorBox = document.getElementById('error');
  const inspectionBox = document.getElementById('inspection');
  const counts = document.getElementById('counts');
  const resultsBody = document.querySelector('#results tbody');
  const historyBox = document.getElementById('history');
  const lesson = model && typeof model.createLesson === 'function' ? model.createLesson() : null;
  let inspectionId = null;

  function node(tag, value) {
    const element = document.createElement(tag);
    if (value !== undefined) element.textContent = String(value);
    return element;
  }

  function error(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    errorBox.focus();
  }

  function announce(message) {
    errorBox.hidden = true;
    errorBox.textContent = '';
    notice.textContent = message;
  }

  function count(label, value, key) {
    const term = node('dt', label);
    const description = node('dd', value);
    description.dataset.count = key;
    counts.append(term, description);
  }

  function render(snapshot) {
    const summary = snapshot.summary;
    counts.replaceChildren();
    count('Transition events', `${summary.measuredTransitionEvents} measured / ${summary.declaredTransitionEvents} declared`, 'transitions');
    count('Original journeys', `${summary.measuredOriginalJourneys} measured / ${summary.declaredOriginalJourneys} fixed; ${summary.unmeasuredOriginalJourneys} unmeasured`, 'journeys');
    count('Request observations (not journeys)', `${summary.requests} records / ${summary.http200Requests} HTTP 200`, 'requests');
    count('Intended movement', `${summary.movement.observed} observed / ${summary.movement.unchanged} unchanged / ${summary.movement.contrary} contrary / ${summary.movement.unknown} unknown`, 'movement');
    count('Terminal completions', `${summary.completions.successful} successful / ${summary.completions.failed} failed / ${summary.completions.unknown} unknown`, 'completions');
    count('Whole original journeys', `${summary.wholeJourneys.uninterrupted} uninterrupted / ${summary.wholeJourneys.failed} failed / ${summary.wholeJourneys.interrupted} interrupted / ${summary.wholeJourneys['over-budget']} over-budget / ${summary.wholeJourneys.unknown} unknown`, 'whole');
    count('Successful intended migrations', summary.successfulMigrations, 'migration-success');
    count('Unchanged successful journeys (not migrated)', summary.unchangedSuccessfulJourneys, 'unchanged-success');
    resultsBody.replaceChildren();
    for (const result of snapshot.results) {
      const row = node('tr');
      row.dataset.case = result.caseId;
      const whole = result.wholeJourney;
      const values = [
        result.original.journeyId, result.movement, whole.completion, whole.outcome,
        `${whole.interruption}; retained unknown: ${whole.retainedUnknown ? 'yes' : 'no'}`,
        `${whole.budget.elapsedMs === null ? 'unknown' : whole.budget.elapsedMs} / ${whole.budget.originalMs} ms (${whole.budget.status})`,
        result.successfulMigration ? 'yes' : 'no',
      ];
      values.forEach((value, index) => {
        const cell = node(index === 0 ? 'th' : 'td', value);
        if (index === 0) cell.scope = 'row';
        row.append(cell);
      });
      resultsBody.append(row);
    }
    historyBox.replaceChildren();
    if (!snapshot.history.length) historyBox.append(node('li', 'No measurements yet.'));
    for (const entry of snapshot.history) {
      const item = node('li');
      item.dataset.measurement = String(entry.measurement);
      item.append(node('p', `Measurement ${entry.measurement}, run ${entry.generation}, ${entry.selection}: ${entry.summary.measuredOriginalJourneys} original journeys, ${entry.summary.successfulMigrations} successful migration(s), ${entry.summary.unchangedSuccessfulJourneys} unchanged success(es).`));
      const details = node('details');
      details.append(node('summary', 'Retained original outcomes, interruption, uncertainty and budgets'));
      details.append(node('pre', JSON.stringify(entry.results.map((result) => ({
        journeyId: result.original.journeyId, movement: result.movement,
        successfulMigration: result.successfulMigration, wholeJourney: result.wholeJourney,
      })), null, 2)));
      item.append(details);
      historyBox.append(item);
    }
  }

  function inspectPacket(packet) {
    const article = node('article');
    article.dataset.packet = packet.id;
    article.append(node('h3', `${packet.id} · ${packet.label}`), node('p', packet.note));
    const original = packet.original;
    article.append(node('p', `Original user ${original.userId}; journey ${original.journeyId}; attempt ${original.attemptId}; correlation ${original.correlationId}; transition ${original.transition.id} at ${original.transition.startedAtMs}–${original.transition.endedAtMs} ms. Original start ${original.startedAtMs} ms; budget ${original.budgetMs} ms.`));
    article.append(node('p', `Required: frontend and API blue v1 → green v2. Shared data movement: not required. Requests: ${packet.requests.length} fixed HTTP 200 records, not migration evidence.`));
    const scroll = node('div');
    scroll.className = 'table-scroll';
    const table = node('table');
    table.append(node('caption', 'Fixed per-user/tier version traces; absent fields are shown as unknown'));
    const head = node('thead');
    const heading = node('tr');
    ['Tier / phase', 'User / journey / attempt', 'Correlation / transition', 'Observed time (ms)', 'Deployment / version', 'Healthy (not proof)'].forEach((value) => {
      const cell = node('th', value);
      cell.scope = 'col';
      heading.append(cell);
    });
    head.append(heading);
    const body = node('tbody');
    for (const trace of packet.traces) {
      const row = node('tr');
      [
        `${trace.tier} / ${trace.phase}`,
        `${trace.userId} / ${trace.journeyId} / ${trace.attemptId}`,
        `${trace.correlationId} / ${trace.transitionId}`,
        trace.observedAtMs === undefined ? 'unknown' : trace.observedAtMs,
        `${trace.deployment} / ${trace.version}`,
        trace.healthy === true ? 'true' : 'not true',
      ].forEach((value) => row.append(node('td', value)));
      body.append(row);
    }
    table.append(head, body);
    scroll.append(table);
    article.append(scroll);
    const details = node('details');
    details.append(node('summary', 'Inspect fixed original contract, requests, observations and terminal completion'));
    details.append(node('pre', JSON.stringify({ original, requests: packet.requests, observations: packet.observations, completion: packet.completion }, null, 2)));
    article.append(details);
    return article;
  }

  if (!lesson) {
    document.getElementById('inspect-packet').disabled = true;
    document.getElementById('measure-packet').disabled = true;
    notice.textContent = 'No fictional result has been measured. Restore the local lesson assets and reload.';
    error('Fixed fictional fixture or model assets did not load. No result can be measured.');
    return;
  }

  for (const packet of model.packets) {
    const option = node('option', `${packet.id} · ${packet.label}`);
    option.value = packet.id;
    selection.append(option);
  }

  selection.addEventListener('change', () => {
    try {
      lesson.select(selection.value);
      inspectionId = null;
      confirmation.checked = false;
      inspectionBox.replaceChildren(node('p', 'Selection changed. Inspect these records before measuring.'));
      announce('Selection changed; prior measured results and history are retained.');
    } catch (errorValue) { error(errorValue.message); }
  });

  document.getElementById('inspect-packet').addEventListener('click', () => {
    try {
      lesson.select(selection.value);
      const inspection = lesson.inspect();
      inspectionId = inspection.id;
      confirmation.checked = false;
      inspectionBox.replaceChildren(...inspection.packets.map(inspectPacket));
      announce(`Inspected ${inspection.packets.length} fixed original packet(s). Confirm before measuring; inspection is one-use.`);
    } catch (errorValue) { error(errorValue.message); }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (selection.value !== lesson.snapshot().selected) lesson.select(selection.value);
      const snapshot = lesson.measure({ approved: confirmation.checked, inspectionId });
      render(snapshot);
      announce(`Measured fixed evidence. ${snapshot.summary.successfulMigrations} successful intended migration(s); unchanged users remain separate.`);
    } catch (errorValue) { error(errorValue.message); }
  });

  document.getElementById('reset-lesson').addEventListener('click', () => {
    HTMLFormElement.prototype.reset.call(form);
    inspectionId = null;
    inspectionBox.replaceChildren(node('p', 'Current run reset. Inspect again; prior measured history is retained.'));
    render(lesson.reset());
    announce('Current run reset; prior interruptions, unknowns and original budgets remain in bounded history.');
    selection.focus();
  });

  render(lesson.snapshot());
})();
