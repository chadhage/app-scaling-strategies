(function () {
  'use strict';

  const contract = globalThis.C020Contract;
  const inspector = globalThis.C020Inspector;
  const api = globalThis.C021Compatibility;
  const byId = (id) => document.getElementById(id);
  const form = byId('rehearsal-form');
  const candidateForm = byId('candidate-form');
  const profileId = byId('profile-id');
  const implementation = byId('implementation');
  const run = byId('run-rehearsal');
  const candidate = byId('candidate');
  const check = byId('check-candidate');
  const status = byId('status');
  const candidateStatus = byId('candidate-status');
  const available = !!(contract && inspector && api && api.oldConsumer === inspector.oldConsumer
    && ['makeBreaking', 'newConsumer', 'adaptToOld', 'rehearse', 'parseCandidate']
      .every((name) => typeof api[name] === 'function'));
  let lastContext = null;
  const print = (value) => JSON.stringify(value, null, 2);

  function clearCandidate() {
    candidateStatus.textContent = 'No candidate checked.';
    byId('candidate-result').textContent = 'No candidate adaptation.';
  }

  function clearResults() {
    lastContext = null;
    byId('outcomes').replaceChildren();
    byId('semantics').textContent = 'No compared business fields.';
    byId('baseline').textContent = 'No baseline replay.';
    byId('raw').textContent = 'No raw response.';
    byId('adapted').textContent = 'No adapted response.';
    candidate.value = '';
    candidate.disabled = true;
    check.disabled = true;
    clearCandidate();
  }

  function invalidate() {
    clearResults();
    status.textContent = available
      ? 'Not run — context changed; previous results cleared.'
      : 'UNAVAILABLE — unchanged C020 contract/inspector or C021 dependency missing; no safe result.';
  }

  function showOutcomes(outcomes) {
    byId('outcomes').replaceChildren(...outcomes.map((item) => {
      const row = document.createElement('tr');
      for (const field of ['transition', 'outcome', 'code']) {
        const cell = document.createElement('td');
        cell.textContent = item[field];
        row.append(cell);
      }
      return row;
    }));
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearResults();
    if (!available) { invalidate(); return; }
    try {
      const id = profileId.value;
      const source = implementation.value;
      // This is explicitly a bundled catalog replay, never a call to a C020 implementation.
      const baseline = {
        apiContract: contract.apiContract,
        profile: contract.profiles.find((profile) => profile.id === id),
        stamp: contract.stamps[source]
      };
      const result = api.rehearse(baseline, source, id);
      showOutcomes(result.outcomes);
      byId('baseline').textContent = print(result.baseline);
      byId('raw').textContent = print(result.raw);
      byId('adapted').textContent = print(result.adapted);
      byId('semantics').textContent = print({
        oldConsumer: result.oldSemantics, newConsumer: result.newSemantics,
        adaptedOldConsumer: result.adaptedSemantics
      });
      lastContext = { id, source };
      candidate.value = print(result.raw);
      candidate.disabled = false;
      check.disabled = false;
      status.textContent = 'REHEARSED — RAW BREAKING; ADAPTED SAFE. Synthetic catalog replay only.';
    } catch (error) {
      status.textContent = `REJECTED — ${error.code || 'UNEXPECTED_ERROR'}; no safe transition asserted.`;
    }
  });

  candidateForm.addEventListener('submit', (event) => {
    event.preventDefault();
    clearCandidate();
    if (!available || !lastContext || lastContext.id !== profileId.value || lastContext.source !== implementation.value) {
      invalidate();
      candidateStatus.textContent = 'REJECTED — RUN_REQUIRED; compare the explicit current context first.';
      return;
    }
    try {
      const value = api.parseCandidate(candidate.value, lastContext.source, lastContext.id);
      const adapted = api.adaptToOld(value, lastContext.source, lastContext.id);
      byId('candidate-result').textContent = print({
        oldConsumer: api.oldConsumer(adapted),
        newConsumer: api.newConsumer(value, lastContext.source, lastContext.id),
        adapted
      });
      candidateStatus.textContent = 'CANDIDATE SAFE VIA EXPLICIT ADAPTER — raw remains breaking to old. Not an HTTP observation.';
    } catch (error) {
      candidateStatus.textContent = `REJECTED — ${error.code || 'UNEXPECTED_ERROR'}; no candidate adaptation.`;
    }
  });

  profileId.addEventListener('input', invalidate);
  implementation.addEventListener('change', invalidate);
  candidate.addEventListener('input', clearCandidate);
  byId('reset-rehearsal').addEventListener('click', () => {
    form.reset();
    candidateForm.reset();
    clearResults();
    status.textContent = available
      ? 'Not run — reset; no safe transition asserted.'
      : 'UNAVAILABLE — unchanged C020 contract/inspector or C021 dependency missing; no safe result.';
    profileId.focus();
  });

  clearResults();
  run.disabled = !available;
  if (!available) invalidate();
}());
