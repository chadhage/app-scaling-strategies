(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S100 = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  /** @typedef {import('./model').State} State */
  /** @typedef {import('./model').Input} Input */
  /** @typedef {import('./model').Action} Action */
  const LIMITS = Object.freeze({ journeys: 4, budgetMs: 1000, rehearsals: 4 });
  const CONDITIONS = Object.freeze(['forced', 'orderly', 'gap']);
  const PREDICTIONS = Object.freeze(['interrupted', 'uninterrupted', 'unverified']);
  const METRICS = ['attempted', 'uninterrupted', 'interrupted', 'unknown',
    'lost', 'retried', 'duplicated', 'unresolved', 'late'];
  const IDENTITIES = Object.freeze([
    Object.freeze({ id: 'request-1', kind: 'request' }),
    Object.freeze({ id: 'request-2', kind: 'request' }),
    Object.freeze({ id: 'job-1', kind: 'job' }),
    Object.freeze({ id: 'job-2', kind: 'job' }),
  ]);

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function record(value, keys, code, name) {
    if (value === null || typeof value !== 'object'
        || Object.getPrototypeOf(value) !== Object.prototype) {
      fail(code, `${name} must be a plain typed record.`);
    }
    const own = Reflect.ownKeys(value);
    if (own.length !== keys.length || own.some((key) => !keys.includes(key))) {
      fail(code, `${name} has missing or unexpected fields.`);
    }
    for (const key of keys) {
      if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')) {
        fail(code, `${name} must contain data fields, not accessors.`);
      }
    }
  }

  function equal(actual, expected, code, name) {
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual) || Object.getPrototypeOf(actual) !== Array.prototype
          || actual.length !== expected.length
          || Reflect.ownKeys(actual).length !== expected.length + 1) {
        fail(code, `${name} must be the exact bounded dense array.`);
      }
      for (let i = 0; i < expected.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(actual, String(i));
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
          fail(code, `${name} must not contain holes or accessors.`);
        }
        equal(descriptor.value, expected[i], code, name);
      }
    } else if (expected !== null && typeof expected === 'object') {
      const keys = Object.keys(expected);
      record(actual, keys, code, name);
      for (const key of keys) equal(actual[key], expected[key], code, name);
    } else if (!Object.is(actual, expected)) {
      fail(code, `${name} does not match the typed fixed-trace contract.`);
    }
  }

  function freeze(value) {
    if (value !== null && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }

  function inputRecord(input, code = 'ERR_INPUT') {
    record(input, ['condition', 'prediction'], code, 'Input');
    if (typeof input.condition !== 'string' || !CONDITIONS.includes(input.condition)
        || typeof input.prediction !== 'string' || !PREDICTIONS.includes(input.prediction)) {
      fail(code, 'Choose a declared fixed trace and user-outcome prediction; values are not coerced.');
    }
    return { condition: input.condition, prediction: input.prediction };
  }

  function work(condition, observed) {
    return IDENTITIES.map((identity, index) => {
      const item = {
        ...identity, fromEpoch: 'old-v1', attemptedTransition: true,
        observedEpoch: null, completed: null, elapsedMs: null,
        effectCount: null, attempts: null, terminationRecorded: false,
      };
      if (observed && condition === 'orderly') {
        Object.assign(item, {
          observedEpoch: 'new-v2', completed: true,
          elapsedMs: [400, 700, 600, 800][index], effectCount: 1, attempts: 1,
        });
      } else if (observed && condition === 'forced') {
        item.terminationRecorded = true;
        if (index === 0) Object.assign(item, {
          observedEpoch: 'old-v1', completed: false,
          elapsedMs: 1001, effectCount: 0, attempts: 1,
        });
        if (index === 1) Object.assign(item, {
          observedEpoch: 'new-v2', completed: true,
          elapsedMs: 1300, effectCount: 1, attempts: 2,
        });
        if (index === 2) Object.assign(item, {
          observedEpoch: 'new-v2', completed: true,
          elapsedMs: 600, effectCount: 2, attempts: 2,
        });
      }
      const knownFailure = item.completed === false
        || (item.effectCount !== null && item.effectCount !== 1)
        || (item.elapsedMs !== null && item.elapsedMs > LIMITS.budgetMs)
        || (item.completed === true && item.observedEpoch === 'old-v1');
      const missing = item.completed === null || item.observedEpoch === null
        || item.elapsedMs === null || item.effectCount === null || item.attempts === null;
      item.outcome = knownFailure ? 'interrupted' : missing ? 'unknown' : 'uninterrupted';
      return item;
    });
  }

  function measure(input, items, stage, observed) {
    const result = Object.fromEntries(METRICS.map((key) => [key, 0]));
    result.attempted = items.length;
    for (const item of items) {
      result[item.outcome]++;
      if (item.completed === false && item.effectCount === 0) result.lost++;
      if (item.attempts !== null && item.attempts > 1) result.retried++;
      if (item.effectCount !== null && item.effectCount > 1) result.duplicated++;
      if (item.outcome === 'unknown') result.unresolved++;
      if (item.elapsedMs !== null && item.elapsedMs > LIMITS.budgetMs) result.late++;
    }
    result.userImpact = result.interrupted > 0 ? 'interrupted'
      : result.unknown > 0 ? 'unverified' : 'uninterrupted';
    result.predictionMatched = observed ? input.prediction === result.userImpact : null;
    result.verification = stage !== 'checked' || result.userImpact === 'unverified'
      ? 'unknown' : result.predictionMatched ? 'pass' : 'fail';
    result.accountingComplete = result.uninterrupted + result.interrupted + result.unknown === result.attempted;
    result.observationsComplete = result.unknown === 0 && observed;
    result.expectedInterruptionObserved = observed && input.condition === 'forced' && result.interrupted > 0;
    result.successfulSyntheticMigration = stage === 'checked' && result.observationsComplete
      && result.uninterrupted === LIMITS.journeys;
    result.cleanup = 'not-applicable-data-only';
    result.confirmedSuccessFraction = `${result.uninterrupted}/${result.attempted} confirmed; ${result.unknown} unknown`;
    result.reason = stage === 'cancelled'
      ? 'Reset before checking: retain the started attempt and any existing observations; educational verification is unknown.'
      : result.userImpact === 'unverified'
        ? 'Completion observations are missing; unknown started journeys cannot establish success.'
        : result.verification === 'fail'
          ? 'The prediction disagrees with the measured ledger; the measured user impact is unchanged.'
          : result.expectedInterruptionObserved
            ? 'Expected interruption detected and accounted: education passes, but users were interrupted and one outcome is unresolved.'
            : 'All four fixed journeys reached new-v2 correctly within the original budget; this is only a synthetic comparison.';
    return result;
  }

  function run(id, input, stage, observation) {
    const observed = observation === 'captured';
    const items = work(input.condition, observed);
    const trace = ['Start four attempted synthetic transition journeys on old-v1.'];
    if (observed) {
      trace.push(input.condition === 'forced'
        ? 'Apply fixed termination DATA: lost response, late retry, duplicate job effect, unresolved job.'
        : input.condition === 'orderly'
          ? 'Apply fixed orderly-handoff DATA: four timely, single-effect completions on new-v2.'
          : 'Apply fixed observation-gap DATA: no usable completion observations.');
    }
    if (stage === 'checked') trace.push('Check accounting and compare the prediction independently of user impact.');
    if (stage === 'cancelled') trace.push('Reset the current rehearsal; retain attempts and existing observations.');
    return {
      id, input: { ...input }, stage, observation, work: items, trace,
      result: stage === 'checked' || stage === 'cancelled' ? measure(input, items, stage, observed) : null,
    };
  }

  /** @param {State} state */
  function validateState(state) {
    record(state, ['schemaVersion', 'phase', 'currentRunId', 'history'], 'ERR_STATE', 'State');
    if (!['ready', 'active', 'observed', 'checked'].includes(state.phase)
        || !Array.isArray(state.history) || state.history.length > LIMITS.rehearsals) {
      fail('ERR_STATE', 'State phase or history exceeds the fixed contract.');
    }
    const history = [];
    for (let i = 0; i < state.history.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(state.history, String(i));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('ERR_STATE', 'History must be dense data.');
      const item = descriptor.value;
      record(item, ['id', 'input', 'stage', 'observation', 'work', 'trace', 'result'], 'ERR_STATE', 'Run');
      const input = inputRecord(item.input, 'ERR_STATE');
      const validStage = ['active', 'observed', 'checked', 'cancelled'].includes(item.stage);
      const validObservation = item.stage === 'active' ? item.observation === 'pending'
        : item.stage === 'cancelled' ? ['pending', 'captured'].includes(item.observation)
          : item.observation === 'captured';
      if (!validStage || !validObservation || item.id !== i + 1
          || (i < state.history.length - 1 && !['checked', 'cancelled'].includes(item.stage))) {
        fail('ERR_STATE', 'Run order, stage or observation is invalid.');
      }
      history.push(run(i + 1, input, item.stage, item.observation));
    }
    const last = history.at(-1);
    if (state.phase === 'ready') {
      if (last && !['checked', 'cancelled'].includes(last.stage)) fail('ERR_STATE', 'Ready state retains nonterminal work.');
    } else if (!last || last.stage !== state.phase) {
      fail('ERR_STATE', 'The current phase must identify the latest run.');
    }
    const expected = {
      schemaVersion: 1, phase: state.phase,
      currentRunId: state.phase === 'ready' ? null : history.length, history,
    };
    equal(state, expected, 'ERR_STATE', 'State');
    return expected;
  }

  /** @returns {State} */
  function createState() {
    return freeze({ schemaVersion: 1, phase: 'ready', currentRunId: null, history: [] });
  }

  /** @param {State} state @param {Action} action @returns {State} */
  function transition(state, action) {
    const next = validateState(state);
    if (action === null || typeof action !== 'object'
        || Object.getPrototypeOf(action) !== Object.prototype) {
      fail('ERR_ACTION', 'Action must be a typed record.');
    }
    const descriptor = Object.getOwnPropertyDescriptor(action, 'type');
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string'
        || !['start', 'observe', 'check', 'reset'].includes(descriptor.value)) {
      fail('ERR_ACTION', 'Choose a declared operator action.');
    }
    record(action, descriptor.value === 'start' ? ['type', 'input'] : ['type'], 'ERR_ACTION', 'Action');
    if (action.type === 'start') {
      const input = inputRecord(action.input);
      if (next.phase !== 'ready') fail('ERR_PHASE', 'Reset the current rehearsal before starting another.');
      if (next.history.length >= LIMITS.rehearsals) {
        fail('ERR_LIMIT', 'The four-rehearsal session allowance is exhausted; reset retains history and does not replenish it.');
      }
      next.history.push(run(next.history.length + 1, input, 'active', 'pending'));
      next.phase = 'active';
      next.currentRunId = next.history.length;
    } else if (action.type === 'observe') {
      if (next.phase !== 'active') fail('ERR_PHASE', 'Start work before applying one fixed trace.');
      const current = next.history.at(-1);
      next.history[next.history.length - 1] = run(current.id, current.input, 'observed', 'captured');
      next.phase = 'observed';
    } else if (action.type === 'check') {
      if (next.phase !== 'observed') fail('ERR_PHASE', 'Apply the fixed trace before checking its ledger.');
      const current = next.history.at(-1);
      next.history[next.history.length - 1] = run(current.id, current.input, 'checked', 'captured');
      next.phase = 'checked';
    } else {
      if (next.phase === 'active' || next.phase === 'observed') {
        const current = next.history.at(-1);
        next.history[next.history.length - 1] = run(current.id, current.input, 'cancelled', current.observation);
      }
      next.phase = 'ready';
      next.currentRunId = null;
    }
    return freeze(next);
  }

  /** @param {State} state @returns {import('./model').Totals} */
  function summarize(state) {
    const valid = validateState(state);
    const totals = Object.fromEntries(METRICS.map((key) => [key, 0]));
    totals.rehearsals = valid.history.length;
    totals.cancelled = 0;
    for (const item of valid.history) {
      const measured = measure(item.input, item.work, item.stage, item.observation === 'captured');
      for (const key of METRICS) totals[key] += measured[key];
      if (item.stage === 'cancelled') totals.cancelled++;
    }
    totals.confirmedSuccessFraction = totals.attempted === 0 ? '0/0 - no evidence'
      : `${totals.uninterrupted}/${totals.attempted} confirmed; ${totals.unknown} unknown`;
    return freeze(totals);
  }
  return Object.freeze({ LIMITS, CONDITIONS, PREDICTIONS, createState, transition, summarize });
}));
