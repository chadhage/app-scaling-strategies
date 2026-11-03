(function () {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const form = byId('rehearsal-form');
  const fixture = byId('fixture');
  const prediction = byId('prediction');
  const swap = byId('swap-values');
  const observe = byId('observe-destination');
  const reset = byId('reset-lesson');
  const error = byId('error');
  const model = globalThis.S105;
  if (!model || !['createState', 'transition', 'summarize'].every((name) => typeof model[name] === 'function')) {
    for (const control of form.elements) control.disabled = true;
    error.textContent = 'MODEL_UNAVAILABLE: The synthetic model could not load. No result has been produced. Reload after restoring the local bundle.';
    error.hidden = false;
    byId('status').textContent = 'Lesson unavailable — no synthetic result.';
    error.focus();
    return;
  }
  let state = model.createState();

  function render() {
    const view = model.summarize(state);
    const current = view.current;
    const before = current ? current.before : view.initial;
    const after = current ? current.after : null;
    const rows = [
      ['DISPLAY_LABEL', 'application', 'DISPLAY_LABEL', 'Movable in this fixture'],
      ['DATA_ALIAS', 'bound', 'DATA_ALIAS', 'Destination-bound in this fixture'],
      ['Principal token', 'bound', 'identity', 'Destination-bound in this fixture'],
      ['Network token', 'bound', 'network', 'Destination-bound in this fixture'],
    ];
    byId('comparison').replaceChildren(...rows.map(([label, group, key, rule]) => {
      const row = document.createElement('tr');
      row.dataset.property = key;
      const heading = document.createElement('th');
      heading.scope = 'row';
      heading.textContent = label;
      row.append(heading);
      for (const text of [
        before.sender[group][key], before.destination[group][key],
        after ? after.sender[group][key] : 'Not rehearsed',
        after ? after.destination[group][key] : 'Not rehearsed', rule,
      ]) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.append(cell);
      }
      return row;
    }));
    let status = 'No rehearsal attempted. Destination access is unobserved, not a pass.';
    if (view.phase === 'pending-observation') {
      status = 'Unknown — fictional values swapped, but destination access has not been observed.';
    } else if (current) {
      if (!current.predictionCorrect) {
        status = `Negative synthetic result — mistaken movement prediction. Separate destination access: ${current.access.outcome}. Principal, network and DATA_ALIAS stayed at the destination.`;
      } else if (current.result === 'positive') {
        status = 'Positive synthetic result — prediction matches the fixture and destination access observations pass.';
      } else if (current.result === 'negative') {
        status = 'Negative synthetic result — destination permission denied or network blocked. No success fallback.';
      } else {
        status = 'Unknown synthetic result — destination observations are missing. Not a positive result.';
      }
    }
    byId('status').textContent = status;
    byId('status').dataset.result = current ? current.result : 'none';
    byId('prediction-result').textContent = !current || current.predictionCorrect === null
      ? 'No prediction has been checked.'
      : `Prediction ${current.predictionCorrect ? 'correct' : 'incorrect'}: DATA_ALIAS, principal and network stayed destination-bound in this fiction.`;
    byId('access-result').textContent = !current
      ? 'Destination access has not been observed.'
      : `Fictional subject ${current.access.subject} on ${current.access.resource} through ${current.access.via}: permission ${current.access.permission}; path ${current.access.network}. ${current.access.observed ? 'Fixed teaching observation only.' : 'Unobserved; not a pass.'}`;
    byId('metrics').textContent = `Attempted: ${view.attempted}; observed: ${view.observed}; pending: ${view.pending}; positive: ${view.counts.positive}; negative: ${view.counts.negative}; unknown: ${view.counts.unknown}.`;
    byId('empty-history').hidden = view.history.length > 0;
    byId('history').replaceChildren(...view.history.map((event) => {
      const row = document.createElement('li');
      const snapshot = event.snapshot;
      const dest = snapshot.after.destination;
      row.dataset.step = String(event.step);
      row.dataset.result = snapshot.result;
      row.textContent = `Step ${event.step} · rehearsal ${event.run} · ${event.action} · ${snapshot.fixture} · ${snapshot.result}: DISPLAY_LABEL ${dest.application.DISPLAY_LABEL}; DATA_ALIAS ${dest.bound.DATA_ALIAS}; principal ${dest.bound.identity}; network ${dest.bound.network}; permission ${snapshot.access.permission}; path ${snapshot.access.network}; prediction ${snapshot.predictionCorrect === null ? 'unchecked' : snapshot.predictionCorrect ? 'correct' : 'incorrect'}.`;
      return row;
    }));
    const locked = view.pending === 1 || view.remaining === 0;
    fixture.disabled = locked;
    prediction.disabled = locked;
    swap.disabled = locked;
    observe.disabled = view.pending !== 1;
  }

  function perform(action) {
    try {
      state = model.transition(state, action);
      error.textContent = '';
      error.hidden = true;
      render();
      if (action.type === 'swap') observe.focus();
      else if (fixture.disabled) reset.focus();
      else fixture.focus();
    } catch (failure) {
      error.textContent = `${failure.code || 'LESSON_ERROR'}: ${failure.message || 'The action failed.'} Previous history is retained; correct the selection or reset explicitly.`;
      error.hidden = false;
      error.focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    perform({ type: 'swap', fixture: fixture.value, prediction: prediction.value });
  });
  observe.addEventListener('click', () => perform({ type: 'observe' }));
  reset.addEventListener('click', () => {
    fixture.value = 'matched';
    prediction.value = 'destination-bound';
    perform({ type: 'reset' });
  });
  render();
}());
