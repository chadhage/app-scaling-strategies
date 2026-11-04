(function () {
  'use strict';
  const model = globalThis.S150Model;
  const lesson = model.createLesson();
  const element = (id) => document.getElementById(id);
  const text = (id, value) => { element(id).textContent = value; };
  const show = (value) => value === null ? 'UNKNOWN' : String(value);
  for (const guard of [...model.GUARDS, model.SUMMARY]) {
    for (const [id, value, label] of [
      ['guard', guard.id, `${guard.label} · ${guard.id}`],
      ['dependency', guard.dependencyId, guard.dependencyId],
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      element(id).append(option);
    }
  }
  function clearError() {
    text('input-error', '');
    element('input-error').hidden = true;
    for (const input of document.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
  }
  function tableRow(values) {
    const row = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    return row;
  }
  function render() {
    const state = lesson.snapshot();
    const current = state.current;
    const latest = current?.latest;
    text('phase', `Lesson: ${state.phase}${current ? ` · ${current.id} · ${current.lifecycle}` : ''}`);
    text('signals', current ? `Desired v2 routing: ${current.evidence.signals.desiredV2Percent}% · healthy v2: ${show(current.evidence.signals.healthyV2)} · green requests: ${current.evidence.signals.greenRequests} (not retirement proof)`
      : 'Routing/health signals: not observed');
    text('retirement-decision', `Decision: ${latest?.decision ?? 'NOT_CHECKED'}`);
    text('inventory-verifier', `Inventory verifier: ${latest?.inventoryVerifier.status ?? 'NOT_CHECKED'}`);
    text('control-verifier', `Safety-control verifier: ${latest?.controlVerifier.status ?? 'NOT_CHECKED'}`);
    text('answer-verifier', `Learner answer: ${latest?.learnerCheck?.status ?? 'NOT_CHECKED'}${latest?.learnerCheck ? ` · ${latest.learnerCheck.explanation}` : ''}`);
    text('impact', latest ? `User transition: ${latest.userImpact.classification} · ${latest.userImpact.originalJourneyId} · original budget ${latest.userImpact.originalBudgetMs} ms · elapsed ${show(latest.userImpact.elapsedMs)} ms · effect count ${show(latest.userImpact.effectCount)} · interruptions ${latest.userImpact.interruptions.join(', ') || 'none observed'} · native migration certified: false`
      : 'User transition: NOT_OBSERVED');
    text('capacity', current ? `Old capacity: ${current.oldCapacity}` : 'Old capacity: not evaluated');
    text('cleanup', `Cleanup outcome: ${latest?.cleanupOutcome ?? 'NOT_CHECKED'} · deletion performed: false`);
    text('totals', `Retirement checks: ${state.totals.attempts} · rejected ${state.totals.rejected} · unknown ${state.totals.unknown} · simulated retired ${state.totals.simulatedRetired}`);
    text('journey-totals', `Attempted original journeys: ${state.totals.attemptedJourneys} · interrupted ${state.totals.interruptedJourneys} · unverified ${state.totals.unverifiedJourneys}`);
    text('history-count', `Retained rehearsals: ${state.totals.rehearsals} / 4 · archived ${state.history.length}`);
    element('fixture').disabled = current !== null;
    element('begin-run').disabled = current !== null;
    for (const id of ['action', 'conduct']) {
      element(id).disabled = current === null || current.lifecycle === 'SIMULATED_RETIRED';
    }
    for (const id of ['guard', 'dependency', 'decision', 'check-answer']) {
      element(id).disabled = !latest || latest.learnerCheck !== null;
    }
    element('archive-run').disabled = !latest;
    element('inventory-rows').replaceChildren();
    if (current) for (const row of current.evidence.inventory) {
      element('inventory-rows').append(tableRow([row.id, row.version, show(row.required),
        show(row.observed), row.observed ? show(row.count) : 'UNKNOWN (unobserved)']));
    }
    element('guard-rows').replaceChildren();
    text('proof-freshness', latest
      ? `Guards below are the retained verification at revision ${latest.revision}, observation tick ${show(latest.evidence.observedAtTick)}; current teaching revision ${state.revision}, tick ${current.evidence.tick}. Conduct Verify retirement after each new named observation.`
      : 'No recorded verification. Conduct Verify retirement after each new named observation.');
    if (latest) for (const guard of latest.guards) {
      const row = tableRow([`${guard.id}\n${guard.dependencyId}`,
        `${guard.status}${guard.hasUnknownRequiredFact ? ' · unknown required facts retained' : ''}`,
        '', guard.userImpact]);
      const expected = document.createElement('p');
      expected.textContent = `${guard.expected} ${guard.reason}`;
      const actual = document.createElement('pre');
      actual.textContent = JSON.stringify(guard.actual, null, 2);
      row.children[2].append(expected, actual);
      element('guard-rows').append(row);
    }
    text('current-proof', latest ? JSON.stringify(latest, null, 2) : 'No verification recorded.');
    text('trace-proof', current ? JSON.stringify(current.trace, null, 2) : 'No rehearsal started.');
    text('history-proof', state.history.length ? JSON.stringify(state.history, null, 2) : 'No archived rehearsals.');
    element('export-report').value = JSON.stringify(lesson.exportReport(), null, 2);
  }
  function conduct(type, value = null, inputs = []) {
    try {
      const state = lesson.snapshot();
      lesson.dispatch({ type, revision: state.revision, runId: state.current?.id ?? null, value });
      clearError();
      render();
      return true;
    } catch (error) {
      text('input-error', `${error.code ?? 'ERR_LESSON'}: ${error.message}`);
      element('input-error').hidden = false;
      for (const id of inputs) element(id).setAttribute('aria-invalid', 'true');
      element('input-error').focus();
      return false;
    }
  }
  element('fixture-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (conduct('begin', element('fixture').value, ['fixture'])) element('action').focus();
  });
  element('action-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (conduct(element('action').value, null, ['action']) && !element('guard').disabled) {
      element('guard').focus();
    }
  });
  element('answer-form').addEventListener('submit', (event) => {
    event.preventDefault();
    conduct('check', {
      guardId: element('guard').value, dependencyId: element('dependency').value,
      decision: element('decision').value,
    }, ['guard', 'dependency', 'decision']);
  });
  element('archive-run').addEventListener('click', () => {
    if (conduct('archive')) element('fixture').focus();
  });
  element('reset-lesson').addEventListener('click', () => {
    if (!conduct('reset')) return;
    for (const id of ['fixture-form', 'action-form', 'answer-form']) element(id).reset();
    for (const id of ['current-detail', 'trace-detail', 'history-detail']) element(id).open = false;
    clearError();
    render();
    element('fixture').focus();
  });
  render();
}());
