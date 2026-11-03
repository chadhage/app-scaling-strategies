(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'S108Lesson', { value: factory() });
}(globalThis, function () {
  'use strict';

  const VERSION = 's108-waf-fixture-v1';
  const ROUTE = 'training-candidate-route';
  const LIMITS = { comparisons: 4, history: 16 };
  const REQUESTS = [
    { id: 'page', kind: 'journey', path: '/candidate/home' },
    { id: 'profile', kind: 'journey', path: '/candidate/api/profile' },
    { id: 'script', kind: 'asset', path: '/candidate/assets/app.v2.js' },
  ];
  const POLICIES = {
    matched: { title: 'Matched policy', statuses: [200, 200, 200], rules: [null, null, null] },
    'journey-block': { title: 'Mismatch: valid API blocked', statuses: [200, 403, 200], rules: [null, 'POLICY-API', null] },
    'asset-block': { title: 'Mismatch: required script blocked', statuses: [200, 200, 403], rules: [null, null, 'POLICY-ASSET'] },
    'missing-observation': { title: 'Script observation unavailable', statuses: [200, 200, null], rules: [null, null, null] },
  };
  const RECOVERIES = {
    complete: { title: 'Complete baseline observations', statuses: [200, 200, 200], rules: [null, null, null] },
    'blocked-asset': { title: 'Restored label, script still blocked', statuses: [200, 200, 403], rules: [null, null, 'POLICY-ASSET'] },
    'missing-asset': { title: 'Restored label, script unobserved', statuses: [200, 200, null], rules: [null, null, null] },
  };

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  freeze(POLICIES);
  freeze(RECOVERIES);
  freeze(REQUESTS);
  freeze(LIMITS);

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
  function exactKeys(value, keys, code, name) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype
        || Reflect.ownKeys(value).length !== keys.length
        || keys.some((key) => !Object.hasOwn(value, key))
        || Reflect.ownKeys(value).some((key) => typeof key !== 'string' || !keys.includes(key))) {
      fail(code, `${name} must be a plain object with exactly: ${keys.join(', ')}.`);
    }
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        fail(code, `${name} must contain only enumerable data properties.`);
      }
    }
  }
  function command(value) {
    const typeDescriptor = value && typeof value === 'object'
      ? Object.getOwnPropertyDescriptor(value, 'type') : null;
    const type = typeDescriptor && Object.hasOwn(typeDescriptor, 'value') ? typeDescriptor.value : null;
    if (!['apply', 'inspect', 'restore', 'verify'].includes(type)) {
      fail('ERR_S108_INPUT', 'Choose a known operator action.');
    }
    exactKeys(value, type === 'apply' ? ['type', 'policy', 'recovery'] : ['type'], 'ERR_S108_INPUT', 'Command');
    if (type === 'apply'
        && (typeof value.policy !== 'string' || !Object.hasOwn(POLICIES, value.policy)
          || typeof value.recovery !== 'string' || !Object.hasOwn(RECOVERIES, value.recovery))) {
      fail('ERR_S108_INPUT', 'Choose one fixed policy and one fixed recovery observation fixture.');
    }
    return type === 'apply' ? { type, policy: value.policy, recovery: value.recovery } : { type };
  }
  function assertData(value, seen = new Set(), depth = 0, budget = { remaining: 4000 }) {
    if (--budget.remaining < 0 || depth > 12) fail('ERR_S108_STATE', 'State exceeds the bounded data envelope.');
    if (typeof value === 'string' && value.length > 256) fail('ERR_S108_STATE', 'State strings exceed the fixed fixture envelope.');
    if (value === null || ['string', 'boolean'].includes(typeof value)) return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value !== 'object' || seen.has(value)) fail('ERR_S108_STATE', 'State must be finite, acyclic data.');
    seen.add(value);
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) {
      fail('ERR_S108_STATE', 'State contains an unsupported object prototype.');
    }
    const keys = Reflect.ownKeys(value);
    if (array && (value.length > 100 || keys.length !== value.length + 1
        || keys.some((key) => key !== 'length' && !/^(0|[1-9]\d*)$/.test(String(key))))) {
      fail('ERR_S108_STATE', 'State arrays must be dense, bounded and without extra keys.');
    }
    for (const key of keys) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        fail('ERR_S108_STATE', 'State must contain enumerable data properties, not accessors or symbols.');
      }
      assertData(descriptor.value, seen, depth + 1, budget);
    }
    seen.delete(value);
  }
  function equal(left, right) {
    if (Object.is(left, right)) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length
      && keys.every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]));
  }
  function requests(fixture) {
    return REQUESTS.map((request, index) => ({
      ...request, route: ROUTE, authentication: 'valid-fictional-session',
      status: fixture.statuses[index], rule: fixture.rules[index],
      observation: fixture.statuses[index] === null ? 'unknown'
        : fixture.statuses[index] === 403 ? 'block' : 'allow',
    }));
  }
  function measure(observations) {
    if (!observations) return {
      attempted: 0, allowed: 0, blocked: 0, unknown: 0,
      journeysAttempted: 0, journeysSuccessful: 0, journeysInterrupted: 0, journeysUnknown: 0,
      blockedJourneys: 0, blockedAssets: 0,
    };
    const blocked = observations.filter((entry) => entry.observation === 'block');
    const unknown = observations.filter((entry) => entry.observation === 'unknown').length;
    return {
      attempted: observations.length,
      allowed: observations.filter((entry) => entry.observation === 'allow').length,
      blocked: blocked.length, unknown, journeysAttempted: 1,
      journeysSuccessful: blocked.length === 0 && unknown === 0 ? 1 : 0,
      journeysInterrupted: blocked.length ? 1 : 0,
      journeysUnknown: blocked.length === 0 && unknown > 0 ? 1 : 0,
      blockedJourneys: blocked.filter((entry) => entry.kind === 'journey').length,
      blockedAssets: blocked.filter((entry) => entry.kind === 'asset').length,
    };
  }
  function classify(counts) {
    if (counts.journeysInterrupted) return 'negative';
    if (counts.journeysSuccessful) return 'positive';
    return 'unknown';
  }
  function statistics(history) {
    const applied = history.filter((event) => event.action === 'apply');
    const inspected = history.filter((event) => event.action === 'inspect');
    const restored = history.filter((event) => event.action === 'restore');
    const verified = history.filter((event) => event.action === 'verify');
    const count = (events, result) => events.filter((event) => event.result === result).length;
    return {
      comparisons: applied.length, inspected: inspected.length,
      positive: count(inspected, 'positive'), negative: count(inspected, 'negative'),
      unknown: count(inspected, 'unknown'),
      blockedJourneys: inspected.reduce((total, event) => total + event.counts.blockedJourneys, 0),
      blockedAssets: inspected.reduce((total, event) => total + event.counts.blockedAssets, 0),
      recoveries: verified.length, recoveryPositive: count(verified, 'positive'),
      recoveryNegative: count(verified, 'negative'), recoveryUnknown: count(verified, 'unknown'),
      pendingInspections: applied.length - inspected.length,
      pendingRecoveries: restored.length - verified.length,
    };
  }
  function createState() {
    return freeze({
      schemaVersion: 1, fixture: VERSION, phase: 'ready', activePolicy: 'baseline-v1',
      current: null, history: [], stats: statistics([]),
    });
  }
  function allowed(state) {
    return {
      apply: ['ready', 'verified'].includes(state.phase) && state.stats.comparisons < LIMITS.comparisons,
      inspect: state.phase === 'applied',
      restore: state.phase === 'inspected',
      verify: state.phase === 'restored',
    };
  }
  function advance(state, input) {
    if (!allowed(state)[input.type]) {
      fail('ERR_S108_ACTION', 'Action is out of order or the four-comparison bound is reached. Inspect, restore and verify in order, or reset explicitly.');
    }
    let current = state.current;
    let phase;
    let activePolicy = state.activePolicy;
    let observations = null;
    if (input.type === 'apply') {
      current = {
        id: state.stats.comparisons + 1, policy: input.policy, recoveryFixture: input.recovery,
        result: 'unknown', requests: null, recoveryResult: 'unknown', recoveryRequests: null,
      };
      activePolicy = input.policy;
      phase = 'applied';
    } else if (input.type === 'inspect') {
      observations = requests(POLICIES[current.policy]);
      current = { ...current, result: classify(measure(observations)), requests: observations };
      phase = 'inspected';
    } else if (input.type === 'restore') {
      activePolicy = 'baseline-v1';
      phase = 'restored';
    } else {
      observations = requests(RECOVERIES[current.recoveryFixture]);
      current = { ...current, recoveryResult: classify(measure(observations)), recoveryRequests: observations };
      phase = 'verified';
    }
    const counts = measure(observations);
    const event = {
      sequence: state.history.length + 1, comparisonId: current.id, action: input.type,
      policy: current.policy, recoveryFixture: current.recoveryFixture,
      phase, activePolicy, result: classify(counts), requests: observations, counts,
    };
    const history = [...state.history, event];
    return freeze({ ...state, current, phase, activePolicy, history, stats: statistics(history) });
  }
  function validate(state) {
    assertData(state);
    exactKeys(state, ['schemaVersion', 'fixture', 'phase', 'activePolicy', 'current', 'history', 'stats'],
      'ERR_S108_STATE', 'State');
    if (!Array.isArray(state.history) || state.history.length > LIMITS.history) {
      fail('ERR_S108_STATE', 'State history exceeds the sixteen-record bound.');
    }
    let canonical = createState();
    for (const event of state.history) {
      exactKeys(event, ['sequence', 'comparisonId', 'action', 'policy', 'recoveryFixture', 'phase', 'activePolicy', 'result', 'requests', 'counts'],
        'ERR_S108_STATE', 'History event');
      let input;
      try {
        input = command(event.action === 'apply'
          ? { type: 'apply', policy: event.policy, recovery: event.recoveryFixture } : { type: event.action });
        canonical = advance(canonical, input);
      } catch {
        fail('ERR_S108_STATE', 'History is not a legal sequence of fixed fixture actions.');
      }
    }
    if (!equal(state, canonical)) fail('ERR_S108_STATE', 'State does not match canonical replay of its retained history.');
    return canonical;
  }
  function transition(state, input) {
    return advance(validate(state), command(input));
  }
  function availability(state) {
    return freeze(allowed(validate(state)));
  }

  return freeze({
    createState, transition, availability,
    config: {
      version: VERSION, route: ROUTE, limits: LIMITS, requests: REQUESTS,
      policies: Object.entries(POLICIES).map(([id, fixture]) => ({ id, title: fixture.title })),
      recoveries: Object.entries(RECOVERIES).map(([id, fixture]) => ({ id, title: fixture.title })),
    },
  });
}));
