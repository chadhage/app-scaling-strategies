(function (root, factory) {
  'use strict';
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.S093Model = model;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const constants = freeze({
    scenarios: ['slow-200', 'within-budget', 'unmeasured-200'],
    budgets: [1000, 1500],
    actions: ['expand', 'hold'],
    maxAttempts: 6,
    initialCanaryPercent: 25,
  });
  const durations = freeze({
    'slow-200': [420, 1700, 2400],
    'within-budget': [420, 700, 1000],
    'unmeasured-200': [420, null, 700],
  });

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function problem(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function hasKeys(value, keys) {
    return value !== null && typeof value === 'object'
      && Object.getPrototypeOf(value) === Object.prototype
      && Reflect.ownKeys(value).length === keys.length
      && keys.every((key) => Object.hasOwn(value, key)
        && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
  }

  function denseArray(value) {
    return Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
      && Reflect.ownKeys(value).length === value.length + 1
      && Array.from({ length: value.length }, (_, index) => index).every((index) =>
        Object.hasOwn(value, index)
        && Object.hasOwn(Object.getOwnPropertyDescriptor(value, index), 'value'));
  }

  function sameData(actual, expected) {
    if (expected === null || typeof expected !== 'object') return actual === expected;
    if (Array.isArray(expected)) {
      return denseArray(actual) && actual.length === expected.length
        && expected.every((value, index) => sameData(actual[index], value));
    }
    const keys = Object.keys(expected);
    return hasKeys(actual, keys) && keys.every((key) => sameData(actual[key], expected[key]));
  }

  function validateSelection(selection) {
    if (!hasKeys(selection, ['scenario', 'budgetMs', 'action'])
        || !constants.scenarios.includes(selection.scenario)
        || !constants.budgets.includes(selection.budgetMs)
        || !constants.actions.includes(selection.action)) {
      throw problem('ERR_INPUT', 'Choose a declared trace, budget and expand/hold action. No other inputs are supported.');
    }
  }

  function evaluate(selection, id) {
    validateSelection(selection);
    const savedSelection = { ...selection };
    const journeys = durations[selection.scenario].map((durationMs, index) => ({
      id: `journey-${index + 1}`,
      status: 200,
      durationMs,
      budgetMs: selection.budgetMs,
      outcome: durationMs === null ? 'unknown'
        : durationMs > selection.budgetMs ? 'interrupted' : 'success',
    }));
    const metrics = {
      attempted: journeys.length,
      http200: journeys.length,
      success: journeys.filter((journey) => journey.outcome === 'success').length,
      interrupted: journeys.filter((journey) => journey.outcome === 'interrupted').length,
      unknown: journeys.filter((journey) => journey.outcome === 'unknown').length,
    };
    const acceptance = metrics.interrupted > 0 ? 'failure'
      : metrics.unknown > 0 ? 'unknown' : 'success';
    const verification = acceptance === 'unknown' ? 'unknown'
      : selection.action === 'expand' && acceptance === 'failure' ? 'fail' : 'pass';
    const expansion = selection.action === 'hold' ? 'held'
      : acceptance === 'success' ? 'allowed' : 'blocked';
    const explanation = acceptance === 'failure'
      ? `${metrics.interrupted} of 3 synthetic journeys exceed ${selection.budgetMs} ms. Reject the candidate; HTTP 200 does not override journey failure.`
      : acceptance === 'unknown'
        ? 'One synthetic journey has no completion latency. Hold expansion; HTTP 200 cannot supply missing evidence.'
        : 'All three synthetic journeys meet the inclusive budget. This rehearsal permits expansion only when requested.';
    return {
      id, selection: savedSelection, acceptance, verification, expansion,
      initialCanaryPercent: 25,
      nextCanaryPercent: expansion === 'allowed' ? 50 : 25,
      metrics, journeys, explanation,
    };
  }

  function validateState(state) {
    if (!hasKeys(state, ['schemaVersion', 'phase', 'history', 'currentId'])
        || state.schemaVersion !== 1
        || !['ready', 'decided'].includes(state.phase)
        || !Array.isArray(state.history)
        || state.history.length > constants.maxAttempts
        || !denseArray(state.history)
        || (state.phase === 'ready' && state.currentId !== null)
        || (state.phase === 'decided'
          && (state.history.length === 0 || state.currentId !== state.history.length))) {
      throw problem('ERR_STATE', 'Invalid rehearsal state. No decision or history change was applied.');
    }
    for (let index = 0; index < state.history.length; index += 1) {
      const record = state.history[index];
      let expected;
      try {
        expected = evaluate(record && record.selection, index + 1);
      } catch {
        throw problem('ERR_STATE', 'Invalid saved trace. History cannot be relabelled as success.');
      }
      if (!sameData(record, expected)) {
        throw problem('ERR_STATE', 'Altered saved trace. History cannot be relabelled as success.');
      }
    }
  }

  function createState() {
    return freeze({ schemaVersion: 1, phase: 'ready', history: [], currentId: null });
  }

  function decide(state, selection) {
    validateState(state);
    validateSelection(selection);
    if (state.phase !== 'ready') {
      throw problem('ERR_STATE', 'This decision is complete. Reset the current rehearsal before another attempt.');
    }
    if (state.history.length === constants.maxAttempts) {
      throw problem('ERR_HISTORY_LIMIT', 'Six decisions are retained. This session is full; reset cannot erase failures or refill its allowance.');
    }
    const record = evaluate(selection, state.history.length + 1);
    return freeze({
      schemaVersion: 1, phase: 'decided',
      history: [...state.history, record], currentId: record.id,
    });
  }

  function reset(state) {
    validateState(state);
    return freeze({
      schemaVersion: 1, phase: 'ready', history: [...state.history], currentId: null,
    });
  }

  function summarize(state) {
    validateState(state);
    const total = { runs: state.history.length, attempted: 0, http200: 0, success: 0, interrupted: 0, unknown: 0 };
    for (const record of state.history) {
      for (const key of ['attempted', 'http200', 'success', 'interrupted', 'unknown']) {
        total[key] += record.metrics[key];
      }
    }
    return freeze(total);
  }

  return freeze({ constants, createState, decide, reset, summarize });
}));
