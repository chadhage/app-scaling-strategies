(function lesson() {
  'use strict';
  const model = globalThis.ShardLesson;
  const byId = (id) => document.getElementById(id);
  const form = byId('rehearsal-form');
  const error = byId('input-error');
  const fields = {
    initialCommitted: byId('initial-committed'),
    writesDuringCopy: byId('writes-during-copy'),
    assignment: byId('assignment'),
    synchronization: byId('synchronization'),
    ownership: byId('ownership'),
  };
  let state = model.createState();
  const display = (value) => value === null ? 'Unknown / not probed' : String(value);
  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }
  function clearErrors() {
    error.hidden = true;
    error.textContent = '';
    Object.values(fields).forEach((field) => field.removeAttribute('aria-invalid'));
  }
  function fail(message, field) {
    error.textContent = message;
    error.hidden = false;
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    } else error.focus();
  }
  function readConfig() {
    const raw = {};
    for (const [key, field] of Object.entries(fields)) {
      if (key === 'initialCommitted' || key === 'writesDuringCopy') {
        const maximum = key === 'initialCommitted' ? 6 : 3;
        if (!/^[1-9]\d*$/.test(field.value) || Number(field.value) > maximum) {
          fail(`${key === 'initialCommitted' ? 'Snapshot effects' : 'Additional source commits'} must be a whole number from 1 to ${maximum}. Earlier results are unchanged.`, field);
          return null;
        }
        raw[key] = Number(field.value);
      } else {
        raw[key] = field.value;
      }
    }
    try { return model.normalizeConfig(raw); } catch (cause) {
      const key = Object.keys(fields).find((name) => cause.message.startsWith(name));
      fail(`Unsupported control value: ${cause.message}. Earlier results are unchanged.`, fields[key]);
      return null;
    }
  }
  function render() {
    byId('attempt-count').textContent = `${state.history.length} / ${model.MAX_ATTEMPTS}`;
    byId('history').replaceChildren(...state.history.map((result) => {
      const row = document.createElement('tr');
      const cells = [
        result.attempt, `${result.config.assignment}; ${result.config.synchronization}; ${result.config.ownership}`,
        result.verdict.toUpperCase(), display(result.metrics.missingCommitted),
        display(result.metrics.candidateWriters), result.route, result.metrics.newWriteEffects,
      ];
      cells.forEach((value) => row.append(element('td', String(value))));
      return row;
    }));
    const result = state.history.at(-1);
    byId('metrics').replaceChildren();
    if (!result) {
      byId('verdict').textContent = 'Not run — choose a condition and run the rehearsal.';
      byId('verdict').removeAttribute('data-verdict');
      byId('handoff').textContent = 'Route: shard-a. Active writer: shard-a epoch 1.';
      byId('gates').replaceChildren(element('li', 'No gates evaluated yet.'));
      byId('effect-inventory').textContent = 'No candidate observation yet.';
      byId('trace').replaceChildren(element('li', 'No rehearsal yet.'));
      byId('user-impact').textContent = 'No live-user result is measured.';
      return;
    }
    byId('verdict').dataset.verdict = result.verdict;
    byId('verdict').textContent = `${result.verdict.toUpperCase()} — ${result.assignmentAllowed ? 'modeled assignment allowed' : 'assignment blocked; source retained'}.`;
    byId('handoff').textContent = `Route: ${result.route}. Active writer: ${result.activeWriters.join(', ')} epoch ${result.writerEpoch}.`;
    const metricLabels = {
      requiredCommitted: 'Required committed effects',
      copiedCommitted: 'Copied snapshot effects',
      missingCommitted: 'Missing committed effects at gate',
      candidateWriters: 'Candidate writer owners (proposal)',
      newWriteEffects: 'New destination write effects',
      staleWriterAccepted: 'Accepted stale-writer probes',
      duplicateEffects: 'Duplicate effects in executed probe',
    };
    for (const [key, label] of Object.entries(metricLabels)) {
      const term = element('dt', label);
      const value = element('dd', display(result.metrics[key]));
      value.id = `metric-${key}`;
      byId('metrics').append(term, value);
    }
    byId('gates').replaceChildren(...result.gates.map((gate) => element('li', `${gate.status.toUpperCase()} — ${gate.id}: ${gate.observation}`)));
    byId('effect-inventory').textContent = `Required: ${result.requiredIds.join(', ')}. Copied: ${result.copiedIds.join(', ')}. Candidate at assignment: ${result.synchronizedIds === null ? 'UNKNOWN' : result.synchronizedIds.join(', ')}. Candidate writer proposal: ${result.candidateWriters === null ? 'UNKNOWN' : result.candidateWriters.join(', ')}.`;
    byId('trace').replaceChildren(...result.trace.map((entry) => element('li', `${entry.stage}: ${entry.detail}`)));
    byId('user-impact').textContent = `${result.userImpact} ${result.cleanup}`;
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearErrors();
    const config = readConfig();
    if (!config) return;
    try {
      state = model.run(state, config);
      render();
      byId('result-title').focus();
    } catch (cause) {
      fail(cause.message);
    }
  });
  byId('reset-button').addEventListener('click', () => {
    HTMLFormElement.prototype.reset.call(form);
    state = model.createState();
    clearErrors();
    render();
    fields.initialCommitted.focus();
  });
  render();
}());
