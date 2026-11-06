(function () {
  'use strict';
  const api = globalThis.C031Evaluator;
  const element = (id) => document.getElementById(id);
  const LIMIT = 16;
  const MAX_LISTED = 12;
  const history = [];
  const catalog = api ? api.create({ saved: globalThis.C031Saved, c034: globalThis.C034Saved }) : null;
  const initialStatus = 'Not evaluated. No saved set is chosen and no success is assumed.';
  const initialRate = 'No verified denominator yet.';
  const text = (tag, value) => {
    const node = document.createElement(tag);
    node.textContent = value;
    return node;
  };
  const yesNo = (value) => (value ? 'yes' : 'no');
  function evidence(row) {
    const parts = [];
    if (row.evidence) {
      const { requestAtOldVersion: old, newVersionAcknowledged: acknowledged, laterRequestOrState: later } = row.evidence;
      parts.push(`request at ${old.version} (seq ${old.seq}), acknowledged ${acknowledged.version} (seq ${acknowledged.seq}), then ${later.action} at ${later.version} (seq ${later.seq})`);
    }
    if (row.detail) parts.push(row.detail);
    if (row.traceCopies > 1) parts.push(`${row.traceCopies} saved copies of this trace`);
    parts.push(...row.notes);
    return parts.join('; ') || 'No transition evidence';
  }
  function rowElement(row) {
    const item = document.createElement('tr');
    item.dataset.client = row.clientId;
    item.dataset.classification = row.classification;
    item.dataset.failure = row.failureKind || 'NONE';
    item.dataset.reason = row.reasonCodes[0];
    const last = text('td', evidence(row));
    const details = document.createElement('details');
    details.append(text('summary', 'Inspect saved actions'), text('pre', JSON.stringify(row.events, null, 2)));
    last.append(details);
    item.append(text('td', row.clientId), text('td', row.classification), text('td', row.failureKind || 'none'),
      text('td', `${row.reasonCodes[0]}: ${row.reasonMeaning}`),
      text('td', `${row.startVersion || 'unproven'} to ${row.endVersion || 'none'}`),
      text('td', `${yesNo(row.eligible)}: ${row.eligibility}`),
      text('td', `numerator ${yesNo(row.countsInNumerator)}, denominator ${yesNo(row.countsInDenominator)}`), last);
    return item;
  }
  function controls() {
    const full = history.length >= LIMIT;
    for (const id of ['evaluate', 'compare']) element(id).disabled = full || !catalog;
    element('history-limit').textContent = full ?
      `${LIMIT} operations retained. Further evaluations are refused, not dropped; reset does not erase history.` : '';
  }
  function clear() {
    for (const id of ['clients', 'comparison']) element(id).replaceChildren();
    for (const id of ['numerator', 'denominator', 'counts', 'provenance', 'error']) element(id).textContent = '';
    element('rate').textContent = initialRate;
  }
  function render(report) {
    clear();
    const { successRate: rate, counts } = report;
    element('status').dataset.state = report.valid ? 'EVALUATED' : 'REJECTED';
    element('error').textContent = report.code || '';
    if (!report.valid) {
      element('status').textContent = 'Rejected: nothing is adopted and no success rate is shown.';
      element('rate').textContent = 'No success rate: rejected input or unknown saved set.';
      return;
    }
    element('status').textContent = `Evaluated ${report.fleetId}: ${rate.numerator} of ${rate.denominator} eligible clients made an actual acknowledged transition. UI verification only, not a live migration.`;
    element('rate').textContent = rate.denominator ? `Migration success rate: ${rate.numerator} of ${rate.denominator} = ${rate.percent}` :
      'Migration success rate: not defined (0 of 0 eligible clients, never 100 percent)';
    element('numerator').textContent = `Numerator ${rate.numerator}: clients with an ACTUAL_TRANSITION, an acknowledged old-to-new version change in its required order.`;
    element('denominator').textContent = `Denominator ${rate.denominator}: eligible clients that started on the old version ${api.versions.old.implementationVersion}, plus clients whose start cannot be proven (never excluded).`;
    element('counts').textContent = `Next to the rate: unchanged ${counts.unchanged} (new version only, outside the rate) | failed ${counts.failed} | unknown ${counts.unknown} | not transitioned yet ${counts.notTransitionedYet} | ${counts.clients} clients in the set`;
    for (const row of report.clients) element('clients').append(rowElement(row));
    element('provenance').textContent = JSON.stringify({ scope: report.scope, savedId: report.savedId, provenance: report.provenance }, null, 2);
  }
  function renderComparison(result) {
    const box = element('comparison');
    if (!result.valid) {
      box.append(text('p', `Comparison unavailable: ${result.code}.`));
      return;
    }
    const line = (side) => `${side.savedId}: ${side.numerator} of ${side.denominator} = ${side.percent}`;
    box.append(text('p', `Baseline ${line(result.before)}. This set ${line(result.after)}. Rate raised: ${result.rateRaised ? 'YES' : 'no'}. Numerator increased: ${result.numeratorIncreased ? 'YES' : 'no'}. Decision: ${result.decision}.`));
    const list = document.createElement('ul');
    for (const change of result.changedClients.slice(0, MAX_LISTED)) {
      list.append(text('li', `${change.change} ${change.clientId}: ${change.classification} / ${change.reasonCodes[0]}${change.traceCopies > 1 ? ` (${change.traceCopies} saved trace copies)` : ''}${change.eligible ? '' : ' (not eligible, outside the rate)'}`));
    }
    box.append(list);
    if (result.changedClients.length > MAX_LISTED) {
      box.append(text('p', `${result.changedClients.length - MAX_LISTED} more changed or added clients are in the table above.`));
    }
  }
  function perform(action) {
    if (history.length >= LIMIT || !catalog) return;
    const id = element('source-id').value;
    const report = catalog.evaluateSaved(id);
    render(report);
    if (action === 'compare') renderComparison(catalog.compare(id));
    const { successRate: rate, counts } = report;
    history.push(action);
    const item = text('li', `${history.length}. ${action} / ${id || 'none'}: ${report.valid ?
      `${rate.fraction} = ${rate.percent || 'not defined'}, unchanged ${counts.unchanged}, failed ${counts.failed}, unknown ${counts.unknown}` :
      `rejected ${report.code}`}`);
    item.dataset.state = report.valid ? 'EVALUATED' : 'REJECTED';
    element('inspection-history').append(item);
    controls();
  }
  if (!catalog) {
    element('status').dataset.state = 'REJECTED';
    element('error').textContent = 'ACCEPTED_DEPENDENCIES_UNAVAILABLE';
    controls();
    return;
  }
  element('evaluate').addEventListener('click', () => perform('evaluate'));
  element('compare').addEventListener('click', () => perform('compare'));
  element('reset').addEventListener('click', () => {
    clear();
    element('status').dataset.state = 'UNASSESSED';
    element('status').textContent = initialStatus;
    element('source-id').focus();
  });
  controls();
}());
