(function () {
  'use strict';
  const form = document.getElementById('lesson-form');
  const standby = document.getElementById('standby');
  const budget = document.getElementById('budget');
  const inspectButton = document.getElementById('inspect');
  const rehearseButton = document.getElementById('rehearse');
  const resetButton = document.getElementById('clear-current');
  const errorPanel = document.getElementById('error');
  const statusPanel = document.getElementById('result');
  const model = globalThis.StandbyLesson;
  let state;

  function showError(error) {
    const known = error && ['ERR_INPUT', 'ERR_STATE', 'ERR_PHASE', 'ERR_LIMIT'].includes(error.code);
    errorPanel.textContent = known
      ? `${error.code}: ${error.message} The rejected action did not advance this rehearsal.`
      : 'ERR_UNEXPECTED: A local action or display failed. No successful result was substituted. Reset current rehearsal or reload the lesson; recorded history is retained.';
    if (!known) {
      statusPanel.textContent = 'Unverified UI result: an unexpected local error prevented complete display. This error is not proof of successful recovery.';
    }
    errorPanel.hidden = false;
    errorPanel.focus();
  }

  function clearError() {
    errorPanel.hidden = true;
    errorPanel.textContent = '';
    standby.removeAttribute('aria-invalid');
    budget.removeAttribute('aria-invalid');
  }

  function cell(row, value) {
    const element = document.createElement('td');
    element.textContent = value;
    row.append(element);
  }

  const ms = (value) => value === null ? 'unknown' : `${value} synthetic ms`;
  const measured = (value) => JSON.stringify(value);
  function item(list, text) {
    const element = document.createElement('li');
    element.textContent = text;
    list.append(element);
    return element;
  }

  function render() {
    const locked = state.phase !== 'idle' || state.history.length >= model.MAX_CHECKS;
    standby.disabled = locked;
    budget.disabled = locked;
    inspectButton.disabled = locked;
    rehearseButton.disabled = state.phase !== 'measured';
    const current = state.current;
    statusPanel.textContent = !current
      ? state.history.length >= model.MAX_CHECKS
        ? 'Ten-check session limit reached. Reset cannot erase history or renew the allowance.'
        : 'Not measured. A shallow healthy sample cannot certify full readiness.'
      : state.phase === 'measured'
        ? `Initial readiness: ${current.readiness}. Recovery and client outcome: unknown — not rehearsed.`
        : `Standby contract: ${current.outcome}. Initial readiness: ${current.readiness}. Client recovery: ${current.clientOutcome}.`;
    document.getElementById('current-summary').textContent = current
      ? `${current.label}; ${current.activeRegion} → ${current.passiveRegion}; original budget ${ms(current.budgetMs)}. Shallow HTTP ${current.shallowStatus}: ${current.shallowHealth} — NOT full readiness.`
      : 'Choose a fixture and measure full standby. No current readiness evidence.';

    const readinessRows = document.getElementById('readiness-rows');
    readinessRows.replaceChildren();
    if (current) {
      for (const check of current.initial.checks) {
        const row = document.createElement('tr');
        row.dataset.dimension = check.key;
        cell(row, `${check.label}: ${check.expected}`);
        cell(row, `${check.verdict} — ${measured(check.measured)}`);
        const after = current.recovered && current.recovered.checks.find((value) => value.key === check.key);
        cell(row, after ? `${after.verdict} — ${measured(after.measured)}` : 'unknown — not rehearsed');
        readinessRows.append(row);
      }
    }
    const recovery = current && current.recovery;
    document.getElementById('recovery-summary').textContent = recovery
      ? `Recovery: ${recovery.verdict}; completed alternate recovery ${ms(recovery.measuredMs)}; template total ${ms(recovery.templateTotalMs)}. ${recovery.reason}.`
      : 'Recovery: unknown — not rehearsed.';
    const phaseList = document.getElementById('phase-list');
    phaseList.replaceChildren();
    if (recovery) {
      for (const phase of recovery.phases) {
        item(phaseList, `${phase.name}: ${ms(phase.durationMs)} (fixed phase template, not elapsed browser time).`);
      }
      item(phaseList, `Full-path admission: ${recovery.eligible === null ? 'unknown' : recovery.eligible ? 'allowed in the fictional trace' : 'blocked; no completed alternate routing'}.`);
    }
    const clients = document.getElementById('client-list');
    clients.replaceChildren();
    if (current) {
      for (const journey of current.journeys) {
        item(clients, `${journey.id}: ${journey.verdict}; original budget ${ms(journey.budgetMs)}; elapsed ${ms(journey.elapsedMs)}; destination ${journey.destination || 'not observed / admission blocked'}; session accepted ${journey.sessionAccepted}; profile revision ${journey.profileRevision}; session revision ${journey.sessionRevision}; effect count ${journey.effectCount === null ? 'not applicable / unobserved' : journey.effectCount}. ${journey.reason}.`);
      }
    }

    const comparisons = document.getElementById('comparison-rows');
    comparisons.replaceChildren();
    if (current) {
      for (const reference of current.comparison) {
        const row = document.createElement('tr');
        row.dataset.fixture = reference.fixtureId;
        cell(row, reference.label);
        cell(row, `${reference.initial.readiness}; ready capacity ${reference.initial.checks[0].measured.capacityUnits}`);
        cell(row, ms(reference.recovery.measuredMs));
        cell(row, `${reference.clientOutcome}; ${reference.journeys.map((journey) => ms(journey.elapsedMs)).join(' / ')}`);
        cell(row, reference.outcome);
        comparisons.append(row);
      }
    }
    const counts = model.totals(state);
    document.getElementById('totals').textContent = `Checks ${counts.checks}/${model.MAX_CHECKS}: success ${counts.success}, failure ${counts.failure}, unknown ${counts.unknown}. Synthetic client attempts ${counts.clientAttempts}: success ${counts.clientSuccess}, interruption/failure ${counts.clientFailure}, unknown ${counts.clientUnknown}.`;
    const history = document.getElementById('history-list');
    history.replaceChildren();
    for (const record of state.history) {
      const entry = item(history, `Check ${record.number}: ${record.label}; original budget ${ms(record.budgetMs)}; initial readiness ${record.readiness}; contract ${record.outcome}; client recovery ${record.clientOutcome}. ${record.note || ''}`);
      const details = document.createElement('ul');
      for (const journey of record.journeys) {
        item(details, `${journey.id}: ${journey.verdict}; elapsed ${ms(journey.elapsedMs)}; original budget ${ms(journey.budgetMs)}. ${journey.reason}.`);
      }
      entry.append(details);
    }
  }

  try {
    state = model.createState();
  } catch (error) {
    standby.disabled = true;
    budget.disabled = true;
    inspectButton.disabled = true;
    rehearseButton.disabled = true;
    resetButton.disabled = true;
    showError(error);
    return;
  }
  for (const fixture of model.FIXTURES) {
    const option = document.createElement('option');
    option.value = fixture.id;
    option.textContent = fixture.label;
    standby.append(option);
  }
  standby.value = model.DEFAULT_INPUT.fixtureId;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      clearError();
      const rawBudget = budget.value;
      if (!['6000', '24000'].includes(rawBudget)) {
        budget.setAttribute('aria-invalid', 'true');
        throw new model.LessonError('ERR_INPUT', 'Choose exactly 6000 or 24000 synthetic milliseconds.');
      }
      if (!model.FIXTURES.some((fixture) => fixture.id === standby.value)) {
        standby.setAttribute('aria-invalid', 'true');
        throw new model.LessonError('ERR_INPUT', 'Choose a listed fictional standby.');
      }
      state = model.inspect(state, { fixtureId: standby.value, budgetMs: Number(rawBudget) });
      render();
    } catch (error) {
      showError(error);
    }
  });
  rehearseButton.addEventListener('click', () => {
    try {
      clearError();
      state = model.rehearse(state);
      render();
    } catch (error) {
      showError(error);
    }
  });
  resetButton.addEventListener('click', () => {
    try {
      clearError();
      state = model.reset(state);
      HTMLFormElement.prototype.reset.call(form);
      standby.value = model.DEFAULT_INPUT.fixtureId;
      budget.value = String(model.DEFAULT_INPUT.budgetMs);
      render();
      if (!standby.disabled) standby.focus();
      else statusPanel.focus();
    } catch (error) {
      showError(error);
    }
  });
  statusPanel.tabIndex = -1;
  render();
}());
