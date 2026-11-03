(function () {
  'use strict';
  const model = globalThis.S061Model.createRehearsal();
  const F = globalThis.S061Fixtures;
  const element = (id) => document.getElementById(id);
  const form = element('lesson-controls');
  const predictionForm = element('prediction-controls');
  const errorOutput = element('input-error');
  const text = (id, value) => { element(id).textContent = value; };
  function cell(row, value) {
    const node = document.createElement('td');
    node.textContent = String(value);
    row.append(node);
    return node;
  }
  function clearError() {
    errorOutput.hidden = true;
    errorOutput.textContent = '';
    document.querySelectorAll('[aria-invalid]').forEach((node) => {
      node.removeAttribute('aria-invalid');
      node.removeAttribute('aria-errormessage');
    });
  }
  function showError(error) {
    errorOutput.textContent = error.message;
    errorOutput.hidden = false;
    const field = error.field ? element(error.field) : null;
    if (field && !field.matches(':disabled')) {
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-errormessage', 'input-error');
      field.focus();
    } else errorOutput.focus();
  }
  function render() {
    const state = model.snapshot();
    text('phase', `Phase: ${state.phase}`);
    element('assumptions').disabled = state.phase !== 'idle';
    element('write').disabled = state.phase !== 'idle' || state.history.length >= F.maxAttempts;
    element('add-reader').disabled = state.phase !== 'written';
    element('run-reads').disabled = state.phase !== 'expanded';
    element('prediction-fields').disabled = state.phase !== 'complete' || state.prediction !== null;
    element('new-attempt').disabled = state.phase !== 'complete' || state.history.length >= F.maxAttempts;
    text('topology', `Readers: ${state.readers.length} · writers: ${state.primary.writers} · acknowledged synthetic writes: ${state.primary.acknowledgedWrites}`);
    text('versions', state.config
      ? `Primary v${state.primary.version}; session minimum v${state.sessionRequiredVersion}; ${state.readers.map((reader) => `${reader.id} ${reader.version === null ? 'version unknown' : `v${reader.version}`}`).join('; ')}. Supplied fixture versions, not measured replication.`
      : 'No fixture write acknowledged.');
    text('gate', state.result ? `Read contract gate: ${state.result.gate}` : 'Read contract gate: not evaluated');
    text('impact', state.result ? `Synthetic read impact: ${state.result.impact}` : 'Synthetic read impact: not evaluated');
    text('metrics', state.result
      ? `Attempted ${state.result.attempted} · observed ${state.result.observed} · correct ${state.result.correct} · failed ${state.result.failed} · unknown ${state.result.unknown} · replica reads ${state.result.replicaReads} · primary reads ${state.result.primaryReads} · eligible offloaded ${state.result.offloadedEligible}`
      : 'No reads observed.');
    element('result-detail').hidden = state.result === null;
    element('reads').replaceChildren();
    for (const read of state.reads) {
      const row = document.createElement('tr');
      row.dataset.read = read.id;
      cell(row, `${read.id} / ${read.candidate}`);
      cell(row, `v${read.requiredVersion}`);
      cell(row, `${read.selectedTarget} / ${read.selectionReason}`);
      cell(row, read.observed
        ? `${read.observedTarget} / ${read.receivedVersion === null ? 'version unknown' : `v${read.receivedVersion}`}`
        : 'No observation / version unknown');
      cell(row, `${read.status} / ${read.reason}`);
      element('reads').append(row);
    }
    text('trace', state.trace.length ? state.trace.join('\n') : 'No attempt started.');
    text('prediction-result', state.prediction
      ? `Prediction verifier: ${state.prediction.verifier} · selected ${state.prediction.selected} · measured ${state.prediction.actual}. Synthetic impact is unchanged.`
      : 'Prediction not checked.');
    text('history-count', `Retained attempts: ${state.history.length} / ${F.maxAttempts}`);
    element('history').replaceChildren();
    for (const attempt of state.history) {
      const row = document.createElement('tr');
      row.dataset.attempt = String(attempt.attempt);
      cell(row, attempt.attempt);
      cell(row, Object.values(attempt.config).join(' / '));
      cell(row, `${attempt.result.gate} / ${attempt.result.impact}`);
      cell(row, `${attempt.result.correct} / ${attempt.result.failed} / ${attempt.result.unknown}`);
      cell(row, attempt.prediction ? attempt.prediction.verifier : 'Not checked');
      const proofCell = cell(row, '');
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = `Inspect attempt ${attempt.attempt}`;
      const proof = document.createElement('pre');
      proof.textContent = JSON.stringify(attempt, null, 2);
      details.append(summary, proof);
      proofCell.append(details);
      element('history').append(row);
    }
  }
  function action(work, focus) {
    clearError();
    try {
      work();
      render();
      if (focus) element(focus()).focus();
    } catch (error) {
      showError(error);
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    action(() => model.write(Object.fromEntries(Object.keys(F.defaults)
      .map((key) => [key, element(key).value]))), () => 'add-reader');
  });
  element('add-reader').addEventListener('click', () => action(() => model.addReader(), () => 'run-reads'));
  element('run-reads').addEventListener('click', () => action(() => model.read(), () => 'prediction'));
  predictionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    action(() => model.predict(element('prediction').value),
      () => model.snapshot().history.length < F.maxAttempts ? 'new-attempt' : 'reset-rehearsal');
  });
  element('new-attempt').addEventListener('click', () => action(() => {
    model.newAttempt();
    form.reset();
    predictionForm.reset();
  }, () => 'write'));
  element('reset-rehearsal').addEventListener('click', () => action(() => {
    model.reset();
    form.reset();
    predictionForm.reset();
  }, () => 'write'));
  render();
}());
