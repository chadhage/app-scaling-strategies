(function () {
  'use strict';
  const fixtures = globalThis.S074Fixtures;
  const lesson = globalThis.S074Model.createLesson();
  const byId = (id) => document.getElementById(id);
  const text = (id, value) => { byId(id).textContent = value; };
  function rows(id, values) {
    byId(id).replaceChildren(...values.map((cells) => {
      const row = document.createElement('tr');
      cells.forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      });
      return row;
    }));
  }
  function clearError() {
    byId('input-error').hidden = true;
    text('input-error', '');
    document.querySelectorAll('[aria-invalid]').forEach((node) => node.removeAttribute('aria-invalid'));
  }
  function showError(error) {
    text('input-error', error.message);
    byId('input-error').hidden = false;
    const field = byId(error.field);
    if (field && !field.disabled) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    } else byId('input-error').focus();
  }
  function render(state) {
    const { pressure, result, prediction, history, totals } = state;
    const idle = state.phase === 'idle';
    const evaluated = state.phase === 'evaluated';
    byId('settings').disabled = !idle;
    byId('apply-pressure').disabled = !idle || history.length >= fixtures.historyLimit;
    byId('check-continuity').disabled = state.phase !== 'pressured';
    byId('prediction').disabled = !evaluated;
    byId('retain-attempt').disabled = !evaluated;
    byId('new-attempt').disabled = state.phase !== 'checked';
    text('phase', `Phase: ${state.phase}`);
    text('pressure-metrics', pressure
      ? `Pressure: logical tick ${pressure.tick} · capacity ${pressure.slots} · evicted ${pressure.evicted.length} · remaining ${pressure.remaining.length}`
      : 'Pressure: not applied · initial entries: 2');
    rows('cache-rows', fixtures.entries.map((entry) => {
      const eviction = pressure && pressure.evicted.find((item) => item.key === entry.key);
      return [entry.key, entry.kind, entry.expiresAt, !pressure ? 'not applied' : eviction ? `evicted: ${eviction.reason}` : 'cache retained'];
    }));
    text('outcome', `Journey outcome: ${result ? result.outcome : 'not checked'}`);
    byId('outcome').dataset.outcome = result ? result.outcome : '';
    text('miss-metrics', result
      ? `Cache misses: required ${result.requiredMisses} · optional ${result.optionalMisses}`
      : 'Cache misses: required not checked · optional not checked');
    text('recovery-metrics', result
      ? `Durable recoveries: ${result.recovered} · optional recomputations: ${result.recomputed}`
      : 'Durable recoveries: not checked · optional recomputations: not checked');
    text('state-metrics', result
      ? `Required state: ${result.requiredState} · preserved ${result.requiredPreserved} · lost ${result.lostRequiredState} · unverified ${result.unverified}`
      : 'Required state: not checked');
    text('response-metrics', result
      ? `Synthetic response: ${result.status === null ? 'unverified' : result.status} · source ${result.source} · ${result.reason}`
      : 'Synthetic response: not checked');
    text('impact', !result ? 'User-impact model: no continuity check yet.'
      : result.outcome === 'SUCCESS' ? 'User-impact model: exact required state preserved in this synthetic case; no native continuity claim.'
        : result.outcome === 'FAILURE' ? 'User-impact model: interrupted journey 1. Explicit rejection or status 200 does not erase the failure.'
          : 'User-impact model: continuity unverified 1. Neither survival nor loss is established; not success.');
    rows('comparison-rows', Object.entries(fixtures.required).map(([field, expected]) => {
      const comparison = result && result.comparison.find((entry) => entry.field === field);
      return [field, expected, comparison ? comparison.actual === null ? '(not served)' : comparison.actual : 'not checked',
        comparison ? comparison.status : 'not checked'];
    }));
    text('durable-observed', result
      ? `Durable record observed: ${result.durableObserved ? JSON.stringify(result.durableObserved) : 'none consumed or unavailable'}`
      : 'Durable record observed: not checked');
    text('learning-result', prediction
      ? `Learning prediction ${prediction.correct ? 'correct' : 'incorrect'}; measured outcome remains ${result.outcome}.`
      : 'Learning prediction not checked.');
    text('trace', state.trace.length ? state.trace.join('\n') : 'No pressure applied.');
    rows('history-rows', history.map((entry) => [
      entry.id, entry.input.pressure, `${entry.input.durable} / ${entry.input.response}`,
      entry.result.outcome, `${entry.result.requiredMisses} / ${entry.result.optionalMisses}`,
      entry.prediction.correct ? 'correct' : 'incorrect',
    ]));
    text('history-count', `Retained completed attempts: ${history.length} / ${fixtures.historyLimit}`);
    text('totals', `Retained outcomes: success ${totals.success} · failure ${totals.failure} · unknown ${totals.unknown}`);
    text('retained-proof', history.length ? JSON.stringify(history, null, 2) : '');
  }
  function action(operation, focus) {
    clearError();
    try {
      const state = operation();
      render(state);
      byId(focus).focus();
    } catch (error) {
      showError(error);
    }
  }
  byId('settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    action(() => lesson.applyPressure({
      pressure: byId('pressure').value, durable: byId('durable').value, response: byId('response').value,
    }), 'check-continuity');
  });
  byId('check-continuity').addEventListener('click', () => action(() => lesson.evaluate(), 'prediction'));
  byId('prediction-form').addEventListener('submit', (event) => {
    event.preventDefault();
    action(() => lesson.check(byId('prediction').value), 'new-attempt');
  });
  function restoreControls() {
    byId('settings-form').reset();
    byId('prediction-form').reset();
    byId('retained-detail').open = false;
  }
  byId('new-attempt').addEventListener('click', () => {
    action(() => {
      const state = lesson.newAttempt();
      restoreControls();
      return state;
    }, lesson.snapshot().history.length < fixtures.historyLimit ? 'apply-pressure' : 'reset-rehearsal');
  });
  byId('reset-rehearsal').addEventListener('click', () => {
    action(() => {
      restoreControls();
      return lesson.reset();
    }, 'apply-pressure');
  });
  render(lesson.snapshot());
}());
