(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S017Model = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const constants = Object.freeze({
    banner: 'Training rehearsal - synthetic data - not a live Azure result',
    smallerCapacity: 4, largerCapacity: 8, windowSeconds: 5,
    warmupWindows: 2, restartWindows: 1, maxWindows: 12, maxCommands: 40
  });
  const trusted = new WeakSet();
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }
  function seal(state) {
    freeze(state);
    trusted.add(state);
    return state;
  }
  function assertState(state) {
    if (!trusted.has(state)) throw new TypeError('Expected a trusted S017 state; importing or forging state is unsupported.');
  }
  function initial() {
    return seal({
      schemaVersion: 1, demand: 4, strategy: null, phase: 'IDLE', route: 'old',
      observedReadyCapacity: 0, warmupProgress: 0, handedOffAt: null,
      targetFailed: false, windows: [], events: [], lastRejection: null, locked: false
    });
  }
  function finish(state, patch, event) {
    const windows = patch.windows || state.windows;
    const events = [...state.events, {
      sequence: state.events.length + 1, atSeconds: windows.length * constants.windowSeconds,
      ...event
    }];
    return seal({
      ...state, lastRejection: null, ...patch, events,
      locked: state.locked || patch.locked === true || events.length >= constants.maxCommands
    });
  }
  function refuse(state, action, code, message) {
    return finish(state, { lastRejection: { code, message }, locked: code === 'LIMIT' },
      { action, accepted: false, reason: message });
  }
  function parse(command) {
    try {
      if (!command || typeof command !== 'object' || Object.getPrototypeOf(command) !== Object.prototype) return null;
      const descriptors = Object.getOwnPropertyDescriptors(command);
      const keys = Reflect.ownKeys(descriptors);
      if (keys.some((key) => typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value'))) return null;
      const type = descriptors.type?.value;
      if (typeof type !== 'string') return null;
      const required = {
        configure: ['type', 'demand'], 'in-place': ['type'], prepare: ['type'],
        tick: ['type', 'observation'], handoff: ['type']
      }[type];
      if (!Array.isArray(required) || keys.length !== required.length || required.some((key) => !keys.includes(key))) return null;
      const parsed = { type };
      if (type === 'configure') {
        const value = descriptors.demand.value;
        const demand = typeof value === 'string' && /^[1-8]$/.test(value) ? Number(value) : value;
        if (typeof demand !== 'number' || !Number.isInteger(demand) || demand < 1 || demand > 8) return null;
        parsed.demand = demand;
      }
      if (type === 'tick') {
        const observation = descriptors.observation.value;
        if (!['healthy', 'target-failure', 'missing'].includes(observation)) return null;
        parsed.observation = observation;
      }
      return parsed;
    } catch {
      return null;
    }
  }
  function observe(state, observation) {
    const missing = observation === 'missing';
    const failed = observation === 'target-failure';
    const capacity = missing ? null : state.route === 'old' ? constants.smallerCapacity
      : state.route === 'unavailable' || failed ? 0 : constants.largerCapacity;
    const successful = missing ? 0 : Math.min(state.demand, capacity);
    let phase = state.phase;
    let route = state.route;
    let progress = state.warmupProgress;
    let readyCapacity = state.observedReadyCapacity;
    if (missing) {
      readyCapacity = null;
      if (state.strategy === 'parallel' && phase === 'READY') phase = 'WARMING';
    } else if (failed) {
      readyCapacity = 0;
      phase = state.strategy === 'parallel' && route === 'old' ? 'ABORTED' : 'FAILED';
    } else if (state.strategy === 'in-place' && phase === 'RESIZING') {
      phase = 'ACTIVE';
      route = 'target';
      readyCapacity = constants.largerCapacity;
      progress = constants.restartWindows;
    } else if (state.strategy === 'parallel' && ['WARMING', 'READY'].includes(phase)) {
      progress = Math.min(constants.warmupWindows, progress + 1);
      readyCapacity = progress === constants.warmupWindows ? constants.largerCapacity : 0;
      phase = readyCapacity ? 'READY' : 'WARMING';
    } else {
      readyCapacity = constants.largerCapacity;
    }
    const window = {
      index: state.windows.length + 1,
      atSeconds: (state.windows.length + 1) * constants.windowSeconds,
      observation, route: state.route, phaseBefore: state.phase, phaseAfter: phase,
      servingCapacity: capacity, candidateReadyAtEnd: readyCapacity,
      attempted: state.demand, successful,
      interrupted: missing ? 0 : state.demand - successful,
      unknown: missing ? state.demand : 0,
      targetFailure: failed, costCredits: state.strategy === 'parallel' ? 3 : 2,
      oldRetained: state.strategy === 'parallel',
      reason: missing ? 'Missing client and readiness observations'
        : failed ? state.route === 'old' ? 'Candidate failed; old deployment retained' : 'Target failed while unavailable or exposed'
          : state.route === 'unavailable' ? 'In-place restart outage'
            : successful < state.demand ? 'Demand exceeds observed serving capacity' : 'Known synthetic completions'
    };
    return finish(state, {
      phase, route, warmupProgress: progress, observedReadyCapacity: readyCapacity,
      targetFailed: state.targetFailed || failed, windows: [...state.windows, window]
    }, { action: 'tick', observation, accepted: true, reason: window.reason });
  }
  function reduce(state, command) {
    assertState(state);
    if (state.locked) return state;
    const parsed = parse(command);
    if (!parsed) return refuse(state, 'INVALID', 'INVALID', 'Invalid command, field, demand, or observation; execution unchanged.');
    const { type } = parsed;
    if (['configure', 'in-place', 'prepare'].includes(type)) {
      if (state.phase !== 'IDLE') return refuse(state, type, 'BLOCKED', 'Configure or start only from IDLE; reset archives the current run.');
      if (type === 'configure') {
        return finish(state, { demand: parsed.demand },
          { action: type, demand: parsed.demand, accepted: true, reason: 'Applied bounded demand' });
      }
      return finish(state, {
        strategy: type === 'prepare' ? 'parallel' : 'in-place',
        phase: type === 'prepare' ? 'WARMING' : 'RESIZING',
        route: type === 'prepare' ? 'old' : 'unavailable'
      }, { action: type, accepted: true,
        reason: type === 'prepare' ? 'Requested separate larger capacity; old still serves' : 'In-place restart begins; no parallel serving deployment' });
    }
    if (type === 'handoff') {
      if (state.strategy !== 'parallel' || state.phase !== 'READY'
          || state.observedReadyCapacity !== constants.largerCapacity
          || state.warmupProgress !== constants.warmupWindows
          || state.windows.at(-1)?.observation !== 'healthy') {
        return refuse(state, type, 'BLOCKED', 'Handoff requires two observed healthy warm-up windows and fresh larger-capacity readiness.');
      }
      return finish(state, {
        phase: 'ACTIVE', route: 'target',
        handedOffAt: state.windows.length * constants.windowSeconds
      }, { action: type, accepted: true, reason: 'Admissions handed off at an observed-ready boundary; old remains retained and charged' });
    }
    if (!state.strategy || ['IDLE', 'ABORTED', 'FAILED'].includes(state.phase)) {
      return refuse(state, type, 'BLOCKED', 'Observation requires an active nonterminal strategy.');
    }
    if (state.windows.length >= constants.maxWindows) {
      return refuse(state, type, 'LIMIT', 'Twelve observation windows retained; copy evidence and archive/reset.');
    }
    return observe(state, parsed.observation);
  }
  function summarize(state) {
    assertState(state);
    const totals = state.windows.reduce((sum, window) => ({
      attempted: sum.attempted + window.attempted,
      successful: sum.successful + window.successful,
      interrupted: sum.interrupted + window.interrupted,
      unknown: sum.unknown + window.unknown,
      targetSuccessful: sum.targetSuccessful + (window.route === 'target' ? window.successful : 0),
      costCredits: sum.costCredits + window.costCredits
    }), { attempted: 0, successful: 0, interrupted: 0, unknown: 0, targetSuccessful: 0, costCredits: 0 });
    const verification = !state.strategy ? 'NOT_RUN'
      : totals.interrupted || state.targetFailed ? 'FAIL'
        : totals.unknown ? 'UNKNOWN'
          : state.strategy === 'parallel' && state.handedOffAt !== null && totals.targetSuccessful > 0 ? 'PASS' : 'INCOMPLETE';
    const userImpact = totals.interrupted ? 'interrupted'
      : totals.unknown ? 'unknown'
        : state.phase === 'ABORTED' ? 'safe-abort-before-exposure'
          : verification === 'PASS' ? 'uninterrupted-transition'
            : state.strategy ? 'no-transition-observed' : 'not-run';
    return {
      verification, commandStatus: state.locked ? 'LIMIT' : state.lastRejection?.code || 'ACCEPTED',
      userImpact, ...totals, elapsedSeconds: state.windows.length * constants.windowSeconds,
      effectiveServingCapacity: state.windows.length ? state.windows.at(-1).servingCapacity : state.route === 'unavailable' ? 0 : constants.smallerCapacity,
      requestedTargetCapacity: state.strategy ? constants.largerCapacity : 0,
      observedReadyCapacity: state.observedReadyCapacity, oldRetained: state.strategy === 'parallel',
      windows: state.windows.length, commands: state.events.length
    };
  }
  return { constants, initial, reduce, summarize };
}));
