(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./fixtures.js'));
  else root.S084Model = factory(root.S084Fixtures);
}(typeof globalThis === 'object' ? globalThis : this, function (fixtures) {
  'use strict';
  const DEFAULTS = Object.freeze({ retryPolicy: 'remembered', evidence: 'complete' });
  const MAX_ATTEMPTS = 4;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const choices = {
    retryPolicy: ['remembered', 'blind'],
    evidence: ['complete', 'cleanup-unobserved'],
  };
  function reject(code, message, field) {
    const error = new Error(message);
    error.code = code;
    if (field) error.field = field;
    throw error;
  }
  function validateSettings(input) {
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype
        || Reflect.ownKeys(input).length !== 2
        || Reflect.ownKeys(input).some((key) => !Object.hasOwn(choices, key))) {
      reject('INVALID_INPUT', 'Choose exactly the two fixed synthetic settings.');
    }
    const result = {};
    for (const [field, values] of Object.entries(choices)) {
      const property = Object.getOwnPropertyDescriptor(input, field);
      if (!property || !Object.hasOwn(property, 'value') || !values.includes(property.value)) {
        reject('INVALID_INPUT', `Choose a listed ${field} value.`, field);
      }
      result[field] = property.value;
    }
    return result;
  }
  const initial = (history = []) => ({
    phase: 'idle', settings: { ...DEFAULTS }, observation: null, result: null,
    prediction: null, learning: null, trace: [], history, maxAttempts: MAX_ATTEMPTS,
  });
  function createLesson() {
    let state = initial();
    const snapshot = () => clone(state);
    const expect = (phase) => {
      if (state.phase !== phase) reject('INVALID_STATE', `Action requires ${phase}; current phase is ${state.phase}.`);
    };
    const addAuditTrace = (entries) => entries.map((entry) =>
      `${entry.deliveryId} | ${entry.operationKey} | ${entry.status} | ${entry.receipt}`);
    return {
      snapshot,
      deliver(input) {
        expect('idle');
        const settings = validateSettings(input);
        if (state.history.length >= MAX_ATTEMPTS) reject('ATTEMPT_LIMIT', 'Four attempts retained; reset all local data to begin again.');
        state.settings = settings;
        state.observation = clone(fixtures.first);
        state.phase = 'delivered';
        state.trace = addAuditTrace(state.observation.audit);
        return snapshot();
      },
      retry() {
        expect('delivered');
        state.observation = clone(fixtures.cases[state.settings.retryPolicy][state.settings.evidence]);
        state.phase = 'retried';
        state.trace.push(...addAuditTrace(state.observation.audit.slice(3)));
        return snapshot();
      },
      verify() {
        expect('retried');
        const observed = state.observation;
        const unknown = observed.audit.filter((entry) => entry.status === 'UNKNOWN').length;
        const gates = {
          resources: observed.duplicateResources === 0 ? 'PASS' : 'FAIL',
          swaps: observed.swaps === 1 ? 'PASS' : 'FAIL',
          state: observed.routeTargetPresent ? 'PASS' : 'FAIL',
          cleanup: observed.cleanupErrors === null ? 'UNKNOWN' : observed.cleanupErrors === 0 ? 'PASS' : 'FAIL',
          audit: unknown ? 'UNKNOWN' : 'PASS',
        };
        const values = Object.values(gates);
        const outcome = values.includes('FAIL') ? 'FAIL' : values.includes('UNKNOWN') ? 'UNKNOWN' : 'PASS';
        state.result = {
          outcome, gates, logicalOperations: fixtures.logicalOperations, deliveries: fixtures.deliveries,
          known: fixtures.deliveries - unknown, unknown,
          finalEvidenceComplete: observed.finalEvidenceComplete,
        };
        state.phase = 'verified';
        state.trace.push(`VERIFY ${outcome}: ${state.result.known} known + ${unknown} unknown of six delivery outcomes.`);
        return snapshot();
      },
      check(prediction) {
        expect('verified');
        if (!['PASS', 'FAIL', 'UNKNOWN'].includes(prediction)) {
          reject('INVALID_INPUT', 'Predict PASS, FAIL or UNKNOWN before retaining this attempt.', 'prediction');
        }
        state.prediction = prediction;
        state.learning = { correct: prediction === state.result.outcome };
        state.phase = 'checked';
        state.trace.push(`PREDICTION ${prediction}: ${state.learning.correct ? 'correct' : 'incorrect'}; measured result unchanged.`);
        state.history.push(clone({
          attempt: state.history.length + 1, sourceId: 'S084',
          settings: state.settings, observation: state.observation, result: state.result,
          prediction: state.prediction, learning: state.learning, trace: state.trace,
        }));
        return snapshot();
      },
      newAttempt() {
        expect('checked');
        if (state.history.length >= MAX_ATTEMPTS) reject('ATTEMPT_LIMIT', 'Four attempts retained; reset all local data to begin again.');
        state = initial(state.history);
        return snapshot();
      },
      reset() {
        state = initial();
        return snapshot();
      },
    };
  }
  return { createLesson, DEFAULTS, MAX_ATTEMPTS };
}));
