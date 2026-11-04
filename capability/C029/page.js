(function () {
  'use strict';
  const evaluator = globalThis.C029Evaluator;
  const element = (id) => document.getElementById(id);
  const history = [];
  let busy = false;
  const actions = ['inspect', 'compare', 'load-copy', 'inspect-copy'];
  const text = (tag, value) => {
    const node = document.createElement(tag);
    node.textContent = value;
    return node;
  };
  const number = (value) => value === null || value === undefined ? 'NOT SAVED - UNKNOWN' : String(value);
  function controls() {
    for (const id of actions) element(id).disabled = busy || history.length >= 16 || !evaluator;
    for (const id of ['source-id', 'candidate', 'reset']) element(id).disabled = busy;
    element('history-limit').textContent = history.length >= 16 ?
      '16 operations retained. Further evaluations are refused, not dropped; reset does not erase history.' : '';
  }
  function clear() {
    for (const id of ['originals', 'events', 'comparison', 'provenance', 'model', 'replacement']) element(id).replaceChildren();
    element('counts').textContent = 'No verified denominator yet.';
    element('source-banner').textContent = 'No evaluated source. Missing observations are UNKNOWN, not successful.';
    element('error').textContent = '';
  }
  function render(report) {
    clear();
    const comparison = report.before && report.after;
    const assessed = comparison ? report.after : report;
    element('status').textContent = `${assessed.decision}: ${assessed.valid ? assessed.evaluationScope : 'rejected copy/input; no success or authority adopted'}. UI verification PASS is not user journey success.`;
    element('status').dataset.decision = assessed.decision;
    element('status').dataset.valid = String(assessed.valid);
    element('error').textContent = assessed.code || '';
    element('counts').textContent = `${assessed.counts.originals} originals: ${assessed.counts.pass} PASS / ${assessed.counts.fail} FAIL / ${assessed.counts.unknown} UNKNOWN. Success fraction ${assessed.successFraction.numerator}/${assessed.successFraction.denominator}; not availability or an SLA.`;
    for (const original of assessed.originals) {
      const item = document.createElement('li');
      item.dataset.original = original.attemptId;
      item.dataset.verdict = original.verdict;
      item.dataset.latency = original.latencyVerdict;
      item.dataset.state = original.stateVerdict;
      item.dataset.terminal = original.terminalVerdict;
      item.append(text('strong', `${original.attemptId}: ${original.verdict}`),
        text('p', `Latency ${original.latencyVerdict}; state ${original.stateVerdict}; required terminal ${original.terminalVerdict}.`),
        text('p', `Original budget ${number(original.budgetMs)} ms; start ${number(original.startedAt)}; deadline ${number(original.deadline)}; end ${number(original.endedAt)}; elapsed ${number(original.elapsedMs)} ms; held ${number(original.pausedMs)} ms.`));
      if (original.requests !== undefined) item.append(text('p', `${number(original.requests)} requests / ${number(original.responses)} responses. ${original.classification}.`));
      item.append(text('p', original.reasonCodes.join(' / ') || 'Exact compatible local segment within its own original deadline; not a full user journey.'));
      const details = document.createElement('details');
      details.append(text('summary', 'Inspect exact original state and observed versions'),
        text('pre', JSON.stringify(original, null, 2)));
      item.append(details);
      element('originals').append(item);
    }
    const acknowledgements = new Map();
    for (const event of assessed.events || []) {
      let version = 'NOT OBSERVED (action/request only)';
      if (event.code === 'ACTUAL_READ_ACKNOWLEDGED') {
        const ordinal = acknowledgements.get(event.attemptId) || 0;
        const original = assessed.originals.find((row) => row.attemptId === event.attemptId);
        const reply = original?.acknowledgements[ordinal];
        version = reply ? `${reply.stamp.implementationVersion} / ${reply.stamp.deploymentStamp} / ${reply.profile.id} / ${reply.apiContract}` : 'NOT SAVED - UNKNOWN';
        acknowledgements.set(event.attemptId, ordinal + 1);
      }
      const row = document.createElement('tr');
      row.dataset.original = event.attemptId;
      row.dataset.action = event.code;
      for (const value of [event.attemptId, event.code, `${number(event.at)} / ${number(event.elapsedMs)}`, version]) row.append(text('td', value));
      element('events').append(row);
    }
    if (comparison) {
      element('comparison').append(text('p', report.provenance),
        text('p', `Before retry: ${report.before.decision}, ${report.before.counts.originals} original; after retry: ${report.after.decision}, ${report.after.counts.originals} originals. First original remains FAIL; second PASS cannot repair it.`));
    }
    element('replacement').textContent = assessed.replacementScope || '';
    const provenance = assessed.provenance || { kind: 'rejected/no source authority' };
    element('source-banner').textContent = assessed.sourceConsistentHistorical ?
      'HISTORICAL SOURCE: exact bundled accepted C033 actual saved observations; this is not a new client/network/disk run.' :
      provenance.kind === 'closed-synthetic-C023-event-log-model' ?
        'PURE MODEL ONLY: C023 state pass is not a latency, durable, queue or actual external-effect pass.' :
        provenance.kind === 'closed-synthetic-control-not-historical-observation' ?
          'SYNTHETIC CONTROL ONLY: unchanged driver/contract, explicit synthetic clock; not actual HTTP/browser journey evidence.' :
          'REJECTED/UNBOUND: supplied source, hash or verdict has no authority.';
    element('provenance').textContent = JSON.stringify(provenance, null, 2);
    if (assessed.modelCurrent) element('model').textContent = JSON.stringify({
      atomicPairAssumption: provenance.atomicPairAssumption,
      current: assessed.modelCurrent, plan: assessed.modelPlan, journal: assessed.modelJournal,
      meaning: assessed.modelStatePassMeans
    }, null, 2);
  }
  async function perform(action, operation) {
    if (busy || history.length >= 16 || !evaluator) return;
    busy = true;
    controls();
    clear();
    element('status').dataset.decision = 'HOLD';
    element('status').textContent = 'Evaluating only the selected closed evidence scope; no live journey.';
    let report;
    try { report = await operation(); }
    catch (error) {
      report = evaluator.evaluateSaved('');
      report = { ...report, code: error.code || 'UI_EVALUATION_UNAVAILABLE' };
    }
    render(report);
    const assessed = report.after || report;
    const entry = Object.freeze({
      action, sourceId: assessed.savedId || assessed.controlId || element('source-id').value || 'none', valid: assessed.valid,
      decision: assessed.decision, code: assessed.code, originals: assessed.counts.originals
    });
    history.push(entry);
    const item = text('li', `${history.length}. ${entry.action} / ${entry.sourceId}: ${entry.decision}; ${entry.originals} originals${entry.code ? ` / ${entry.code}` : ''}`);
    item.dataset.decision = entry.decision;
    element('inspection-history').append(item);
    busy = false;
    controls();
  }
  if (!evaluator) {
    element('status').dataset.decision = 'HOLD';
    element('error').textContent = 'ACCEPTED_DEPENDENCIES_UNAVAILABLE';
    controls();
    return;
  }
  element('inspect').addEventListener('click', () => perform('inspect', () => {
    const id = element('source-id').value;
    return evaluator.savedIds.includes(id) ? evaluator.evaluateSaved(id) :
      evaluator.controlIds.includes(id) ? evaluator.evaluateControl(id) :
        evaluator.modelIds.includes(id) ? evaluator.evaluateModel(id) : evaluator.evaluateSaved(id);
  }));
  element('compare').addEventListener('click', () => perform('compare synthetic retry', () => evaluator.compareRetry()));
  element('load-copy').addEventListener('click', () => {
    if (busy || history.length >= 16) return;
    const id = element('source-id').value;
    if (!evaluator.savedIds.includes(id)) {
      perform('load rejected copy', () => evaluator.evaluateSaved(id));
      return;
    }
    clear();
    element('candidate').value = evaluator.savedJson(id);
    element('status').dataset.decision = 'HOLD';
    element('status').textContent = 'Saved JSON copy loaded, not evaluated, adopted or executed.';
  });
  element('inspect-copy').addEventListener('click', () => perform('inspect copy', () =>
    evaluator.evaluateCandidate(element('candidate').value, element('source-id').value)));
  for (const id of ['candidate', 'source-id']) element(id).addEventListener('input', () => {
    if (busy) return;
    clear();
    element('status').dataset.decision = 'HOLD';
    element('status').textContent = 'Input changed: previous result invalidated. Not evaluated; no success adopted.';
  });
  element('reset').addEventListener('click', () => {
    if (busy) return;
    clear();
    element('source-id').value = '';
    element('candidate').value = '';
    element('status').dataset.decision = 'UNASSESSED';
    element('status').textContent = 'Display reset only. Originals and evaluation/error history are not repaired or erased.';
    element('source-id').focus();
    controls();
  });
  controls();
}());
