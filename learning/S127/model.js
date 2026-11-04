'use strict';

(function expose(root) {
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const MAX_RUNS = 8;
  const MAX_HISTORY = 64;
  const OPTIONS = freeze({
    maxUnavailable: [0, 1],
    maxSurge: [0, 1],
    probe: ['readiness-startup', 'startup-only'],
    headroom: ['available', 'full', 'unknown'],
    graceSeconds: [10, 20],
    observation: ['complete', 'readiness-failed', 'readiness-unknown', 'desired-only', 'state-failed', 'state-unknown'],
    disruption: ['eviction-one', 'eviction-two', 'node-loss', 'zone-loss', 'region-loss', 'unrecorded'],
  });
  const FIXTURE = freeze({
    mode: 'fixed fictional teaching DATA ONLY',
    desiredReplicas: 3,
    requiredReady: 3,
    pdbMinAvailable: 2,
    preStopSeconds: 4,
    nodes: [
      { id: 'node-a', zone: 'zone-a', region: 'fictional-region', podSlots: 2, oldSlots: 1 },
      { id: 'node-b', zone: 'zone-b', region: 'fictional-region', podSlots: 1, oldSlots: 1 },
      { id: 'node-c', zone: 'zone-c', region: 'fictional-region', podSlots: 1, oldSlots: 1 },
    ],
    oldPods: [
      { id: 'old-a', role: 'old', node: 'node-a', startup: true, ready: true },
      { id: 'old-b', role: 'old', node: 'node-b', startup: true, ready: true },
      { id: 'old-c', role: 'old', node: 'node-c', startup: true, ready: true },
    ],
    candidate: { id: 'candidate-a', role: 'candidate', node: 'node-a', startup: true, ready: true },
    oldOnly: { attempted: 2, succeeded: 2, interrupted: 0, unknown: 0 },
    oldWork: [
      { id: 'old-request-a', remainingSeconds: 8, state: 'compatible-v1-v2' },
      { id: 'old-request-b', remainingSeconds: 14, state: 'compatible-v1-v2' },
    ],
    candidateJourneys: [
      { id: 'transition-a', http: 200, status: 'succeeded', state: 'compatible-v1-v2' },
      { id: 'transition-b', http: 200, status: 'succeeded', state: 'compatible-v1-v2' },
    ],
  });

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  class LessonError extends Error {
    constructor(code, message, field = null) {
      super(message);
      this.name = 'LessonError';
      this.code = code;
      this.field = field;
    }
  }

  function record(value, keys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
      throw new LessonError('ERR_INPUT', `${label} must be a plain data record.`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const names = Reflect.ownKeys(descriptors);
    if (names.some((key) => typeof key !== 'string' || !('value' in descriptors[key]))) {
      throw new LessonError('ERR_INPUT', `${label} cannot contain symbols or accessors.`);
    }
    if (keys && (names.length !== keys.length || keys.some((key) => !names.includes(key)))) {
      throw new LessonError('ERR_INPUT', `${label} requires exactly: ${keys.join(', ')}.`);
    }
  }

  function checkSettings(input) {
    const keys = Object.keys(OPTIONS).filter((key) => key !== 'disruption');
    record(input, keys, 'Settings');
    const settings = {};
    for (const key of keys) {
      if (!OPTIONS[key].includes(input[key])) {
        throw new LessonError('ERR_INPUT', `${key} must be one of ${OPTIONS[key].join(' / ')}.`, key);
      }
      settings[key] = input[key];
    }
    if (settings.maxUnavailable === 0 && settings.maxSurge === 0) {
      throw new LessonError('ERR_INPUT', 'Both rollout allowances cannot be zero.', 'maxSurge');
    }
    return settings;
  }

  function parseControls(input) {
    const keys = Object.keys(OPTIONS).filter((key) => key !== 'disruption');
    record(input, keys, 'Controls');
    const parsed = {};
    for (const key of keys) {
      if (typeof input[key] !== 'string') {
        throw new LessonError('ERR_INPUT', `${key} must be canonical control text.`, key);
      }
      if (['maxUnavailable', 'maxSurge', 'graceSeconds'].includes(key)) {
        if (!OPTIONS[key].map(String).includes(input[key])) {
          throw new LessonError('ERR_INPUT', `${key} must be exactly ${OPTIONS[key].join(' / ')}; no spaces, decimals or exponents.`, key);
        }
        parsed[key] = Number(input[key]);
      } else {
        parsed[key] = input[key];
      }
    }
    return checkSettings(parsed);
  }

  function checkAction(action) {
    record(action, null, 'Action');
    const fields = {
      configure: ['type', 'settings'],
      observe: ['type'],
      rollout: ['type'],
      drain: ['type'],
      disrupt: ['type', 'kind'],
      reset: ['type'],
    };
    if (typeof action.type !== 'string' || !Object.hasOwn(fields, action.type)) {
      throw new LessonError('ERR_INPUT', 'Choose a documented lesson action.');
    }
    record(action, fields[action.type], 'Action');
    if (action.type === 'configure') return { type: action.type, settings: checkSettings(action.settings) };
    if (action.type === 'disrupt' && !OPTIONS.disruption.includes(action.kind)) {
      throw new LessonError('ERR_INPUT', 'Choose one fixed disruption DATA record.', 'disruption');
    }
    return { ...action };
  }

  function observe(settings) {
    const oldPods = FIXTURE.oldPods.map((pod, index) => ({
      ...pod,
      ready: settings.probe === 'startup-only' ? null
        : settings.observation === 'desired-only' ? [true, false, null][index] : true,
    }));
    const candidate = {
      ...FIXTURE.candidate,
      ready: settings.probe === 'startup-only' || ['readiness-unknown', 'desired-only'].includes(settings.observation) ? null
        : settings.observation !== 'readiness-failed',
    };
    const reserved = { available: 0, full: 1, unknown: null }[settings.headroom];
    const nodes = FIXTURE.nodes.map((node, index) => ({
      ...node, otherReservedSlots: index === 0 ? reserved : 0,
    }));
    const availableSlots = reserved === null ? null
      : nodes.reduce((sum, node) => sum + node.podSlots - node.oldSlots - node.otherReservedSlots, 0);
    return {
      dataOnly: true,
      desiredReplicas: FIXTURE.desiredReplicas,
      requiredReady: FIXTURE.requiredReady,
      pods: [...oldPods, candidate],
      nodes,
      observedReadyBefore: oldPods.filter((pod) => pod.ready === true).length,
      unknownOldReadiness: oldPods.filter((pod) => pod.ready === null).length,
      candidateReady: candidate.ready,
      availableSlots,
      oldOnly: FIXTURE.oldOnly,
    };
  }

  function pendingResult(settings, observed) {
    const failures = [];
    const unknowns = [];
    if (observed.observedReadyBefore < FIXTURE.requiredReady) {
      (observed.unknownOldReadiness ? unknowns : failures).push('Observed old ready capacity is below demand; desired replicas are not readiness.');
    }
    if (observed.candidateReady === false) failures.push('Recorded candidate readiness failed.');
    if (observed.candidateReady === null) unknowns.push('Candidate readiness is missing; startup success is not readiness.');
    if (settings.maxSurge === 1 && observed.availableSlots === 0) failures.push('No recorded surge headroom exists.');
    if (settings.maxSurge === 1 && observed.availableSlots === null) unknowns.push('Surge headroom is unknown.');
    const held = failures.length > 0 || unknowns.length > 0;
    const readyFloor = held ? observed.observedReadyBefore : observed.observedReadyBefore - settings.maxUnavailable;
    const journeys = held ? [] : FIXTURE.candidateJourneys.map((journey, index) => {
      let entry = { ...journey };
      if (settings.observation === 'state-failed') entry = { ...entry, status: 'interrupted', state: 'incompatible-state' };
      if (settings.observation === 'state-unknown') entry = { ...entry, status: 'unknown', state: null };
      if (readyFloor < FIXTURE.requiredReady && index === 1) {
        entry = { ...entry, http: 503, status: 'interrupted', reason: 'recorded capacity deficit during allowed unavailability' };
      }
      return entry;
    });
    return {
      mode: 'synthetic',
      nativeQualified: false,
      held,
      verification: held && !unknowns.length ? 'pass' : 'unverified',
      transition: held ? (unknowns.length ? 'unknown' : 'safe-abort-before-exposure') : 'in-progress',
      cleanup: 'not-started',
      desiredReplicas: observed.desiredReplicas,
      observedReadyBefore: observed.observedReadyBefore,
      unknownOldReadiness: observed.unknownOldReadiness,
      readyFloor,
      peakPods: FIXTURE.oldPods.length + (held ? 0 : settings.maxSurge),
      observedReadyAfter: observed.observedReadyBefore,
      attemptedTransitions: journeys.length,
      successfulTransitions: journeys.filter((journey) => journey.status === 'succeeded').length,
      interruptedTransitions: journeys.filter((journey) => journey.status === 'interrupted').length,
      unknownTransitions: journeys.filter((journey) => journey.status === 'unknown').length,
      oldOnly: held ? FIXTURE.oldOnly : { attempted: 0, succeeded: 0, interrupted: 0, unknown: 0 },
      journeys,
      drain: { attempted: 0, succeeded: 0, interrupted: 0, unknown: 0, preStopSeconds: FIXTURE.preStopSeconds, availableSeconds: null, requests: [] },
      failures,
      unknowns,
      scope: 'One fixed rolling step only; no Deployment convergence or native proof. PDB is not a rollout guard.',
    };
  }

  function drainResult(result, settings) {
    const availableSeconds = settings.graceSeconds - FIXTURE.preStopSeconds;
    const requests = FIXTURE.oldWork.map((request) => ({
      ...request, status: request.remainingSeconds <= availableSeconds ? 'succeeded' : 'interrupted',
    }));
    const drain = {
      attempted: requests.length,
      succeeded: requests.filter((request) => request.status === 'succeeded').length,
      interrupted: requests.filter((request) => request.status === 'interrupted').length,
      unknown: 0,
      preStopSeconds: FIXTURE.preStopSeconds,
      availableSeconds,
      requests,
    };
    const interrupted = result.interruptedTransitions + drain.interrupted;
    return {
      ...result,
      verification: interrupted ? 'fail' : result.unknownTransitions ? 'unverified' : 'pass',
      transition: interrupted ? 'interrupted' : result.unknownTransitions ? 'unknown' : 'uninterrupted-step',
      cleanup: drain.interrupted ? 'synthetic-interrupted-drain' : 'synthetic-drained',
      drain,
    };
  }

  function compareDisruption(kind, observed) {
    const voluntary = kind.startsWith('eviction-');
    const requestedEvictions = voluntary ? (kind === 'eviction-one' ? 1 : 2) : 0;
    const oldPods = observed.pods.filter((pod) => pod.role === 'old');
    const survivors = kind === 'region-loss' ? []
      : ['node-loss', 'zone-loss'].includes(kind) ? oldPods.filter((pod) => pod.node !== 'node-a') : oldPods;
    const unknown = kind === 'unrecorded' || survivors.some((pod) => pod.ready === null);
    const readyBefore = observed.observedReadyBefore;
    const allowed = voluntary && !unknown ? readyBefore - requestedEvictions >= FIXTURE.pdbMinAvailable : null;
    const after = unknown ? null : voluntary ? readyBefore - (allowed ? requestedEvictions : 0)
      : survivors.filter((pod) => pod.ready === true).length;
    const blocked = voluntary && allowed === false;
    const enough = after !== null && after >= FIXTURE.requiredReady;
    return {
      mode: 'synthetic-independent-comparison',
      kind,
      dataOnly: true,
      pdbApplies: voluntary,
      pdbMinAvailable: FIXTURE.pdbMinAvailable,
      evictionAllowed: allowed,
      requestedEvictions,
      observedReadyBefore: readyBefore,
      observedReadyAfter: after,
      requiredReady: FIXTURE.requiredReady,
      verification: unknown ? 'unverified' : blocked || enough ? 'pass' : 'fail',
      outcome: unknown ? 'unknown' : blocked ? 'blocked-voluntary-eviction'
        : enough ? 'within-fixed-capacity' : 'insufficient-surviving-capacity',
      attemptedJourneys: blocked ? 0 : 2,
      succeeded: !unknown && !blocked && enough ? 2 : 0,
      interrupted: !unknown && !blocked && !enough ? 2 : 0,
      unknown: unknown ? 2 : 0,
      universalProtection: false,
      nativeQualified: false,
      scope: 'Independent fixed snapshot; voluntary Eviction API limits do not certify rollouts or arbitrary node/zone/region failures.',
    };
  }

  function createLesson(...args) {
    if (args.length) throw new LessonError('ERR_INPUT', 'This lesson accepts no injected or restored state.');
    let state = freeze({
      phase: 'idle', runId: 0, runsUsed: 0, plan: null, observation: null,
      result: null, disruption: null, history: [], results: [], disruptions: [],
    });
    function requirePhase(...phases) {
      if (!phases.includes(state.phase)) {
        throw new LessonError('ERR_STATE', `Action unavailable in ${state.phase}; follow record -> observe -> rollout -> drain.`);
      }
    }
    function commit(action, changes, data) {
      if (state.history.length >= MAX_HISTORY) throw new LessonError('ERR_LIMIT', 'History limit reached; reload to start a new bounded lesson.');
      const next = { ...state, ...changes };
      next.history = [...state.history, {
        sequence: state.history.length + 1, runId: next.runId, action, data,
      }];
      state = freeze(next);
      return state;
    }
    function dispatch(input) {
      const action = checkAction(input);
      if (action.type === 'configure') {
        requirePhase('idle');
        if (state.runsUsed >= MAX_RUNS) throw new LessonError('ERR_LIMIT', 'Eight rehearsals retained; reload to begin a new lesson without silently erasing history.');
        return commit('configure', {
          phase: 'planned', runId: state.runsUsed + 1, runsUsed: state.runsUsed + 1, plan: action.settings,
        }, action.settings);
      }
      if (action.type === 'observe') {
        requirePhase('planned');
        const observation = observe(state.plan);
        return commit('observe', { phase: 'observed', observation }, observation);
      }
      if (action.type === 'rollout') {
        requirePhase('observed');
        const result = pendingResult(state.plan, state.observation);
        return commit('rollout', {
          phase: result.held ? 'held' : 'rolling', result,
          results: result.held ? [...state.results, { runId: state.runId, ...result }] : state.results,
        }, result);
      }
      if (action.type === 'drain') {
        requirePhase('rolling');
        const result = drainResult(state.result, state.plan);
        return commit('drain', {
          phase: 'done', result, results: [...state.results, { runId: state.runId, ...result }],
        }, result);
      }
      if (action.type === 'disrupt') {
        requirePhase('done', 'held');
        if (state.disruption) throw new LessonError('ERR_STATE', 'Only one independent disruption comparison is allowed per rehearsal.');
        const disruption = compareDisruption(action.kind, state.observation);
        return commit('disrupt', {
          disruption, disruptions: [...state.disruptions, { runId: state.runId, ...disruption }],
        }, disruption);
      }
      if (state.phase === 'idle') return state;
      return commit('reset', {
        phase: 'idle', plan: null, observation: null, result: null, disruption: null,
      }, { retainedResults: state.results.length, retainedDisruptions: state.disruptions.length });
    }
    return Object.freeze({
      dispatch,
      snapshot() { return state; },
    });
  }

  const api = Object.freeze({ BANNER, MAX_RUNS, MAX_HISTORY, OPTIONS, FIXTURE, LessonError, parseControls, createLesson });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S127Lesson = api;
}(globalThis));
