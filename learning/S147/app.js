(function () {
  'use strict';
  const ids = [
    'exercise-form', 'fixture-picker', 'conduct-button', 'inspect-button', 'verdict-picker',
    'check-button', 'lesson-reset', 'error-output', 'status-output', 'fixture-description',
    'trace-output', 'assertion-summary', 'assertions-output', 'impact-summary', 'impact-output',
    'journeys-output', 'transport-output', 'conformance-output', 'check-output',
    'history-summary', 'history-output',
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  const put = (id, text) => { elements[id].textContent = text; };
  const json = (id, value) => put(id, JSON.stringify(value, null, 2));
  let lesson;
  let state;

  function clearError() {
    elements['error-output'].hidden = true;
    put('error-output', '');
  }

  function showError(message) {
    put('error-output', message);
    elements['error-output'].hidden = false;
    elements['error-output'].focus();
  }

  function impactText(impact) {
    const n = impact.denominator;
    return `${impact.completed}/${n} completed; ${impact.interrupted}/${n} interrupted; `
      + `${impact.unknown}/${n} unknown; ${impact.laterRecoveryObserved}/${n} later recovery observed (not extra original successes).`;
  }

  function renderHistory() {
    const history = elements['history-output'];
    history.replaceChildren();
    for (const run of state.runs) {
      const row = document.createElement('li');
      row.dataset.runId = run.runId;
      const heading = document.createElement('p');
      heading.textContent = `${run.runId}: ${run.fixtureId} — ${run.phase}`;
      row.append(heading);
      const detail = document.createElement('p');
      detail.textContent = run.report
        ? `Original impact: ${impactText(run.report.originalImpact)}`
        : 'Client evidence not inspected; no outcome is inferred.';
      row.append(detail);
      for (const check of run.checks) {
        const line = document.createElement('p');
        line.textContent = `Check ${check.checkNumber}: learner ${check.verifierVerdict}; `
          + `selected ${check.selectedVerdict}; client verdict ${check.expectedVerdict}. Original impact unchanged.`;
        row.append(line);
      }
      history.append(row);
    }
    put('history-summary', `${state.runs.length} / ${lesson.MAX_RUNS} retained runs. Epoch ${state.epoch}; revision ${state.revision}.`);
  }

  function render() {
    const current = state.runs.at(-1);
    const unfinished = current && current.phase !== 'checked';
    elements['fixture-picker'].disabled = Boolean(unfinished) || state.runs.length >= lesson.MAX_RUNS;
    elements['conduct-button'].disabled = Boolean(unfinished) || state.runs.length >= lesson.MAX_RUNS;
    elements['inspect-button'].disabled = !current || current.phase !== 'conducted';
    const canCheck = current && current.phase !== 'conducted' && current.checks.length < lesson.MAX_CHECKS;
    elements['verdict-picker'].disabled = !canCheck;
    elements['check-button'].disabled = !canCheck;
    if (!current) {
      put('status-output', 'Ready. No fictional journey has been conducted.');
      put('fixture-description', 'No fixture selected.');
      put('trace-output', 'No trace yet.');
    } else {
      const fixture = lesson.fixtures.find((item) => item.id === current.fixtureId);
      put('fixture-description', `${fixture.title}. ${fixture.description}`);
      json('trace-output', fixture);
      put('status-output', current.phase === 'conducted'
        ? 'Fixed trace conducted. Inspect required client evidence; HTTP status is not an outcome.'
        : 'Client evidence inspected. Choose a verdict; missing observations remain unknown.');
    }
    const report = current?.report;
    if (report) {
      const summary = report.assertionSummary;
      put('assertion-summary', `${summary.pass}/${summary.denominator} PASS; ${summary.fail}/${summary.denominator} FAIL; `
        + `${summary.unknown}/${summary.denominator} UNKNOWN. Denominator: five assertions per attempt record.`);
      json('assertions-output', report.assertions);
      put('impact-summary', impactText(report.originalImpact));
      json('impact-output', report.originalImpact);
      json('journeys-output', report.journeys);
      json('transport-output', report.transportSummary);
      json('conformance-output', {
        detectedAcceptanceFailure: report.detectedAcceptanceFailure,
        expectedNegativeConformance: report.expectedNegativeConformance,
      });
    } else {
      put('assertion-summary', 'No assertions inspected.');
      json('assertions-output', []);
      put('impact-summary', 'No original impact inspected.');
      for (const id of ['impact-output', 'journeys-output', 'transport-output', 'conformance-output']) json(id, null);
    }
    const check = current?.checks.at(-1);
    if (check) {
      json('check-output', check);
      put('status-output', `Learner ${check.verifierVerdict}; client verdict ${check.expectedVerdict}. `
        + `Original impact remains: ${impactText(check.originalImpact)}`);
    } else put('check-output', 'No selection checked.');
    renderHistory();
  }

  function perform(command, focusId) {
    clearError();
    try {
      state = lesson.transition(state, { ...command, epoch: state.epoch, revision: state.revision });
      render();
      const check = state.runs.at(-1)?.checks.at(-1);
      if (command.type === 'check' && check.verifierVerdict === 'FAIL') {
        showError(`Learner FAIL: ${check.explanation}`);
      } else elements[focusId].focus();
    } catch (error) {
      showError(`${error.code || 'ERR_UI'}: ${error.message}. Retained rehearsal history is unchanged.`);
    }
  }

  try {
    if (Object.values(elements).some((element) => !element)) throw new Error('Required lesson controls are unavailable.');
    lesson = globalThis.S147Lesson;
    if (!lesson || lesson.VERSION !== 'S147/lesson-v1') throw new Error('The fixed oracle module is unavailable or incompatible.');
    state = lesson.initialState();
    for (const fixture of lesson.fixtures) {
      const option = document.createElement('option');
      option.value = fixture.id;
      option.textContent = fixture.title;
      elements['fixture-picker'].append(option);
    }
    elements['conduct-button'].addEventListener('click', () => {
      elements['verdict-picker'].value = '';
      perform({ type: 'conduct', fixtureId: elements['fixture-picker'].value }, 'inspect-button');
    });
    elements['inspect-button'].addEventListener('click', () => {
      perform({ type: 'inspect', runId: state.runs.at(-1)?.runId }, 'verdict-picker');
    });
    elements['exercise-form'].addEventListener('submit', (event) => {
      event.preventDefault();
      perform({
        type: 'check', runId: state.runs.at(-1)?.runId, verdict: elements['verdict-picker'].value,
      }, 'check-output');
    });
    elements['lesson-reset'].addEventListener('click', () => {
      clearError();
      try {
        state = lesson.reset(state);
        elements['fixture-picker'].value = '';
        elements['verdict-picker'].value = '';
        render();
        elements['fixture-picker'].focus();
      } catch (error) {
        showError(`${error.code || 'ERR_UI'}: ${error.message}. Reset was not applied.`);
      }
    });
    render();
    document.body.dataset.lessonReady = 'true';
  } catch (error) {
    document.querySelectorAll('button, select').forEach((element) => { element.disabled = true; });
    if (elements['status-output']) put('status-output', 'Lesson unavailable. No client outcome can be inferred.');
    if (elements['error-output']) showError(`ERR_INITIALIZATION: ${error.message}`);
    document.body.dataset.lessonReady = 'error';
  }
}());
