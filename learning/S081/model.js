'use strict';

(function expose(root, factory) {
  const fixtures = typeof module === 'object' && module.exports ? require('.\\fixtures.js') : root.S081Fixtures;
  const value = factory(fixtures);
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.S081Model = value;
})(globalThis, function model(fixtures) {
  const copy = (value) => JSON.parse(JSON.stringify(value));
  function reject(code, message, field = null) {
    const error = new Error(message);
    Object.assign(error, { code, field });
    throw error;
  }
  function validate(input) {
    const keys = Object.keys(fixtures.choices);
    if (!input || Object.getPrototypeOf(input) !== Object.prototype
        || Reflect.ownKeys(input).length !== keys.length
        || Reflect.ownKeys(input).some((key) => !keys.includes(key))) {
      reject('INVALID_INPUT', 'Invalid input: provide exactly the six declared evidence choices.');
    }
    for (const key of keys) {
      const property = Object.getOwnPropertyDescriptor(input, key);
      if (!property || !Object.hasOwn(property, 'value') || !fixtures.choices[key].includes(property.value)) {
        reject('INVALID_INPUT', `Invalid input: ${key} must be a declared choice.`, key);
      }
    }
  }
  function empty(history = []) {
    const totals = { attempted: history.length, success: 0, failure: 0, unknown: 0 };
    for (const attempt of history) totals[attempt.outcome.toLowerCase()]++;
    return {
      phase: 'idle', desired: 'NOT_STARTED', observed: 'NOT_STARTED', config: null,
      outcome: 'NOT_DECIDED', gate: { target: null, status: 'PENDING', checks: [], success: 0, failure: 0, unknown: 0 },
      trace: [], history, prediction: null, predictionCorrect: null, totals,
    };
  }
  function inspect(target, config) {
    const evidence = Object.fromEntries(Object.keys(fixtures.choices)
      .map((key) => [key, fixtures.evidence[key][config[key]]]));
    const checks = [];
    function check(id, label, actual, expected, predicate = (value) => value === expected) {
      checks.push({
        id, label, actual: actual ?? null, expected,
        status: actual == null ? 'UNKNOWN' : predicate(actual) ? 'SUCCESS' : 'FAILURE',
      });
    }
    check('deployment', 'Deployment identity', fixtures.deploymentId, 'green-v2');
    check('endpoint', 'Recorded synthetic endpoint', evidence.endpoint, '/synthetic/green-v2');
    check('epoch', 'Observed epoch equals desired epoch', evidence.epoch, fixtures.desiredEpoch);
    if (target === 'WARMING') check('initialization', 'Initialization started; no user admission', true, true);
    if (['READY', 'CANARY', 'ACTIVE', 'RETAINED'].includes(target)) {
      const readiness = evidence.readiness;
      check('healthy', 'Readiness health', readiness?.healthy, true);
      check('freshness', 'Readiness age in synthetic ticks', readiness?.ageTicks, '<= 2', (value) => value <= 2);
      check('compatible', 'Compatible version', readiness?.compatible, true);
      check('capacity', 'Available capacity units', readiness?.capacity, '>= 3', (value) => value >= 3);
    }
    if (['CANARY', 'ACTIVE', 'DRAINING', 'RETAINED', 'RETIRED'].includes(target)) {
      const routing = evidence.routing;
      const prefix = target === 'CANARY' ? 'canary' : target === 'ACTIVE' ? 'active' : 'drain';
      const desired = target === 'CANARY' ? 10 : target === 'ACTIVE' ? 100 : 0;
      check('desired-routing', 'Desired candidate routing percent', routing?.[`${prefix}Desired`], desired);
      check('effective-routing', 'Effective candidate routing percent', routing?.[`${prefix}Effective`], desired);
      if (['CANARY', 'ACTIVE'].includes(target)) {
        check('journey-attempts', 'Synthetic cohort journey attempts', routing?.journeyAttempts, 10);
        check('journey-successes', 'Synthetic cohort journey successes', routing?.journeySuccesses, 10);
      }
    }
    if (['DRAINING', 'RETAINED', 'RETIRED'].includes(target)) {
      check('new-admissions', 'New admissions after stop', evidence.drain?.newAdmissions, 0);
    }
    if (['RETAINED', 'RETIRED'].includes(target)) {
      const drain = evidence.drain;
      check('remaining-clients', 'Remaining clients', drain?.clients, 0);
      check('remaining-work', 'Remaining work', drain?.work, 0);
      check('ownership-holders', 'Remaining ownership holders', drain?.ownershipHolders, 0);
      check('checkpoint', 'Checkpoint accounted for', drain?.checkpointConfirmed, true);
      check('artifacts', 'Compatible rollback artifacts retained', evidence.retention?.artifactsReady, true);
    }
    if (target === 'RETIRED') {
      check('rollback-deadline', 'Synthetic tick against rollback deadline', evidence.retention?.nowTick,
        '>= 8', (value) => value >= 8);
      check('dependencies', 'Remaining retention dependencies', evidence.retention?.dependentRequirements, 0);
    }
    const count = (status) => checks.filter((entry) => entry.status === status).length;
    const failure = count('FAILURE');
    const unknown = count('UNKNOWN');
    return {
      target, checks, success: count('SUCCESS'), failure, unknown,
      status: failure ? 'FAILURE' : unknown ? 'UNKNOWN' : 'SUCCESS',
    };
  }
  function createLesson() {
    let state = empty();
    const snapshot = () => copy(state);
    function requirePhase(phase, action) {
      if (state.phase !== phase) reject('INVALID_STATE', `Phase ${state.phase}: ${action} requires ${phase}.`);
    }
    function append(action) {
      state.trace.push(copy({
        sequence: state.trace.length + 1, action, desired: state.desired, observed: state.observed,
        outcome: state.outcome, gate: state.gate,
      }));
    }
    function request(target) {
      state.desired = target;
      state.phase = 'awaiting';
      state.gate = { target, status: 'PENDING', checks: [], success: 0, failure: 0, unknown: 0 };
      append('request');
    }
    function start(input) {
      requirePhase('idle', 'Start');
      validate(input);
      if (state.history.length >= fixtures.maxAttempts) reject('INVALID_STATE', 'Six retained attempts reached; explicitly reset.');
      state.config = copy(input);
      state.observed = 'UNOBSERVED';
      request('CREATED');
      return snapshot();
    }
    function requestNext() {
      requirePhase('advanced', 'Request next state');
      request(fixtures.states[fixtures.states.indexOf(state.observed) + 1]);
      return snapshot();
    }
    function observe() {
      requirePhase('awaiting', 'Observe');
      state.gate = inspect(state.desired, state.config);
      if (state.gate.status === 'SUCCESS') {
        state.observed = state.desired;
        state.phase = state.observed === 'RETIRED' ? 'decided' : 'advanced';
        if (state.phase === 'decided') state.outcome = 'SUCCESS';
      } else {
        state.phase = 'decided';
        state.outcome = state.gate.status;
      }
      append('observe');
      return snapshot();
    }
    function retain(prediction) {
      requirePhase('decided', 'Check prediction and retain');
      if (!['SUCCESS', 'FAILURE', 'UNKNOWN'].includes(prediction)) {
        reject('INVALID_INPUT', 'Invalid input: choose SUCCESS, FAILURE or UNKNOWN.', 'prediction');
      }
      state.prediction = prediction;
      state.predictionCorrect = prediction === state.outcome;
      state.history.push(copy({
        attempt: state.history.length + 1, config: state.config, deploymentId: fixtures.deploymentId,
        desiredEpoch: fixtures.desiredEpoch, legacyWarm: fixtures.legacyWarm,
        desired: state.desired, observed: state.observed, outcome: state.outcome,
        prediction, predictionCorrect: state.predictionCorrect, gate: state.gate, trace: state.trace,
      }));
      state.totals.attempted++;
      state.totals[state.outcome.toLowerCase()]++;
      state.phase = 'checked';
      return snapshot();
    }
    function newAttempt() {
      requirePhase('checked', 'New attempt');
      if (state.history.length >= fixtures.maxAttempts) reject('INVALID_STATE', 'Six retained attempts reached; explicitly reset.');
      state = empty(state.history);
      return snapshot();
    }
    function reset() {
      state = empty();
      return snapshot();
    }
    return { snapshot, start, requestNext, observe, retain, newAttempt, reset };
  }
  return { createLesson };
});
