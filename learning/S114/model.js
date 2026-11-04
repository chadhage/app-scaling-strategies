(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S114 = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const limits = { maxRuns: 6, maxHistory: 24, minBudgetSeconds: 10, maxBudgetSeconds: 120 };
  const fixtures = [
    { id: 'alternate-ready', label: 'Alternate ready', capacity: 96, revision: 7, dataAccess: true, detection: 12, switching: 10, client: 8, effects: 1 },
    { id: 'capacity-shortfall', label: 'Surviving capacity shortfall', capacity: 50, revision: 7, dataAccess: true, detection: 12, switching: 10, client: 8, effects: 1 },
    { id: 'data-unavailable', label: 'Required data unavailable', capacity: 96, revision: 6, dataAccess: false, detection: 12, switching: 10, client: 8, effects: 1 },
    { id: 'budget-exceeded', label: 'Recovery exceeds the budget', capacity: 96, revision: 7, dataAccess: true, detection: 40, switching: 20, client: 15, effects: 1 },
    { id: 'duplicate-effect', label: 'Order retry has duplicate effects', capacity: 96, revision: 7, dataAccess: true, detection: 12, switching: 10, client: 8, effects: 2 },
    { id: 'shallow-proxy-only', label: 'Shallow proxy samples only', capacity: null, revision: null, dataAccess: null, detection: null, switching: null, client: null, effects: null },
  ];
  const faultKinds = ['origins', 'dependencies', 'both'];
  const checkNames = ['detection', 'capacity', 'data', 'transactions', 'clientRecovery', 'budget'];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const combine = (values) => values.includes('negative') ? 'negative'
    : values.includes('unknown') ? 'unknown' : 'positive';
  const known = (condition) => condition ? 'positive' : 'negative';

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function inspect(value, seen = new Set(), depth = 0, count = { nodes: 0 }) {
    if (++count.nodes > 5000 || depth > 10) fail('S114_STATE', 'Data exceeds the bounded lesson shape.');
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'string' && value.length <= 1000) return;
    if (typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= 1000000) return;
    if (!value || typeof value !== 'object' || seen.has(value)) fail('S114_STATE', 'Only finite, acyclic, plain teaching data is accepted.');
    seen.add(value);
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) fail('S114_STATE', 'Unexpected data prototype.');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors).filter((key) => !(array && key === 'length'));
    if (keys.length > 32 || (array && (value.length > limits.maxHistory || keys.length !== value.length))) fail('S114_STATE', 'Unexpected or sparse data shape.');
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)
          || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')
          || (array && !/^(0|[1-9]\d*)$/.test(key))) fail('S114_STATE', 'Accessors and extra data properties are not accepted.');
      inspect(descriptor.value, seen, depth + 1, count);
    }
    seen.delete(value);
  }
  function same(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a).sort();
    const other = Object.keys(b).sort();
    return keys.length === other.length && keys.every((key, i) => key === other[i] && same(a[key], b[key]));
  }
  function parseBudget(raw) {
    if (typeof raw !== 'string' || !/^[1-9]\d{1,2}$/.test(raw)) fail('S114_INPUT', 'Budget must be a canonical whole-number string from 10 through 120.');
    const value = Number(raw);
    if (value < limits.minBudgetSeconds || value > limits.maxBudgetSeconds) fail('S114_INPUT', 'Budget must be from 10 through 120 synthetic seconds.');
    return value;
  }
  function validateAction(action) {
    try { inspect(action); } catch { fail('S114_INPUT', 'Action must contain only exact typed plain data.'); }
    if (!action || Array.isArray(action) || !['isolate', 'detect', 'recover', 'journeys', 'reset'].includes(action.type)) fail('S114_INPUT', 'Unknown operator action.');
    const keys = action.type === 'isolate' ? ['budgetSeconds', 'fault', 'fixture', 'type'] : ['type'];
    if (!same(Object.keys(action).sort(), keys)) fail('S114_INPUT', 'Unexpected or missing action fields.');
    if (action.type === 'isolate' && (
      typeof action.fixture !== 'string' || !fixtures.some((fixture) => fixture.id === action.fixture)
      || typeof action.fault !== 'string' || !faultKinds.includes(action.fault)
      || typeof action.budgetSeconds !== 'number' || !Number.isInteger(action.budgetSeconds)
      || action.budgetSeconds < limits.minBudgetSeconds || action.budgetSeconds > limits.maxBudgetSeconds
    )) fail('S114_INPUT', 'Choose a fixed fixture, an owned teaching fault, and an integer budget from 10 through 120.');
  }
  function initialState() {
    return {
      schemaVersion: 1, mode: 'synthetic-data-only', phase: 'idle', runCount: 0, config: null,
      checks: Object.fromEntries(checkNames.map((name) => [name, 'unknown'])),
      conclusion: 'unknown', regionalContinuity: 'unknown', modelFault: null, samples: null,
      destination: null, recovery: 'not-checked',
      metrics: {
        requiredCapacity: 80, survivingCapacity: null, requiredRevision: 7, observedRevision: null,
        dataAccess: null, detectionSeconds: null, switchSeconds: null, clientSeconds: null,
        interruptionSeconds: null, committedEffects: null, successfulJourneys: null,
        interruptedJourneys: null, unknownJourneys: null,
      },
      journeys: [], history: [],
    };
  }
  function advance(previous, action) {
    validateAction(action);
    if (action.type === 'reset') return initialState();
    const expected = { detect: 'isolated', recover: 'detected', journeys: 'recovered' };
    if (action.type === 'isolate') {
      if (!['idle', 'assessed'].includes(previous.phase)) fail('S114_ORDER', 'Finish the current four actions or explicitly reset before another isolation.');
      if (previous.runCount >= limits.maxRuns) fail('S114_LIMIT', 'Six rehearsals are the limit. Explicitly reset before another run.');
    } else if (previous.phase !== expected[action.type]) fail('S114_ORDER', `The ${action.type} action is not valid in phase ${previous.phase}.`);
    if (previous.history.length >= limits.maxHistory) fail('S114_LIMIT', 'The retained history bound has been reached.');
    let state = clone(previous);
    let summary;
    if (action.type === 'isolate') {
      state = initialState();
      state.history = clone(previous.history);
      state.runCount = previous.runCount + 1;
      state.config = { fixture: action.fixture, fault: action.fault, budgetSeconds: action.budgetSeconds };
      state.phase = 'isolated';
      state.modelFault = {
        region: 'Teaching North', kind: action.fault,
        origins: ['north-a', 'north-b'].map((label) => ({ label, healthy: action.fault === 'dependencies' })),
        dependencies: ['profile-store', 'order-log'].map((label) => ({ label, healthy: action.fault === 'origins' })),
      };
      summary = `DATA ONLY: mark ${action.fault} in Teaching North isolated. Labels alone provide no detection or continuity evidence.`;
    } else {
      const fixture = fixtures.find((item) => item.id === state.config.fixture);
      const metrics = state.metrics;
      if (action.type === 'detect') {
        state.phase = 'detected';
        metrics.detectionSeconds = fixture.detection;
        state.samples = {
          primaryShallowHealthy: state.config.fault === 'dependencies',
          dependencyAwareHealthy: fixture.detection === null ? null : false,
          alternateShallowHealthy: true,
        };
        state.checks.detection = fixture.detection === null ? 'unknown' : known(fixture.detection <= state.config.budgetSeconds);
        summary = fixture.detection === null
          ? 'DATA ONLY: sampled HTTP is not bounded dependency-aware detection; missing receipt remains UNKNOWN.'
          : `DATA ONLY: detection receipt at +${fixture.detection}s; alternate shallow HTTP alone is not capacity, state or client proof.`;
      }
      if (action.type === 'recover') {
        state.phase = 'recovered';
        metrics.survivingCapacity = fixture.capacity;
        metrics.observedRevision = fixture.revision;
        metrics.dataAccess = fixture.dataAccess;
        state.checks.capacity = fixture.capacity === null ? 'unknown' : known(fixture.capacity >= metrics.requiredCapacity);
        state.checks.data = fixture.revision === null || fixture.dataAccess === null ? 'unknown'
          : known(fixture.dataAccess && fixture.revision >= metrics.requiredRevision);
        const gate = combine([
          metrics.detectionSeconds === null ? 'unknown' : 'positive',
          state.checks.capacity, state.checks.data,
        ]);
        state.recovery = gate === 'positive' ? 'selected' : gate === 'negative' ? 'blocked' : 'unverified';
        if (gate === 'positive') {
          state.destination = 'Teaching South / south-a';
          metrics.switchSeconds = fixture.switching;
        }
        summary = `DATA ONLY: fictional alternate ${state.recovery}; measured capacity and data gates must precede selection, even when a shallow proxy is healthy.`;
      }
      if (action.type === 'journeys') {
        state.phase = 'assessed';
        if (state.destination) {
          metrics.clientSeconds = fixture.client;
          metrics.interruptionSeconds = metrics.detectionSeconds + metrics.switchSeconds + metrics.clientSeconds;
          metrics.committedEffects = fixture.effects;
          state.journeys = [
            { name: 'getProfile', result: 'positive', session: 'lesson-session-001', note: 'Fictional profile and session recovered.' },
            { name: 'confirmOrder', result: fixture.effects === 1 ? 'positive' : 'negative', effects: fixture.effects, receipt: fixture.effects === 1 ? 'committed-once' : 'duplicate-effect', note: 'Fictional lesson-order-001: total effects across the prior commit and retry.' },
          ];
          state.checks.transactions = known(fixture.effects === 1);
          state.checks.clientRecovery = combine(state.journeys.map((journey) => journey.result));
          state.checks.budget = known(metrics.interruptionSeconds <= state.config.budgetSeconds);
        } else {
          state.journeys = [
            { name: 'getProfile', result: state.recovery === 'blocked' ? 'negative' : 'unknown', session: null, note: 'No eligible fictional alternate; no recovered profile observation.' },
            { name: 'confirmOrder', result: 'unknown', effects: null, receipt: 'unconfirmed', note: 'The prior commit is unconfirmed, not inferred lost or committed.' },
          ];
          state.checks.clientRecovery = state.recovery === 'blocked' ? 'negative' : 'unknown';
        }
        metrics.successfulJourneys = state.journeys.filter((journey) => journey.result === 'positive').length;
        metrics.interruptedJourneys = state.journeys.filter((journey) => journey.result === 'negative').length;
        metrics.unknownJourneys = state.journeys.filter((journey) => journey.result === 'unknown').length;
        summary = `DATA ONLY: sample two authored journeys; positive ${metrics.successfulJourneys}, interrupted ${metrics.interruptedJourneys}, unknown ${metrics.unknownJourneys}. Full regional continuity is still UNKNOWN.`;
      }
    }
    state.conclusion = combine(Object.values(state.checks));
    state.history.push({
      sequence: state.history.length + 1, run: state.runCount, action: clone(action), phase: state.phase,
      conclusion: state.conclusion, regionalContinuity: 'unknown', checks: clone(state.checks),
      metrics: clone(state.metrics), destination: state.destination, recovery: state.recovery, summary,
    });
    return state;
  }
  function assertState(state) {
    try {
      inspect(state);
      if (!state || Array.isArray(state) || !Array.isArray(state.history) || state.history.length > limits.maxHistory) throw new Error('shape');
      // Bounded replay rejects fabricated observations and edited historical results.
      let replay = initialState();
      for (const event of state.history) replay = advance(replay, event.action);
      if (!same(state, replay)) throw new Error('history mismatch');
    } catch {
      fail('S114_STATE', 'State must exactly match its bounded, typed teaching history; no forged result is accepted.');
    }
  }
  function createState() {
    return freeze(initialState());
  }
  function applyAction(state, action) {
    assertState(state);
    return freeze(advance(state, action));
  }
  return freeze({
    createState, applyAction, parseBudget, fixtures, faultKinds, limits,
    banner: 'Training rehearsal - synthetic data - not a live Azure result',
  });
}));
