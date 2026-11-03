'use strict';

(function publish(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AuthRehearsal = api;
})(typeof globalThis === 'object' ? globalThis : this, function makeModel() {
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const COHORT = 8;
  const MAX_ATTEMPTS = 6;
  const states = new WeakSet();

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  const fixtures = freeze([
    { id: 'compatible-settings', label: 'Compatible accepted outcomes', first: ['accepted', 'accepted'] },
    { id: 'forced-reauthentication', label: 'Forced reauthentication', first: ['forced-reauthentication', 'accepted'] },
    { id: 'rejected-valid-session', label: 'Rejected valid session', first: ['rejected-valid-session', 'accepted'] },
    { id: 'rejected-sign-in', label: 'Rejected synthetic sign-in check', first: ['accepted', 'rejected-sign-in'] },
    { id: 'missing-observation', label: 'Missing authentication observation', first: ['unknown', 'accepted'] },
    { id: 'failure-and-unknown', label: 'Forced reauthentication plus unknown', first: ['forced-reauthentication', 'unknown'] },
  ]);
  const predictions = freeze(['SUCCESS', 'FAILURE', 'UNKNOWN']);
  const pilots = freeze([2, 4]);
  const actionFields = freeze({
    start: ['type', 'fixtureId', 'pilot'],
    observe: ['type'],
    expand: ['type'],
    check: ['type', 'prediction'],
    new: ['type'],
    reset: ['type'],
  });

  class GuardError extends Error {
    constructor(message) {
      super(message);
      this.name = 'GuardError';
      this.code = 'ERR_SYNTHETIC_GUARD';
    }
  }

  function guard(condition, message) {
    if (!condition) throw new GuardError(message);
  }

  function makeState(value) {
    freeze(value);
    states.add(value);
    return value;
  }

  function draft(history) {
    return makeState({
      attempt: history.length + 1,
      phase: 'DRAFT',
      config: null,
      result: null,
      gate: null,
      verification: null,
      history,
    });
  }

  function createState() {
    return draft([]);
  }

  function validateAction(action) {
    guard(action !== null && typeof action === 'object' && !Array.isArray(action)
      && Object.getPrototypeOf(action) === Object.prototype, 'Use a plain synthetic action record.');
    const descriptors = Object.getOwnPropertyDescriptors(action);
    guard(Reflect.ownKeys(descriptors).every(key => typeof key === 'string'
      && Object.hasOwn(descriptors[key], 'value')), 'Action fields must be ordinary values.');
    const fields = Object.hasOwn(actionFields, action.type) ? actionFields[action.type] : null;
    guard(fields && Reflect.ownKeys(action).length === fields.length
      && fields.every(key => Object.hasOwn(action, key)), 'Unsupported action or unexpected action fields.');
    if (action.type === 'start') {
      guard(fixtures.some(fixture => fixture.id === action.fixtureId), 'Choose a fixed synthetic fixture.');
      guard(pilots.includes(action.pilot), 'Pilot must be exactly 2 or 4 synthetic journeys.');
    }
    if (action.type === 'check') {
      guard(predictions.includes(action.prediction), 'Choose SUCCESS, FAILURE, or UNKNOWN before checking.');
    }
  }

  function requirePhase(state, phase) {
    guard(state.phase === phase, `This action requires ${phase}; current phase is ${state.phase}.`);
  }

  function measure(config) {
    const fixture = fixtures.find(item => item.id === config.fixtureId);
    const rows = Array.from({ length: config.pilot }, (_, index) => ({
      label: `synthetic-journey-${index + 1}`,
      kind: index === 1 ? 'synthetic sign-in check' : 'existing valid-session fixture',
      expected: 'accepted',
      observed: index < 2 ? fixture.first[index] : 'accepted',
    }));
    const count = outcome => rows.filter(row => row.observed === outcome).length;
    const successes = count('accepted');
    const forcedReauthentication = count('forced-reauthentication');
    const rejectedValidSessions = count('rejected-valid-session');
    const rejectedSignIns = count('rejected-sign-in');
    const interruptions = forcedReauthentication + rejectedValidSessions + rejectedSignIns;
    const unknown = count('unknown');
    const outcome = interruptions > 0 ? 'FAILURE' : unknown > 0 ? 'UNKNOWN' : 'SUCCESS';
    return freeze({
      outcome,
      attempted: config.pilot,
      successes,
      interruptions,
      unknown,
      forcedReauthentication,
      rejectedValidSessions,
      rejectedSignIns,
      oldOnlyControls: COHORT - config.pilot,
      admission: outcome === 'FAILURE' ? 'STOPPED' : outcome === 'UNKNOWN' ? 'HELD' : 'ELIGIBLE',
      validationRequired: true,
      rows,
    });
  }

  function transition(state, action) {
    guard(states.has(state), 'Use an unmodified in-memory state created by this synthetic model.');
    validateAction(action);
    switch (action.type) {
      case 'start':
        requirePhase(state, 'DRAFT');
        return makeState({
          ...state,
          phase: 'EXPOSED',
          config: { fixtureId: action.fixtureId, pilot: action.pilot },
        });
      case 'observe':
        requirePhase(state, 'EXPOSED');
        return makeState({ ...state, phase: 'OBSERVED', result: measure(state.config) });
      case 'expand': {
        requirePhase(state, 'OBSERVED');
        const eligible = state.result.outcome === 'SUCCESS';
        const reason = eligible
          ? 'All sampled synthetic journeys passed. The next-stage check is eligible, not executed or certified.'
          : state.result.outcome === 'FAILURE'
            ? 'Authentication interruption detected. Stop expansion; validation stays required and affected attempts stay counted.'
            : 'Authentication observation is missing. Hold expansion; unresolved attempts are not successes.';
        return makeState({
          ...state,
          phase: 'GATED',
          gate: {
            decision: eligible ? 'ELIGIBLE' : 'BLOCKED',
            currentCohort: state.config.pilot,
            proposedCohort: state.config.pilot * 2,
            expanded: false,
            validationRequired: true,
            reason,
          },
        });
      }
      case 'check': {
        requirePhase(state, 'GATED');
        const verification = freeze({
          prediction: action.prediction,
          passed: action.prediction === state.result.outcome,
        });
        const entry = freeze({
          attempt: state.attempt,
          config: state.config,
          result: state.result,
          gate: state.gate,
          verification,
        });
        return makeState({
          ...state,
          phase: 'CHECKED',
          verification,
          history: [...state.history, entry],
        });
      }
      case 'new':
        requirePhase(state, 'CHECKED');
        guard(state.history.length < MAX_ATTEMPTS, 'Six checked attempts are retained. Reset explicitly before another attempt.');
        return draft(state.history);
      case 'reset':
        return createState();
      default:
        throw new GuardError('Unsupported synthetic action.');
    }
  }

  return freeze({
    BANNER, COHORT, MAX_ATTEMPTS, fixtures, predictions, pilots, createState, transition, GuardError,
  });
});
