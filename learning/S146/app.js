(function () {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const status = byId('status');
  const errorOutput = byId('error');

  function announceError(message) {
    errorOutput.textContent = `Error: ${message} No measurement was added.`;
    errorOutput.hidden = false;
    errorOutput.focus();
  }

  if (!window.S146Fixtures || !window.S146Model) {
    document.querySelectorAll('button, select').forEach((control) => { control.disabled = true; });
    status.textContent = 'Lesson unavailable: a required local dependency is missing.';
    announceError('Required local fixed-data lesson scripts did not load.');
    return;
  }

  const model = window.S146Model;
  const fixtures = window.S146Fixtures;
  const phaseControl = byId('phase');
  const presetControl = byId('preset');
  let session = model.createSession();

  function clearError() {
    errorOutput.hidden = true;
    errorOutput.textContent = '';
  }

  function text(id, value) {
    byId(id).textContent = value;
  }

  function row(values) {
    const element = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = value;
      element.appendChild(cell);
    }
    return element;
  }

  function render() {
    const view = model.replay(session);
    const exhausted = view.eventCount >= model.MAX_EVENTS;
    byId('operator-form').dataset.stage = view.stage;
    byId('select-fixture').disabled = exhausted || view.history.length >= model.MAX_RUNS;
    byId('conduct').disabled = exhausted || view.stage !== 'selected';
    byId('inspect').disabled = exhausted || view.stage !== 'conducted';
    byId('measure').disabled = exhausted || view.stage !== 'inspected';
    const messages = {
      idle: 'Choose a phase and preset. No fault operation occurs.',
      selected: `Selected ${view.current && view.current.trace.fixtureId}. The request is a label, not evidence.`,
      conducted: 'Fixed fictional record replayed. Inspect actual observations before measuring.',
      inspected: 'Actual fixed observations are visible. Measure to classify the requested phase.',
      measured: `Measured ${view.history.at(-1) && view.history.at(-1).runId}; earlier results remain in history.`,
    };
    status.textContent = exhausted ? 'Eighty-four-event limit reached. Reset explicitly to start a new rehearsal.'
      : view.history.length >= model.MAX_RUNS ? 'Twelve-run limit reached. History retained until explicit reset.'
        : messages[view.stage];
    const inspected = ['inspected', 'measured'].includes(view.stage);
    text('trace', !view.current ? 'Select a fixed fixture; no observation has been inspected.'
      : JSON.stringify(inspected ? { fixedTrace: view.current.trace, journeyAssessments: view.result ? view.result.journeys : 'Not measured' }
        : { fixtureId: view.current.trace.fixtureId, requestOnly: view.current.trace.request, observations: 'Not inspected' }, null, 2));
    const matrixBody = byId('matrix-body');
    matrixBody.replaceChildren();
    for (const phase of fixtures.PHASES) {
      const window = inspected && view.current.trace.windows.find((item) => item.phase === phase);
      const measured = view.result && view.result.matrix.find((item) => item.phase === phase);
      const observed = window && window.observationId !== null && window.startMs !== null;
      matrixBody.appendChild(row([
        phase,
        observed ? `[${window.startMs}, ${window.endMs})` : inspected ? 'Unknown / unobserved' : 'Not inspected',
        measured ? measured.coverage : 'UNCOVERED (not measured)',
        measured ? measured.reason : 'No measured fault evidence for this phase.',
      ]));
    }
    for (const [id, key] of [
      ['coverage-result', 'coverage'], ['coverage-reason', 'reason'], ['detected-result', 'detected'],
      ['recovery-result', 'recovery'], ['impact-result', 'impact'], ['outcome-result', 'outcome'],
    ]) text(id, view.result ? view.result[key] : 'Not measured');
    const historyBody = byId('history-body');
    historyBody.replaceChildren();
    for (const entry of view.history) {
      historyBody.appendChild(row([
        `${entry.runId} / ${entry.fixtureId}`,
        `${entry.phase} / ${entry.result.actualCoveredPhases.join(', ') || 'none'}`,
        entry.result.coverage, entry.result.detected, entry.result.recovery, entry.result.impact, entry.result.outcome,
      ]));
    }
    const summary = view.summary;
    text('summary-coverage', `${summary.coveredPhases.length} / 7 phases covered by actual fixed observations. Still UNCOVERED: ${summary.uncoveredPhases.join(', ') || 'none in these fixtures only'}.`);
    text('retained', !summary.totalRuns ? 'No measured runs.'
      : `Retained: ${summary.totalRuns} runs / ${summary.uniqueFixtures} unique fictional fixtures; ${summary.interruptedRuns} interrupted, ${summary.unknownImpactRuns} unknown-impact, ${summary.uncoveredRuns} requested-phase uncovered, ${summary.unknownHandlingRuns} unknown-handling. Retained outcome: ${summary.retainedOutcome}. Replays are not independent trials.`);
  }

  function act(command, focusId) {
    try {
      session = model.advance(session, command);
      clearError();
      render();
      if (focusId && !byId(focusId).disabled) byId(focusId).focus();
    } catch (error) {
      render();
      announceError(error.message);
    }
  }

  byId('operator-form').addEventListener('submit', (event) => {
    event.preventDefault();
    act({ type: 'select', phase: phaseControl.value, preset: presetControl.value }, 'conduct');
  });
  for (const type of ['conduct', 'inspect', 'measure']) {
    const nextFocus = { conduct: 'inspect', inspect: 'measure', measure: 'select-fixture' }[type];
    byId(type).addEventListener('click', () => act({ type }, nextFocus));
  }
  for (const control of [phaseControl, presetControl]) {
    control.addEventListener('change', () => {
      if (model.replay(session).stage !== 'idle') act({ type: 'discard' });
    });
  }
  byId('reset-lesson').addEventListener('click', () => {
    session = model.createSession();
    phaseControl.value = 'provisioning';
    presetControl.value = 'observed';
    clearError();
    render();
    phaseControl.focus();
  });
  render();
}());
