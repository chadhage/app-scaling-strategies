'use strict';

(function expose(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ContainerLesson = api;
})(typeof globalThis === 'object' ? globalThis : this, function lesson() {
  const MAX_HISTORY = 20;
  const digest = `sha256:${'a'.repeat(64)}`;
  const repository = 'registry.example.invalid/teaching/profile';
  const paths = ['manual', 'pipeline'];
  const actions = ['prepare', 'initialize', 'promote', 'observe', 'reject-auto-swap'];
  const stateKeys = ['schemaVersion', 'fixtureId', 'promotionPath', 'phase', 'initialized', 'production',
    'verifier', 'impact', 'message', 'swapEffect', 'journeys', 'metrics', 'history'];
  const eventKeys = ['step', 'action', 'classification', 'phase', 'message'];

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function invalid(label, message) {
    throw new Error(`Invalid ${label}: ${message}`);
  }

  function exactObject(value, keys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.getPrototypeOf(value) !== Object.prototype) {
      invalid(label, 'expected a plain object');
    }
    const owned = Reflect.ownKeys(value);
    if (owned.length !== keys.length || owned.some((key) => typeof key !== 'string' || !keys.includes(key))) {
      invalid(label, 'unexpected or missing fields');
    }
    for (const key of owned) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        invalid(label, 'only enumerable data fields are allowed');
      }
    }
  }

  function canonical(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype
          || Reflect.ownKeys(value).length !== value.length + 1) invalid('state', 'invalid array fields');
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
          invalid('state', 'array entries must be data fields');
        }
      }
      return `[${value.map(canonical).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      const keys = Reflect.ownKeys(value);
      exactObject(value, keys, 'state');
      return `{${keys.sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return invalid('state', 'only finite JSON data is allowed');
  }

  function selection(value, choices, label) {
    if (typeof value !== 'string' || !choices.includes(value)) invalid(label, 'choose a documented fixed value');
    return value;
  }

  function journey(index) {
    return {
      id: `candidate-${index}`, from: 'teaching-v1', to: 'teaching-v2', observed: true,
      status: 200, latencyMs: index === 1 ? 210 : 260, budgetMs: 500,
      identityBefore: `synthetic-user-${index}`, identityAfter: `synthetic-user-${index}`,
      sessionBefore: `fixture-session-${index}`, sessionAfter: `fixture-session-${index}`,
      stateBefore: 'basket-7', stateAfter: 'basket-7', effects: 1, contractCompatible: true,
    };
  }

  function fixture(label, overrides = {}) {
    return {
      label,
      container: 'fictional-profile-container',
      image: {
        registry: 'registry.example.invalid', repository, reference: `${repository}@${digest}`,
        referenceKind: 'digest', digest, expectedDigest: digest, pull: 'success',
        ...overrides.image,
      },
      startup: {
        entrypoint: 'FIXED FICTIONAL ENTRYPOINT DATA — not an executable command',
        listeningPort: 8080, targetPort: 8080, initialization: 'complete', dependencies: 'ready',
        warmupStatus: 200, acceptableStatuses: [200], meaningfulReady: true,
        ...overrides.startup,
      },
      platform: {
        host: 'App Service custom containers (fictional)', os: 'Linux (fictional)',
        nativeAutoSwapSupported: false, slots: 2, capacityUnits: 10,
        productionUnits: 6, candidateUnits: 3,
        ...overrides.platform,
      },
      swapEffect: overrides.swapEffect || 'Modeled native effect: former-production workers recycled; no active old work in this fixed sample.',
      journeyTrace: overrides.journeyTrace || [journey(1), journey(2)],
    };
  }

  const unknownJourney = {
    ...journey(2), observed: false, to: null, status: null, latencyMs: null,
    identityAfter: null, sessionAfter: null, stateAfter: null, effects: null, contractCompatible: null,
  };
  const fixtures = freeze({
    prepared: fixture('Prepared digest-pinned candidate'),
    'mutable-tag': fixture('Mutable image tag cannot prove immutability', {
      image: { reference: `${repository}:latest-fictional`, referenceKind: 'tag', digest: null },
    }),
    'pull-failed': fixture('Fictional image pull failed', { image: { pull: 'failed' } }),
    'wrong-port': fixture('Listening port assumption is wrong', { startup: { listeningPort: 9090 } }),
    'startup-failed': fixture('Initialization failed', { startup: { initialization: 'failed' } }),
    'startup-unknown': fixture('Initialization completion is unknown', { startup: { initialization: 'unknown' } }),
    'shallow-green': fixture('Warm-up 200 hides dependency/meaningful-readiness failure', {
      startup: { dependencies: 'failed', meaningfulReady: false },
    }),
    'no-headroom': fixture('Extra slots do not create shared-plan headroom', {
      platform: { slots: 4, candidateUnits: 5 },
    }),
    'journey-interrupted': fixture('Modeled recycling interrupts a started journey', {
      journeyTrace: [journey(1), { ...journey(2), status: 503, latencyMs: 900, effects: 0 }],
      swapEffect: 'Modeled native effect: former-production workers recycled; one active old request abandoned.',
    }),
    'journey-unknown': fixture('One started journey has no completion observation', {
      journeyTrace: [journey(1), unknownJourney],
    }),
  });
  const fixtureIds = freeze(Object.keys(fixtures));

  function metrics(journeys) {
    const result = { attempted: journeys.length, positive: 0, negative: 0, unknown: 0, ratio: null };
    for (const observation of journeys) result[observation.outcome] += 1;
    if (result.attempted) result.ratio = result.positive / result.attempted;
    return result;
  }

  function seed(fixtureId, promotionPath) {
    selection(fixtureId, fixtureIds, 'fixture');
    selection(promotionPath, paths, 'promotion path');
    return {
      schemaVersion: 1, fixtureId, promotionPath, phase: 'new', initialized: false,
      production: 'teaching-v1', verifier: 'unverified', impact: 'not started; empty sample is no evidence',
      message: 'Choose a fixed fixture, then prepare the fictional immutable image.',
      swapEffect: 'No swap or external operation performed.', journeys: [], metrics: metrics([]), history: [],
    };
  }

  function measured(trace) {
    if (trace.observed !== true) return { ...trace, outcome: 'unknown', reason: 'Started journey; completion observation is missing.' };
    const failures = [];
    if (trace.to !== 'teaching-v2') failures.push('candidate destination');
    if (trace.status !== 200) failures.push('status');
    if (!Number.isFinite(trace.latencyMs) || trace.latencyMs > trace.budgetMs) failures.push('latency exceeds original budget');
    if (trace.identityAfter !== trace.identityBefore) failures.push('identity');
    if (trace.sessionAfter !== trace.sessionBefore) failures.push('session');
    if (trace.stateAfter !== trace.stateBefore) failures.push('state');
    if (trace.effects !== 1) failures.push('effects must equal one');
    if (trace.contractCompatible !== true) failures.push('contract compatibility');
    return {
      ...trace, outcome: failures.length ? 'negative' : 'positive',
      reason: failures.length ? failures.join('; ') : 'Candidate destination, status, original latency budget, identity, session, state, one effect and contract all pass.',
    };
  }

  function requirePhase(state, phase, action) {
    if (state.phase !== phase) throw new Error(`Action ${action} requires ${phase}; currently ${state.phase}. Reset to choose another fixture.`);
  }

  function reduce(state, action) {
    if (state.history.length >= MAX_HISTORY) throw new Error('History limit 20 reached; reset before another action.');
    const data = fixtures[state.fixtureId];
    const result = { ...state };
    if (action === 'prepare') {
      requirePhase(state, 'new', action);
      const immutable = data.image.referenceKind === 'digest' && data.image.digest === data.image.expectedDigest;
      if (!immutable || data.image.pull !== 'success') {
        Object.assign(result, {
          phase: 'blocked', verifier: 'negative', impact: 'safe abort before exposure',
          message: !immutable ? 'Mutable tag cannot establish the fictional immutable image identity; preparation blocked.'
            : 'Fictional image pull failed; initialization cannot begin and existing production remains unchanged.',
        });
      } else {
        Object.assign(result, {
          phase: 'prepared', verifier: 'positive', impact: 'no exposure; empty sample is no migration evidence',
          message: 'Fictional digest-pinned image and pull DATA pass. Preparation does not imply startup or readiness.',
        });
      }
    } else if (action === 'initialize') {
      requirePhase(state, 'prepared', action);
      const startup = data.startup;
      const required = data.platform.productionUnits + data.platform.candidateUnits;
      let failure = '';
      if (startup.initialization === 'unknown') {
        Object.assign(result, {
          phase: 'held', verifier: 'unknown', impact: 'safe hold before exposure; initialization unverified',
          message: 'Fictional initialization completion is unknown; do not assume elapsed time means readiness.',
        });
      } else {
        if (startup.initialization !== 'complete') failure = 'Fictional initialization failed; no readiness or promotion.';
        else if (startup.listeningPort !== startup.targetPort) failure = 'Fictional listening port does not match the expected target port; startup assumptions fail.';
        else if (!startup.acceptableStatuses.includes(startup.warmupStatus)
            || startup.dependencies !== 'ready' || startup.meaningfulReady !== true) {
          failure = 'Warm-up 200 is not meaningful readiness: explicit acceptable status, required dependencies and application initialization must all pass.';
        } else if (required > data.platform.capacityUnits) {
          failure = `Overlap requires ${required} fictional units but the shared plan has ${data.platform.capacityUnits}; extra slots add no compute capacity.`;
        }
        Object.assign(result, failure ? {
          phase: 'blocked', verifier: 'negative', impact: 'safe abort before exposure', message: failure,
        } : {
          phase: 'ready', initialized: true, verifier: 'positive', impact: 'ready before exposure; no migration evidence yet',
          message: 'Fictional pull, port, completed initialization, dependencies, explicit warm-up 200, meaningful readiness and shared-plan overlap gates pass.',
        });
      }
    } else if (action === 'promote') {
      requirePhase(state, 'ready', action);
      const pending = data.journeyTrace.map((trace) => ({
        ...trace, observed: false, to: null, status: null, latencyMs: null,
        identityAfter: null, sessionAfter: null, stateAfter: null, effects: null, contractCompatible: null,
        outcome: 'unknown', reason: 'Started journey; operator has not inspected completion DATA yet.',
      }));
      Object.assign(result, {
        phase: 'promoted', production: 'teaching-v2', verifier: 'unknown',
        impact: 'unverified synthetic transition; two started journeys awaiting observation',
        message: `Controlled ${state.promotionPath} promotion rehearsed only. A routing switch is not a journey result. ${data.swapEffect}`,
        swapEffect: data.swapEffect, journeys: pending, metrics: metrics(pending),
      });
    } else if (action === 'observe') {
      requirePhase(state, 'promoted', action);
      const journeys = data.journeyTrace.map(measured);
      const counts = metrics(journeys);
      const verdict = counts.negative ? 'negative' : counts.unknown ? 'unknown' : 'positive';
      Object.assign(result, {
        phase: 'observed', journeys, metrics: counts, verifier: verdict,
        impact: verdict === 'negative' ? 'interrupted synthetic transition'
          : verdict === 'unknown' ? 'unverified synthetic transition' : 'uninterrupted synthetic transition in this fixed sample',
        message: `${counts.positive}/${counts.attempted} started candidate journeys positive; ${counts.negative} negative; ${counts.unknown} unknown. Failures and unknowns remain counted. No native or five-nines claim.`,
      });
    } else if (action === 'reject-auto-swap') {
      if (['promoted', 'observed'].includes(state.phase)) throw new Error('Auto-swap rejection must be demonstrated before exposure; reset to rehearse it.');
      Object.assign(result, {
        verifier: 'unsupported', impact: 'unsupported action rejected before exposure; no migration claim',
        message: 'Native auto-swap is unsupported for Linux web apps and Web App for Containers. No swap occurred; use an explicitly gated manual or controlled pipeline path.',
      });
    } else invalid('command', 'unknown action');
    result.history = [...state.history, {
      step: state.history.length + 1, action, classification: result.verifier, phase: result.phase, message: result.message,
    }];
    return result;
  }

  function validateState(state) {
    exactObject(state, stateKeys, 'state');
    const encoded = canonical(state);
    if (state.schemaVersion !== 1 || !Array.isArray(state.history) || state.history.length > MAX_HISTORY) {
      invalid('state', 'invalid schema or history bound');
    }
    let replay;
    try {
      replay = seed(state.fixtureId, state.promotionPath);
      for (const event of state.history) {
        exactObject(event, eventKeys, 'state history');
        selection(event.action, actions, 'state history action');
        replay = reduce(replay, event.action);
      }
    } catch (error) {
      invalid('state', error.message);
    }
    if (encoded !== canonical(replay)) invalid('state', 'complete state and history do not match deterministic replay');
  }

  function createState(fixtureId, promotionPath) {
    return freeze(seed(fixtureId, promotionPath));
  }

  function next(state, command) {
    exactObject(command, ['action'], 'command');
    selection(command.action, actions, 'command action');
    validateState(state);
    return freeze(reduce(state, command.action));
  }

  function reset(state) {
    validateState(state);
    return createState('prepared', 'manual');
  }

  return freeze({ MAX_HISTORY, fixtureIds, fixtures, paths, createState, next, reset });
});
