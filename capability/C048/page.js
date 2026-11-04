(function () {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const form = byId('admission-form');
  const candidateText = byId('candidate-json');
  const inspection = byId('inspection');
  const buttons = ['build-candidate', 'inspect-candidate', 'admit-candidate', 'expand-candidate', 'archive-reset', 'select-export'];
  let session;
  let requestNumber = 0;

  function clearInspection(message) {
    inspection.textContent = message;
    byId('consumer-results').replaceChildren();
  }

  function fromControls() {
    return {
      schema: C048Admission.rules.candidateSchema,
      releaseId: byId('release-id').value, implementation: byId('implementation').value, profileId: byId('profile-id').value,
      data: {
        apiContract: byId('data-api').value, consumerId: byId('data-consumer').value,
        consumerSchema: byId('data-consumer-schema').value, adapterId: byId('data-adapter').value,
        evidence: byId('data-evidence').value
      },
      event: {
        stateSchema: byId('event-state').value, workVersion: byId('event-work').value,
        consumerId: byId('event-consumer').value, consumerStateSchema: byId('event-consumer-state').value,
        consumerWorkVersion: byId('event-consumer-work').value, evidence: byId('event-evidence').value
      }
    };
  }

  function reflectControls() {
    candidateText.value = JSON.stringify(fromControls(), null, 2);
  }

  function row(values) {
    const element = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      element.append(cell);
    }
    return element;
  }

  function render(result) {
    const state = session.read();
    byId('revision').textContent = String(state.revision);
    byId('active-stage').textContent = state.active ? state.active.stage : 'none';
    for (const [id, key] of [['admission-count', 'admissions'], ['expansion-count', 'expansions'],
      ['effect-count', 'modeledEffectApplications'], ['rejection-count', 'rejections'], ['inspection-count', 'inspections']]) {
      byId(id).textContent = String(state.counts[key]);
    }
    byId('archive-count').textContent = String(state.archives.length);
    byId('job-detail').textContent = state.active ? JSON.stringify(state.active.job, null, 2) : 'No active job.';
    byId('session-export').value = JSON.stringify(state, null, 2);
    byId('history-rows').replaceChildren(...state.history.map((record) =>
      row([record.ordinal, record.result.operation, record.result.outcome, record.result.code])));
    if (!result) return;
    byId('error').hidden = result.outcome !== 'rejected';
    byId('error').textContent = result.outcome === 'rejected' ? `${result.code}: ${result.message}` : '';
    const labels = { inspected: 'INSPECTED ONLY', admitted: 'LOCAL ADMITTED', expanded: 'LOCAL EXPANDED', rejected: 'REJECTED', reset: 'RESET' };
    byId('status').textContent = `${labels[result.outcome]} — ${result.code}: ${result.message}`;
    if (result.outcome === 'reset') {
      clearInspection('NOT INSPECTED — reset archived the admission; no admission authority.');
    } else if (result.eligibility) {
      inspection.textContent = result.outcome === 'rejected' ?
        'BLOCKED — the submitted operation was rejected; any compatible tier is not a permit.' :
        'FRESH LOCAL CHECKS — inspection is never a permit; every transition recomputes them.';
      byId('consumer-results').replaceChildren(...result.eligibility.checks.map((check) =>
        row([check.tier, check.status, `${check.code}: ${check.evidenceKind || check.message}`])));
    } else {
      clearInspection('REJECTED WITHOUT A PERMIT — original inspections remain in history.');
    }
  }

  function conduct(type) {
    const command = {
      schema: C048Admission.rules.commandSchema, type,
      requestId: `request-ui-${++requestNumber}`, expectedRevision: session.read().revision
    };
    if (type !== 'reset') command.candidateJSON = candidateText.value;
    const result = session.dispatch(command);
    render(result);
    return result;
  }

  function unexpected(error) {
    buttons.forEach((id) => { byId(id).disabled = true; });
    byId('status').textContent = 'BLOCKED — model initialization/runtime failure; no fallback admission.';
    byId('error').hidden = false;
    byId('error').textContent = `${error.code || 'MODEL_UNAVAILABLE'}: ${error.message}`;
    clearInspection('UNAVAILABLE — no admission authority.');
  }

  try {
    if (!globalThis.C020Contract || !globalThis.C020Inspector || !globalThis.C021Compatibility ||
        !globalThis.C023Ledger || !globalThis.C048Admission ||
        C048Admission.oldConsumer !== C020Inspector.oldConsumer) throw new Error('The unchanged dependency models are required.');
    session = C048Admission.createSession({ sessionId: 'session-browser' });
    const options = C020Contract.profiles.map((profile, index) => {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = `${profile.id} — ${profile.displayName}`;
      option.defaultSelected = index === 0;
      return option;
    });
    const unknown = document.createElement('option');
    unknown.value = 'synthetic-999';
    unknown.textContent = 'synthetic-999 — unknown; must block';
    byId('profile-id').replaceChildren(...options, unknown);
    const adapter = document.createElement('option');
    adapter.value = C021Compatibility.adapterId;
    adapter.textContent = `${C021Compatibility.adapterId} — explicitly validate getProfile/2 to old`;
    byId('data-adapter').append(adapter);
    reflectControls();
    render();
    buttons.forEach((id) => { byId(id).disabled = false; });

    for (const eventName of ['input', 'change']) {
      form.addEventListener(eventName, (event) => {
        if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement ||
            event.target === candidateText)) return;
        if (event.target !== candidateText) reflectControls();
        clearInspection('STALE — candidate edited; earlier inspection cannot permit admission or expansion.');
        byId('status').textContent = 'CANDIDATE CHANGED — no new operation; active admission and original history retained.';
        byId('error').hidden = true;
        byId('error').textContent = '';
      });
    }
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      try { conduct('inspect'); } catch (error) { unexpected(error); }
    });
    byId('build-candidate').addEventListener('click', () => {
      reflectControls();
      clearInspection('NOT INSPECTED — explicit visible controls copied; no admission authority.');
      byId('status').textContent = 'CANDIDATE BUILT — no inspection, admission or effect was performed.';
      byId('error').hidden = true;
      byId('error').textContent = '';
    });
    for (const [id, type] of [['admit-candidate', 'admit'], ['expand-candidate', 'expand']]) {
      byId(id).addEventListener('click', () => {
        try { conduct(type); } catch (error) { unexpected(error); }
      });
    }
    form.addEventListener('reset', (event) => {
      try {
        const result = conduct('reset');
        if (result.outcome !== 'reset') { event.preventDefault(); return; }
        setTimeout(() => { reflectControls(); render(); }, 0);
      } catch (error) {
        event.preventDefault();
        unexpected(error);
      }
    });
    byId('select-export').addEventListener('click', () => {
      byId('session-export').focus();
      byId('session-export').select();
      byId('status').textContent = 'EXPORT SELECTED — copy with your native keyboard; no state adoption or admission performed.';
    });
  } catch (error) { unexpected(error); }
}());
