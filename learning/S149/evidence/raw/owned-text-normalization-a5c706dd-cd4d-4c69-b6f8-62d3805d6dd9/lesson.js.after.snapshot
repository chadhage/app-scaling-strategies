'use strict';

(function conduct() {
  const model = globalThis.S149;
  const byId = (id) => document.getElementById(id);
  const form = byId('controls');
  const profile = byId('profile-choice');
  const basis = byId('count-basis');
  const expected = byId('expected-conclusion');
  let state = model.createSession();
  const text = (id, value) => { byId(id).textContent = value; };
  const count = (value) => value.toLocaleString('en-US');
  const probability = (value) => value === null ? 'null — unqualified / unavailable, not zero' : value.toPrecision(17);
  const fraction = (value, numerator, denominator) => value === null
    ? 'null — no attempted journey evidence, not 100% success'
    : `${value.toPrecision(17)} = ${count(numerator)} / ${count(denominator)}`;
  function clearError() {
    text('error', '');
    byId('error').hidden = true;
    [profile, basis, expected].forEach((control) => control.removeAttribute('aria-invalid'));
  }
  function error(message, control) {
    text('error', message);
    byId('error').hidden = false;
    if (control) {
      control.setAttribute('aria-invalid', 'true');
      control.focus();
    } else byId('error').focus();
  }
  function rows(id, data) {
    byId(id).replaceChildren(...data.map((values) => {
      const row = document.createElement('tr');
      values.forEach((value, index) => {
        const cell = document.createElement(index === 0 ? 'th' : 'td');
        if (index === 0) cell.scope = 'row';
        cell.textContent = String(value);
        row.append(cell);
      });
      return row;
    }));
  }
  function list(id, items) {
    byId(id).replaceChildren(...items.map((value) => {
      const item = document.createElement('li');
      item.textContent = value;
      return item;
    }));
  }
  function validChoices() {
    if (!model.profiles.some((entry) => entry.id === profile.value)) {
      error('Invalid fixed profile. Choose a listed fictional record.', profile);
      return false;
    }
    if (!model.units.includes(basis.value)) {
      error('Invalid fixed counting unit. Choose REQUEST, USER, EVENT or JOURNEY.', basis);
      return false;
    }
    if (!Object.hasOwn(model.conclusions, expected.value)) {
      error('Invalid fixed expected conclusion. Choose a listed teaching answer.', expected);
      return false;
    }
    return true;
  }
  function render() {
    const active = state.activeAttempt === null ? null : state.attempts[state.activeAttempt - 1];
    const assessment = active ? active.assessment : model.evaluate(profile.value, basis.value);
    const totals = model.summary(state);
    const { journeys, confidence, assumptions } = assessment;
    [profile, basis, expected].forEach((control) => { control.disabled = active !== null; });
    byId('inspect-record').disabled = active !== null || totals.attempts >= model.maxAttempts;
    byId('check-answer').disabled = !active || active.result !== null;
    text('attempt-mode', active ? `Retained attempt ${active.number} of 12 — fixed record selected.`
      : `Preview only — ${totals.attempts} retained attempts; select to begin an exercise.`);
    text('answer-status', active?.result ? `${active.result.verdict} — teaching answer only; not reliability certification`
      : 'UNCHECKED — teaching answer only');
    text('profile-scope', `${assessment.boundary.eventBoundary} Population: ${assessment.boundary.population} Window: ${assessment.boundary.observationWindow}`);
    text('representation', assessment.representation);
    rows('count-rows', [
      ...assessment.diagnostics.map((row) => [row.unit, count(row.count), row.role]),
      ['JOURNEY', count(journeys.started), 'All original started transition journeys, including interrupted and unknown outcomes.'],
    ]);
    text('selected-count', `${count(assessment.selected.count)} ${assessment.selected.unit} — ${assessment.selected.isJourneyDenominator ? 'correct journey counting unit; assumptions still required' : 'wrong unit for the journey denominator'}`);
    text('journey-counts', `${count(journeys.started)} started / ${count(journeys.uninterrupted)} uninterrupted / ${count(journeys.interrupted)} interrupted / ${count(journeys.unknown)} unknown`);
    text('success-rate', fraction(journeys.successFraction, journeys.uninterrupted, journeys.started));
    text('interruption-rate', fraction(journeys.observedInterruptionFraction, journeys.interrupted, journeys.started));
    text('unknown-rate', fraction(journeys.unknownFraction, journeys.unknown, journeys.started));
    rows('original-rows', journeys.originals.length
      ? journeys.originals.map((item) => [item.id, item.outcome, item.reason])
      : [['Summary only', journeys.started ? 'Fixed fictional aggregate' : 'No original starts', 'No individual trials generated, executed or observed.']]);
    text('recoveries', journeys.recoveries.length
      ? `Separate later usability: ${journeys.recoveries.map((item) => `${item.originalId} → ${item.laterOutcome}; countsAsOriginalSuccess: false`).join('; ')}. Original denominator/outcome unchanged.`
      : 'No separate recovery record; diagnostic request success supplies no missing journey outcome.');
    text('confidence-status', confidence.status);
    text('confidence-conclusion', confidence.conclusion);
    list('assumptions', [
      `Independence: ${assumptions.independent ? 'stipulated for the fictional illustration, not proven' : 'unqualified — shared dependence remains'}.`,
      `Comparability: ${assumptions.comparable ? 'stipulated for the fictional illustration, not proven' : 'unqualified — contexts differ'}.`,
      `Complete original observation: ${assumptions.completeObservation ? 'stipulated / no unknown originals in this fixed record' : 'unqualified — original started outcomes remain unknown'}.`,
      `Aggregate counts prove assumptions: false. ${assumptions.declaration}`,
    ]);
    text('qualifying-n', confidence.qualifyingN === null ? 'null — no qualifying n assigned' : count(confidence.qualifyingN));
    text('upper-bound', probability(confidence.upperInterruptionProbability));
    text('minimum-n', count(model.illustration.minimumN));
    text('previous-upper', `${probability(model.illustration.previousUpper)} > 0.00001`);
    text('minimum-upper', `${probability(model.illustration.minimumUpper)} ≤ 0.00001 — conditional only`);
    list('warnings', assessment.warnings);
    text('session-verdict', `${totals.teachingVerdict} — teaching answers only`);
    text('history-summary', `${totals.attempts} retained / ${totals.checked} checked / ${totals.answerFailures} wrong answers / ${totals.unchecked} unchecked. No reliability pooling or certification.`);
    rows('history-rows', state.attempts.map((attempt) => [
      attempt.number, `${model.getProfile(attempt.profileId).label} / ${attempt.basis}`,
      attempt.assessment.confidence.status, attempt.result ? `${attempt.result.verdict} — teaching only` : 'Unchecked — retained UNKNOWN',
    ]));
    text('records', JSON.stringify({
      schema: 'S149/ui/v1', session: totals, activeAttempt: state.activeAttempt,
      assessment, history: state.attempts, journal: state.journal, retainedSession: state,
    }, null, 2));
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    if (!validChoices()) return;
    try {
      state = model.dispatch(state, {
        action: 'select', revision: state.revision, profileId: profile.value, basis: basis.value, expected: expected.value,
      });
      render();
      byId('check-answer').focus();
    } catch (failure) { error(failure.message); }
  });
  byId('check-answer').addEventListener('click', () => {
    clearError();
    try {
      state = model.dispatch(state, { action: 'check', revision: state.revision });
      render();
      byId('answer-status').focus();
    } catch (failure) { error(failure.message); }
  });
  byId('archive-reset').addEventListener('click', () => {
    try {
      state = model.dispatch(state, { action: 'reset', revision: state.revision });
      form.reset();
      clearError();
      render();
      profile.focus();
    } catch (failure) { error(failure.message); }
  });
  [profile, basis, expected].forEach((control) => control.addEventListener('change', () => {
    clearError();
    if (validChoices()) render();
  }));
  render();
})(globalThis);
