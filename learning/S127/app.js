'use strict';

(function start() {
  const errorBox = document.getElementById('lesson-error');
  const status = document.getElementById('lesson-status');
  if (!globalThis.S127Lesson) {
    document.querySelectorAll('button, input, select, fieldset').forEach((control) => { control.disabled = true; });
    status.textContent = 'Lesson unavailable: required model asset did not load.';
    errorBox.hidden = false;
    errorBox.textContent = 'Lesson code did not load; controls remain unavailable. Restore the complete folder and reload.';
    return;
  }
  const api = globalThis.S127Lesson;
  const lesson = api.createLesson();
  const form = document.getElementById('settings-form');
  const fields = document.getElementById('settings-fields');
  const choose = document.getElementById('choose-settings');
  const observe = document.getElementById('observe-data');
  const rollout = document.getElementById('rehearse-step');
  const drain = document.getElementById('drain-work');
  const reset = document.getElementById('reset-lesson');
  const disruptionChoice = document.getElementById('disruption-record');
  const compare = document.getElementById('compare-disruption');
  const resultBox = document.getElementById('current-result');
  const trace = document.getElementById('current-trace');
  const disruptionBox = document.getElementById('disruption-result');
  const history = document.getElementById('retained-history');
  const count = document.getElementById('history-count');

  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
    for (const control of form.elements) {
      control.removeAttribute('aria-invalid');
      if (control.id === 'grace-seconds') control.setAttribute('aria-describedby', 'grace-help');
      else control.removeAttribute('aria-describedby');
    }
  }

  function resultText(result) {
    return `Verification ${result.verification}; transition ${result.transition}; cleanup ${result.cleanup}. `
      + `Transitions: ${result.attemptedTransitions} attempted, ${result.successfulTransitions} successful, `
      + `${result.interruptedTransitions} interrupted, ${result.unknownTransitions} unknown. `
      + `Old-only: ${result.oldOnly.succeeded}/${result.oldOnly.attempted} (not transitions). `
      + `Desired ${result.desiredReplicas}; observed ready ${result.observedReadyBefore}; ready floor ${result.readyFloor}; peak pods ${result.peakPods}. `
      + `Drain: ${result.drain.succeeded}/${result.drain.attempted} completed, ${result.drain.interrupted} interrupted; `
      + `PreStop ${result.drain.preStopSeconds}s; remaining grace ${result.drain.availableSeconds === null ? 'not started' : `${result.drain.availableSeconds}s`}. `
      + 'Synthetic only; native qualification false.';
  }

  function disruptionText(result) {
    return `${result.kind}: verification ${result.verification}; ${result.outcome}. `
      + `PDB applies ${result.pdbApplies}; eviction allowed ${result.evictionAllowed === null ? 'not established/not applicable' : result.evictionAllowed}. `
      + `Observed ready after ${result.observedReadyAfter === null ? 'unknown' : result.observedReadyAfter}; required ${result.requiredReady}. `
      + `Journeys ${result.attemptedJourneys}: ${result.succeeded} successful, ${result.interrupted} interrupted, ${result.unknown} unknown. `
      + 'No universal node/zone/region protection; independent DATA comparison only.';
  }

  function render() {
    const state = lesson.snapshot();
    fields.disabled = state.phase !== 'idle' || state.runsUsed >= api.MAX_RUNS;
    choose.disabled = fields.disabled;
    observe.disabled = state.phase !== 'planned';
    rollout.disabled = state.phase !== 'observed';
    drain.disabled = state.phase !== 'rolling';
    reset.disabled = false;
    const canCompare = ['done', 'held'].includes(state.phase) && !state.disruption;
    disruptionChoice.disabled = !canCompare;
    compare.disabled = !canCompare;
    status.textContent = `Phase ${state.phase}. Rehearsal ${state.runId}; ${state.runsUsed}/${api.MAX_RUNS} used. `
      + (state.runsUsed >= api.MAX_RUNS && state.phase === 'idle' ? 'Bound reached; reload explicitly to clear history.' : 'Follow record -> observe -> rollout -> drain. Reset retains history.');
    resultBox.textContent = state.result ? resultText(state.result) : 'No current result; retained results remain in history.';
    trace.textContent = state.observation || state.result
      ? JSON.stringify({ observation: state.observation, result: state.result }, null, 2) : 'No observation yet.';
    disruptionBox.textContent = state.disruption ? disruptionText(state.disruption) : 'No current disruption comparison.';
    history.replaceChildren();
    for (const event of state.history) {
      const item = document.createElement('li');
      item.textContent = `#${event.sequence} run ${event.runId} ${event.action}: `
        + (['rollout', 'drain'].includes(event.action) ? resultText(event.data)
          : event.action === 'disrupt' ? disruptionText(event.data) : JSON.stringify(event.data));
      history.append(item);
    }
    count.textContent = `${state.history.length} / ${api.MAX_HISTORY} entries; ${state.runsUsed} / ${api.MAX_RUNS} rehearsals.`;
  }

  function showError(error) {
    errorBox.hidden = false;
    errorBox.textContent = error instanceof api.LessonError ? `${error.code}: ${error.message}`
      : 'Unexpected lesson error; no successful result is claimed. Reset current rehearsal or reload.';
    if (error.field) {
      const control = form.elements.namedItem(error.field);
      if (control) {
        control.setAttribute('aria-invalid', 'true');
        control.setAttribute('aria-describedby', control.id === 'grace-seconds' ? 'grace-help lesson-error' : 'lesson-error');
      }
    }
    errorBox.focus();
  }

  function act(action, focus) {
    clearError();
    try {
      lesson.dispatch(action);
      render();
      if (focus && !focus.disabled) focus.focus();
      return true;
    } catch (error) {
      showError(error);
      return false;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    let settings;
    try {
      const controls = {};
      for (const key of Object.keys(api.OPTIONS).filter((name) => name !== 'disruption')) {
        controls[key] = form.elements.namedItem(key).value;
      }
      settings = api.parseControls(controls);
    } catch (error) {
      showError(error);
      return;
    }
    act({ type: 'configure', settings }, observe);
  });
  observe.addEventListener('click', () => act({ type: 'observe' }, rollout));
  rollout.addEventListener('click', () => {
    if (act({ type: 'rollout' })) {
      const next = lesson.snapshot().phase === 'rolling' ? drain : compare;
      if (!next.disabled) next.focus();
    }
  });
  drain.addEventListener('click', () => act({ type: 'drain' }, compare));
  compare.addEventListener('click', () => act({ type: 'disrupt', kind: disruptionChoice.value }));
  reset.addEventListener('click', () => {
    if (act({ type: 'reset' })) {
      HTMLFormElement.prototype.reset.call(form);
      disruptionChoice.selectedIndex = 0;
      if (!fields.disabled) form.elements.namedItem('maxUnavailable').focus();
    }
  });
  render();
}());
