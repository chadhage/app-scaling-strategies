'use strict';

(function expose(root) {
  const F = typeof module !== 'undefined' && module.exports
    ? require('./fixtures.js') : root.ReadinessFixtures;
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const fail = (message) => { throw new RangeError(message); };
  function exact(record, keys) {
    if (!record || Object.getPrototypeOf(record) !== Object.prototype) fail('Expected a plain input record.');
    const descriptors = Object.getOwnPropertyDescriptors(record);
    if (Reflect.ownKeys(descriptors).length !== keys.length
        || keys.some((key) => !Object.hasOwn(descriptors, key)
          || !Object.hasOwn(descriptors[key], 'value'))) {
      fail('Use exactly the declared input fields; accessors are not accepted.');
    }
  }
  function noInput(args) {
    if (args.length) fail('This action takes no input.');
  }
  function assessObservation(observation, tick) {
    if (arguments.length !== 2) fail('Observation and synthetic tick are required.');
    exact(observation, ['status', 'observedAt']);
    if (!Number.isInteger(tick) || tick < 0 || tick > 10
        || !F.health.includes(observation.status)) fail('Invalid synthetic observation or tick.');
    if (observation.status === 'missing') {
      if (observation.observedAt !== null) fail('Missing evidence cannot have an observation timestamp.');
      return { outcome: 'UNKNOWN', reason: 'MISSING', age: null, route: F.original };
    }
    if (!Number.isInteger(observation.observedAt) || observation.observedAt < 0
        || observation.observedAt > tick) fail('Observation time must be known and not in the future.');
    const age = tick - observation.observedAt;
    if (age >= F.lifetimeTicks) return { outcome: 'FAILURE', reason: 'EXPIRED', age, route: F.original };
    if (observation.status === 'unhealthy') return { outcome: 'FAILURE', reason: 'UNHEALTHY', age, route: F.original };
    return { outcome: 'SUCCESS', reason: 'FRESH_HEALTHY', age, route: F.candidate };
  }
  function createLesson() {
    let phase = 'idle';
    let current = null;
    let history = [];
    function snapshot() {
      const totals = { attempts: history.length, correct: 0, decisions: 0, SUCCESS: 0, FAILURE: 0, UNKNOWN: 0 };
      for (const attempt of history) {
        totals.correct += Number(attempt.correct);
        for (const decision of attempt.decisions) {
          totals.decisions += 1;
          totals[decision.outcome] += 1;
        }
      }
      return copy({ phase, current, history, totals });
    }
    function active() {
      if (phase !== 'active' || current.terminal) fail('Start an active, unfinished attempt first.');
    }
    function event(action, message) {
      current.trace.push({ step: current.trace.length + 1, clock: current.clock, action, message });
    }
    function start(input) {
      if (arguments.length !== 1) fail('One fixture record is required.');
      exact(input, ['health', 'delayTicks']);
      if (!F.health.includes(input.health) || !Number.isInteger(input.delayTicks)
          || input.delayTicks < F.minimumDelay || input.delayTicks > F.maximumDelay) {
        fail('Choose healthy, unhealthy or missing, and an integer delay from 2 to 5.');
      }
      if (phase !== 'idle' || history.length >= F.historyLimit) fail('New attempt or explicit reset is required.');
      current = {
        id: history.length + 1, config: copy(input), clock: 0, advances: 0,
        revalidated: false, revision: 0, lastDecisionRevision: -1,
        terminal: false, route: F.original, prediction: null, correct: null,
        observations: [{ id: 1, status: 'healthy', observedAt: 0, attemptedAt: 0 }],
        decisions: [], trace: [],
      };
      phase = 'active';
      event('START', 'Initial synthetic green snapshot recorded; expire it before testing promotion.');
      return snapshot();
    }
    function advance() {
      noInput(arguments);
      active();
      if (current.advances >= 2 || (current.advances === 1 && !current.revalidated)) {
        fail('Advance once to expire the original, then at most once after revalidation.');
      }
      current.clock += current.config.delayTicks;
      current.advances += 1;
      current.revision += 1;
      event('ADVANCE', `Advanced ${current.config.delayTicks} synthetic ticks; freshness must be checked again.`);
      return snapshot();
    }
    function revalidate() {
      noInput(arguments);
      active();
      if (!current.advances || current.revalidated) fail('Expire the original first; one revalidation is allowed per attempt.');
      const status = current.config.health;
      current.observations.push({
        id: 2, status, observedAt: status === 'missing' ? null : current.clock, attemptedAt: current.clock,
      });
      current.revalidated = true;
      current.revision += 1;
      event('REVALIDATE', status === 'missing'
        ? 'No fresh observation arrived; old green cannot substitute for missing evidence.'
        : `Latest synthetic observation is ${status} at tick ${current.clock}.`);
      return snapshot();
    }
    function promote() {
      noInput(arguments);
      active();
      if (!current.advances) fail('Expire the original snapshot before attempting promotion.');
      if (current.lastDecisionRevision === current.revision) fail('This evidence state already has a promotion decision.');
      const observation = current.observations.at(-1);
      const verdict = assessObservation({
        status: observation.status, observedAt: observation.observedAt,
      }, current.clock);
      current.route = verdict.route;
      current.terminal = verdict.outcome === 'SUCCESS';
      current.lastDecisionRevision = current.revision;
      const decision = {
        ...verdict, tick: current.clock, observationId: observation.id,
        observedAt: observation.observedAt, status: observation.status,
        action: current.terminal ? 'PROMOTED' : 'BLOCKED',
        requiresRevalidation: !current.terminal,
        verifier: 'PASS - freshness gate enforced',
        userImpact: current.terminal ? 'UNVERIFIED - no live user journeys' : 'SAFE ABORT BEFORE EXPOSURE - synthetic only',
        cleanup: 'N/A - no resources',
      };
      current.decisions.push(decision);
      event('PROMOTE', `${decision.outcome}: ${decision.reason}; ${decision.action}; synthetic route ${decision.route}.`);
      return snapshot();
    }
    function check(input) {
      if (arguments.length !== 1) fail('One prediction record is required.');
      exact(input, ['prediction']);
      if (!F.outcomes.includes(input.prediction)) fail('Choose SUCCESS, FAILURE or UNKNOWN.');
      if (phase !== 'active' || !current.decisions.length
          || current.lastDecisionRevision !== current.revision) fail('Attempt promotion after the latest evidence change before checking.');
      current.prediction = input.prediction;
      current.outcome = current.decisions.at(-1).outcome;
      current.correct = input.prediction === current.outcome;
      history.push(copy(current));
      phase = 'checked';
      return snapshot();
    }
    function newAttempt() {
      noInput(arguments);
      if (phase !== 'checked' || history.length >= F.historyLimit) fail('Check this attempt first; reset explicitly after six retained attempts.');
      phase = 'idle';
      current = null;
      return snapshot();
    }
    function reset() {
      noInput(arguments);
      phase = 'idle';
      current = null;
      history = [];
      return snapshot();
    }
    return Object.freeze({
      snapshot, start, advance, revalidate, promote, check, newAttempt, reset,
    });
  }
  const api = Object.freeze({ assessObservation, createLesson });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ExpiredReadiness = api;
}(typeof globalThis === 'undefined' ? this : globalThis));
