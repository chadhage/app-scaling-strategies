(function (root, factory) {
  'use strict';
  const api = factory(typeof module === 'object' && module.exports ? require('./fixtures.js') : root.S087Fixtures);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S087Model = api;
}(typeof globalThis === 'object' ? globalThis : this, function (fixtures) {
  'use strict';
  const copy = (value) => JSON.parse(JSON.stringify(value));
  function reject(message, field) {
    const error = new Error(message);
    error.field = field || null;
    throw error;
  }
  function noArguments(args) {
    if (args.length) reject('This action accepts no arguments.');
  }
  function inputRecord(input) {
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype) {
      reject('Input must be an exact plain record.');
    }
    const keys = Reflect.ownKeys(input);
    const expected = Object.keys(fixtures.options);
    if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
      reject('Input must contain only the target, propagation and old fields.');
    }
    const result = {};
    for (const key of expected) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) reject(`Input field ${key} cannot be an accessor.`, key);
      if (!fixtures.options[key].includes(descriptor.value)) reject(`Invalid ${key} input. Choose a listed value.`, key);
      result[key] = descriptor.value;
    }
    return result;
  }
  function observeClients(config) {
    const intended = Number(config.target) * fixtures.clientCount / 100;
    const applied = config.propagation === 'delayed' ? 0
      : config.propagation === 'partial' ? intended / 2 : intended;
    const clients = Array.from({ length: fixtures.clientCount }, (_, index) => {
      const desired = index < intended ? 'next' : 'old';
      const route = config.propagation === 'missing' ? (index < 4 ? null : 'old')
        : index < applied ? 'next' : 'old';
      const journey = route === null ? 'UNKNOWN' : route === 'old' && config.old === 'loss' ? 'FAILURE' : 'SUCCESS';
      return {
        id: `synthetic-client-${String(index + 1).padStart(2, '0')}`,
        desired, route, destination: route === null ? null : fixtures.endpoints[route], journey,
        reason: route === null ? 'Route observation missing'
          : journey === 'FAILURE' ? 'Old destination unavailable' : 'Observed destination available',
      };
    });
    const knownNew = clients.filter((client) => client.route === 'next').length;
    const knownOld = clients.filter((client) => client.route === 'old').length;
    const unknownRoutes = clients.filter((client) => client.route === null).length;
    const knownMismatches = clients.filter((client) => client.route !== null && client.route !== client.desired).length;
    const convergence = knownMismatches ? 'FAILURE' : unknownRoutes ? 'UNKNOWN' : 'SUCCESS';
    const journeys = Object.fromEntries(fixtures.outcomes.map((outcome) => [
      outcome.toLowerCase(), clients.filter((client) => client.journey === outcome).length,
    ]));
    const outcome = convergence === 'FAILURE' || journeys.failure ? 'FAILURE'
      : convergence === 'UNKNOWN' || journeys.unknown ? 'UNKNOWN' : 'SUCCESS';
    return {
      clients, intended, knownNew, knownOld, unknownRoutes, knownMismatches,
      effectivePercent: unknownRoutes ? null : knownNew / fixtures.clientCount * 100,
      convergence, journeys,
      migratedIntended: clients.filter((client) => client.desired === 'next'
        && client.route === 'next' && client.journey === 'SUCCESS').length,
      outcome,
    };
  }
  function createLesson() {
    let phase = 'idle';
    let current = null;
    let history = [];
    function requirePhase(expected) {
      if (phase !== expected) reject(`Action unavailable in phase ${phase}; expected ${expected}.`);
    }
    function trace(event, detail) {
      current.trace.push({ step: current.trace.length + 1, event, detail });
    }
    function snapshot() {
      const counts = (outcome) => history.filter((attempt) => attempt.outcome === outcome).length;
      const active = current && phase !== 'complete' ? 1 : 0;
      return copy({
        phase, current, history,
        totals: {
          attempted: history.length + active, completed: history.length, active,
          success: counts('SUCCESS'), failure: counts('FAILURE'), unknown: counts('UNKNOWN'),
          predictionsChecked: history.filter((attempt) => attempt.prediction).length,
          predictionsCorrect: history.filter((attempt) => attempt.prediction?.verdict === 'CORRECT').length,
        },
      });
    }
    return {
      snapshot(...args) {
        noArguments(args);
        return snapshot();
      },
      request(...args) {
        if (args.length !== 1) reject('Request requires one input argument.');
        requirePhase('idle');
        if (history.length >= fixtures.historyLimit) reject('History limit reached. Reset all local data to continue.');
        const config = inputRecord(args[0]);
        current = {
          id: history.length + 1, config, desiredPercent: Number(config.target), observation: null,
          outcome: 'NOT_DECIDED', retention: 'NOT_CHECKED', retentionReason: 'Observation required.',
          oldAvailable: config.old === 'retained', trace: [], prediction: null,
        };
        phase = 'requested';
        trace('request', `Desired new-v2 ${config.target}%; command is not effective routing evidence.`);
        return snapshot();
      },
      observe(...args) {
        noArguments(args);
        requirePhase('requested');
        current.observation = observeClients(current.config);
        current.outcome = current.observation.outcome;
        phase = 'observed';
        const report = current.observation;
        trace('observe', `Known new ${report.knownNew}, old ${report.knownOld}, unresolved ${report.unknownRoutes}; `
          + `convergence ${report.convergence}; journeys ${report.journeys.success}/${report.journeys.failure}/${report.journeys.unknown}.`);
        return snapshot();
      },
      releaseOld(...args) {
        noArguments(args);
        requirePhase('observed');
        const report = current.observation;
        const allowed = report.convergence === 'SUCCESS' && report.knownOld === 0
          && report.unknownRoutes === 0 && report.journeys.success === fixtures.clientCount;
        current.retention = allowed ? 'RELEASE_ALLOWED' : 'RETAIN_REQUIRED';
        current.retentionReason = allowed
          ? 'All eight observed clients use ready new-v2; no old route dependency in this synthetic route-only model.'
          : `${report.knownOld} observed old client(s), ${report.unknownRoutes} unresolved route(s); `
            + `convergence ${report.convergence}. Reject release; required old capacity must remain.`
            + (current.oldAvailable ? '' : ' The injected loss already caused interruption; rejection does not repair it.');
        if (allowed) current.oldAvailable = false;
        trace('release gate', `${current.retention}: ${current.retentionReason}`);
        phase = 'complete';
        history.push(copy(current));
        return snapshot();
      },
      predict(...args) {
        if (args.length !== 1) reject('Prediction requires one argument.', 'prediction');
        requirePhase('complete');
        if (current.prediction) reject('Prediction already checked.', 'prediction');
        if (!fixtures.outcomes.includes(args[0])) reject('Choose a listed prediction.', 'prediction');
        current.prediction = { choice: args[0], verdict: args[0] === current.outcome ? 'CORRECT' : 'INCORRECT' };
        trace('prediction', `${current.prediction.verdict}; the user-impact result remains ${current.outcome}.`);
        history[history.length - 1] = copy(current);
        return snapshot();
      },
      newAttempt(...args) {
        noArguments(args);
        requirePhase('complete');
        if (history.length >= fixtures.historyLimit) reject('History limit reached. Reset all local data to continue.');
        phase = 'idle';
        current = null;
        return snapshot();
      },
      reset(...args) {
        noArguments(args);
        phase = 'idle';
        current = null;
        history = [];
        return snapshot();
      },
    };
  }
  return { createLesson };
}));
