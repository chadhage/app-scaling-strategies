(function () {
  'use strict';

  const element = (id) => document.getElementById(id);
  const model = globalThis.C023Ledger;
  const catalog = globalThis.C020Contract;
  const configFields = ['job-id', 'work-version', 'profile-id', 'implementation'];
  const actionButtons = ['create-job', 'run-job', 'resume-job', 'reconcile-job', 'archive-reset', 'copy-snapshot', 'inspect-snapshot'];
  const archives = [];
  const rejections = [];
  const inspections = [];
  let active = null;
  let available = false;

  function json(value) { return JSON.stringify(value, null, 2); }
  function text(id, value) { element(id).textContent = String(value); }
  function list(id, values, empty) {
    const target = element(id);
    target.replaceChildren();
    for (const value of values.length ? values : [empty]) {
      const item = document.createElement('li');
      item.textContent = value;
      target.append(item);
    }
  }
  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
  function exportSession() {
    return {
      schema: 'C023-browser-session/1', cardId: 'C023', parents: ['H005', 'P005'],
      mode: 'synthetic-in-memory-fixture', atomicity: model?.contract?.atomicity || 'unavailable',
      qualifications: {
        durableStorageImplemented: false, nativeProof: false, externalEffectsImplemented: false,
        productionNode24Validated: false, cloudCalls: 0, spend: 0
      },
      active, archives, rejections, readOnlyInspections: inspections
    };
  }
  function render() {
    const view = active ? model.inspect(active) : null;
    for (const id of configFields) element(id).disabled = !available || Boolean(active);
    element('create-job').disabled = !available || Boolean(active);
    element('run-job').disabled = !view || view.status !== 'ready';
    element('resume-job').disabled = !view || view.status !== 'interrupted';
    element('reconcile-job').disabled = !view || view.status !== 'needs-reconcile';
    element('reconciliation').disabled = !view || view.status !== 'needs-reconcile';
    element('archive-reset').disabled = !available;
    element('copy-snapshot').disabled = !active;
    element('inspect-snapshot').disabled = !available;
    element('interruption').disabled = !view || !['ready', 'interrupted'].includes(view.status);
    element('effect-index').disabled = element('interruption').disabled || element('interruption').value === 'none';
    const counts = {
      'planned-count': 'plannedEffects', 'committed-count': 'committedEffects',
      'application-count': 'effectApplications', 'checkpoint-count': 'checkpoints',
      'delivery-count': 'deliveryAttempts', 'suppressed-count': 'duplicateSuppressions', 'unknown-count': 'unknownEffects'
    };
    for (const [id, key] of Object.entries(counts)) text(id, view ? view.counters[key] : '—');
    text('checkpoint-next', view ? view.checkpointNext : '—');
    text('identity', active ? json({
      workId: active.plan.workId, jobId: active.plan.jobId, workVersion: active.plan.workVersion,
      fixtureRevision: active.plan.fixtureRevision, source: active.plan.source
    }) : 'No active job.');
    text('result-note', !view ? 'No successful attempt is assumed.' :
      view.status === 'needs-reconcile' ? 'UNKNOWN: committed count is a known lower bound, not an exact external-effect count. Retry is blocked.' :
      view.status === 'complete' ? 'Complete only within the declared local model and any chosen synthetic reconciliation assumptions. Original interrupted/unknown attempts remain below; this is not native proof.' :
      `Local state: ${view.status}. Checkpoint is the next effect index, not proof that every effect acknowledgment was received.`);
    const rows = element('effects');
    rows.replaceChildren();
    if (!active) {
      const row = rows.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 5;
      cell.textContent = 'Create a job to inspect its plan.';
    } else {
      for (const effect of active.plan.effects) {
        const commit = view.ledger.find((entry) => entry.effectKey === effect.key);
        const unknown = view.pendingUnknown?.effectKey === effect.key;
        const row = rows.insertRow();
        const values = [
          `${effect.index + 1}. ${effect.kind}\n${effect.key}`,
          unknown ? 'UNKNOWN — reconcile; not counted as committed' : commit ? `Known committed (${commit.origin})` : 'Planned, not committed',
          view.applications.filter((application) => application.effectKey === effect.key).length,
          commit ? commit.commitEvent : '—', effect.index < view.checkpointNext ? 'Yes' : 'No'
        ];
        for (const value of values) row.insertCell().textContent = String(value);
      }
    }
    list('attempts', view ? view.attempts.map((attempt) =>
      `${attempt.id}: ${attempt.action} from checkpoint ${attempt.fromCheckpoint}; original outcome ${attempt.outcome}` +
      (attempt.interruption ? `; ${attempt.interruption.boundary} at effect ${attempt.interruption.index + 1}` : '') +
      `; events ${attempt.startEvent}–${attempt.finishEvent}.`) : [], 'No attempts.');
    text('checkpoints', json(view ? view.checkpoints : []));
    text('journal', json(active ? active.journal : []));
    text('archive-count', archives.length);
    text('rejection-count', rejections.length);
    text('session-applications', (view?.counters.effectApplications || 0) +
      archives.reduce((total, entry) => total + entry.state.view.counters.effectApplications, 0));
    list('archives', archives.map((entry) =>
      `Archive ${entry.ordinal}: ${entry.state.plan.workId}; ${entry.state.view.status}; ` +
      `${entry.state.view.counters.effectApplications} known applications; ${entry.state.view.counters.unknownEffects} unresolved unknowns. Export retains its full original journal.`), 'No archived jobs.');
    list('rejections', rejections.map((entry) => `${entry.ordinal}. ${entry.action}: ${entry.code} — ${entry.message}`), 'No rejected operations.');
    element('export-json').value = json(exportSession());
  }
  function conduct(name, operation) {
    try {
      if (!available) fail('FIXTURE_UNAVAILABLE', 'The immutable C020 catalog and C023 model must load before conducting.');
      const message = operation();
      element('error').hidden = true;
      element('error').textContent = '';
      for (const id of configFields) element(id).removeAttribute('aria-invalid');
      render();
      text('status', message);
    } catch (error) {
      const code = error.code || 'UNEXPECTED_LOCAL_ERROR';
      rejections.push(Object.freeze({ ordinal: rejections.length + 1, action: name, code, message: error.message }));
      text('status', `REJECTED — ${code}. No successful outcome is implied; active job evidence is unchanged.`);
      text('error', `${code}: ${error.message}`);
      element('error').hidden = false;
      if (name === 'create') {
        for (const id of configFields) element(id).setAttribute('aria-invalid', 'true');
      }
      if (name === 'inspect') text('snapshot-status', `REJECTED — ${code}. Active job was not replaced.`);
      render();
      element('error').focus();
    }
  }
  function attempt(type) {
    conduct(type, () => {
      if (!active) fail('NO_ACTIVE_JOB', 'Create an explicit job before conducting an attempt.');
      const interruption = element('interruption').value;
      const indexText = element('effect-index').value;
      if (interruption !== 'none' && !/^[012]$/.test(indexText)) fail('INVALID_COMMAND', 'Select one explicit effect index.');
      const next = model.apply(active, {
        type, interruption, effectIndex: interruption === 'none' ? null : Number(indexText)
      });
      active = next;
      return next.view.status === 'needs-reconcile' ? 'UNKNOWN — acknowledgment unresolved; resume blocked pending explicit synthetic reconciliation.' :
        next.view.status === 'complete' ? 'LOCAL MODEL COMPLETE — not native proof; original outcomes and duplicate suppressions are retained.' :
        'INTERRUPTED — inspect committed effects versus checkpoint; original attempt retained. Select None to resume normally.';
    });
  }

  element('job-form').addEventListener('submit', (event) => {
    event.preventDefault();
    conduct('create', () => {
      if (active) fail('ACTIVE_JOB_EXISTS', 'Archive the active job explicitly rather than replacing its evidence.');
      const next = model.create({
        jobId: element('job-id').value, workVersion: element('work-version').value,
        profileId: element('profile-id').value, implementation: element('implementation').value
      });
      if (archives.some((entry) => entry.state.plan.workId === next.plan.workId)) {
        fail('WORK_ID_REUSED', 'This page already retains that work identity. Use a new job ID; reset is not resume or a new deduplication proof.');
      }
      active = next;
      return 'READY — plan created; zero committed effects and zero checkpoints.';
    });
  });
  element('run-job').addEventListener('click', () => attempt('run'));
  element('resume-job').addEventListener('click', () => attempt('resume'));
  element('interruption').addEventListener('change', render);
  element('reconcile-job').addEventListener('click', () => {
    conduct('reconcile', () => {
      if (!active?.view.pendingUnknown) fail('NO_UNKNOWN_ACK', 'Only an unresolved acknowledgment can be reconciled.');
      const next = model.apply(active, {
        type: 'reconcile', effectKey: active.view.pendingUnknown.effectKey, observation: element('reconciliation').value
      });
      active = next;
      return next.view.status === 'needs-reconcile' ?
        'UNKNOWN — synthetic observation is still unknown; resume remains blocked.' :
        'SYNTHETIC RECONCILIATION ONLY — resume allowed; no external receipt was obtained and the original unknown outcome remains.';
    });
  });
  element('archive-reset').addEventListener('click', () => {
    conduct('archive-reset', () => {
      if (active) archives.push(Object.freeze({ ordinal: archives.length + 1, state: active }));
      active = null;
      HTMLFormElement.prototype.reset.call(element('job-form'));
      element('job-id').value = `job-${String(archives.length + 1).padStart(3, '0')}`;
      element('interruption').value = 'after-commit';
      element('effect-index').value = '0';
      element('reconciliation').value = 'still-unknown';
      element('snapshot-input').value = '';
      text('snapshot-status', 'Not inspected. Previous inspection/rejection evidence is retained in the session export.');
      return 'RESET — active job archived, not erased. A new job is isolated, not a resume. Reload still loses this memory-only session.';
    });
  });
  element('copy-snapshot').addEventListener('click', () => {
    conduct('copy-snapshot', () => {
      if (!active) fail('NO_ACTIVE_JOB', 'There is no active snapshot to copy.');
      element('snapshot-input').value = json(active);
      text('snapshot-status', 'Copied active snapshot. Inspection is read-only and cannot replace active evidence.');
      return 'SNAPSHOT COPIED — local state only; no durable write occurred.';
    });
  });
  element('snapshot-input').addEventListener('input', () => {
    text('snapshot-status', 'NOT INSPECTED — candidate changed. Previous inspection evidence is retained; active job is unchanged.');
    text('status', 'CANDIDATE CHANGED — no new inspection has passed. Active job and previous evidence are unchanged.');
  });
  element('inspect-snapshot').addEventListener('click', () => {
    conduct('inspect', () => {
      const candidate = model.restore(element('snapshot-input').value);
      inspections.push(Object.freeze({
        ordinal: inspections.length + 1, workId: candidate.plan.workId,
        status: candidate.view.status, counters: candidate.view.counters,
        interpretation: 'read-only-local-replay-not-authentication-or-new-observation'
      }));
      text('snapshot-status', `VALID LOCAL SNAPSHOT — ${candidate.view.status}; ${candidate.view.counters.committedEffects} known commits. READ ONLY: active job was not replaced.`);
      return 'SNAPSHOT INSPECTED — read-only local replay; active job, original effects and history unchanged.';
    });
  });

  try {
    if (!model || !catalog || !Object.isFrozen(model) || !Object.isFrozen(catalog)) {
      fail('FIXTURE_UNAVAILABLE', 'Required immutable local scripts did not load. No fallback or success is available.');
    }
    for (const profile of catalog.profiles) {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = `${profile.id} — ${profile.displayName}`;
      element('profile-id').append(option);
    }
    available = true;
    render();
    text('status', 'NOT RUN — explicit synthetic work configuration required; no effect has occurred.');
  } catch (error) {
    available = false;
    for (const id of actionButtons) element(id).disabled = true;
    for (const id of configFields) element(id).disabled = true;
    text('status', 'UNAVAILABLE — required immutable local fixture failed to initialize; no job has run.');
    text('error', `${error.code || 'FIXTURE_UNAVAILABLE'}: ${error.message}`);
    element('error').hidden = false;
  }
}());
