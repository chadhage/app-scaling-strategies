(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S052 = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DEFAULTS = Object.freeze({
    routing: 'mixed',
    requirement: 'base',
    policy: 'contract-aware',
    oldCondition: 'supported',
  });
  const OPTIONS = Object.freeze({
    routing: Object.freeze(['mixed', 'old-only', 'new-only']),
    requirement: Object.freeze(['base', 'optional-timezone', 'required-timezone']),
    policy: Object.freeze(['contract-aware', 'status-only']),
    oldCondition: Object.freeze(['supported', 'malformed', 'timeout', 'unobserved']),
  });
  const ROUTES = Object.freeze({
    mixed: Object.freeze(['old', 'new', 'old', 'new']),
    'old-only': Object.freeze(['old', 'old', 'old', 'old']),
    'new-only': Object.freeze(['new', 'new', 'new', 'new']),
  });
  const minted = new WeakSet();
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function seal(state) {
    freeze(state);
    minted.add(state);
    return state;
  }
  function configuration(input) {
    const keys = Object.keys(OPTIONS);
    if (!input || Object.getPrototypeOf(input) !== Object.prototype
        || Reflect.ownKeys(input).length !== keys.length) {
      throw new Error('Invalid configuration: provide exactly the four declared fields.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    for (const key of keys) {
      const field = descriptors[key];
      if (!field || !Object.hasOwn(field, 'value') || typeof field.value !== 'string'
          || !OPTIONS[key].includes(field.value)) {
        throw new Error(`Invalid configuration: ${key} must be an exact listed value.`);
      }
    }
    return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
  }
  function metrics(rows) {
    const count = (predicate) => rows.filter(predicate).length;
    return {
      attempted: rows.length,
      success: count((row) => row.outcome === 'success'),
      failure: count((row) => row.outcome === 'failure'),
      unknown: count((row) => row.outcome === 'unknown'),
      responses200: count((row) => row.httpStatus === 200),
      oldRequests: count((row) => row.backend === 'old'),
      newRequests: count((row) => row.backend === 'new'),
      optionalUnavailable: count((row) => row.feature === 'unavailable-optional'),
      rejectedSilentSuccess: count((row) => row.outcome === 'failure' && row.frontendResult === 'claims-success'),
    };
  }
  function request(config, index) {
    const backend = ROUTES[config.routing][index];
    const old = backend === 'old';
    const row = {
      requestId: `request-0${index + 1}`, frontend: 'frontend-v2', backend,
      deployment: old ? 'api-v1' : 'api-v2',
      contract: old ? 'profile.v1' : 'profile.v2',
      httpStatus: 200, observation: 'response', body: null, view: null,
      feature: 'not-requested', frontendResult: 'not-rendered',
      outcome: 'unknown', reason: '',
    };
    if (old && config.oldCondition === 'unobserved') {
      return {
        ...row, contract: 'unverified', httpStatus: null, observation: 'missing',
        feature: 'unverified', frontendResult: 'unverified',
        reason: 'Old-route request attempted; response evidence is unavailable, not a proven success or timeout.',
      };
    }
    if (old && config.oldCondition === 'timeout') {
      return {
        ...row, httpStatus: null, observation: 'timeout', frontendResult: 'error',
        outcome: 'failure', reason: 'Observed old-API timeout interrupted the required base journey.',
      };
    }
    row.body = old && config.oldCondition === 'malformed'
      ? { profileId: 'profile-synthetic', name: 'Aster' }
      : { profileId: 'profile-synthetic', displayName: 'Aster', ...(!old ? { timeZone: 'Etc/UTC' } : {}) };
    const baseValid = row.body.profileId === 'profile-synthetic' && row.body.displayName === 'Aster';
    const featureAvailable = row.body.timeZone === 'Etc/UTC';
    const required = config.requirement === 'required-timezone';
    const optional = config.requirement === 'optional-timezone';
    row.feature = config.requirement === 'base' ? 'not-requested'
      : featureAvailable ? 'available' : required ? 'unavailable-required' : 'unavailable-optional';
    row.frontendResult = config.policy === 'status-only' ? 'claims-success'
      : !baseValid ? 'error'
        : required && !featureAvailable ? 'explicit-unsupported'
          : optional && !featureAvailable ? 'rendered-feature-unavailable' : 'rendered';
    if (!baseValid || (required && !featureAvailable)) {
      row.outcome = 'failure';
      row.reason = !baseValid ? 'Required displayName is absent: HTTP 200 does not satisfy profile.v1.'
        : 'Required timeZone is unavailable on the old API; the new frontend cannot complete this journey.';
      if (row.frontendResult === 'claims-success') row.reason += ' Silent success rejected by the independent contract verifier.';
      return row;
    }
    row.view = {
      profileId: row.body.profileId, displayName: row.body.displayName,
      timeZone: config.requirement !== 'base' && featureAvailable ? row.body.timeZone : null,
    };
    row.outcome = 'success';
    row.reason = optional && !featureAvailable
      ? 'Supported base profile rendered; optional timeZone is explicitly unavailable, with no fabricated default.'
      : 'Declared required contract satisfied by the observed response.';
    return row;
  }
  function attempt(id, config, rows) {
    const counts = metrics(rows);
    const complete = rows.length === 4;
    const outcome = !complete ? 'unknown' : counts.failure ? 'failure' : counts.unknown ? 'unknown' : 'success';
    const oldRows = rows.filter((row) => row.backend === 'old');
    const oldCompatibility = !oldRows.length ? 'not established: no old API requests'
      : !complete ? 'not established: attempt incomplete'
        : oldRows.some((row) => row.outcome === 'failure') ? 'not established: old required journey failed'
          : oldRows.some((row) => row.outcome === 'unknown') ? 'not established: old evidence unavailable'
            : 'demonstrated in this synthetic attempt';
    return {
      id, config, cursor: rows.length, rows, outcome, metrics: counts, oldCompatibility,
      scope: 'Synthetic contract compatibility only; no completed migration or native routing propagation is established.',
    };
  }
  function createState() {
    return seal({
      phase: 'ready', config: DEFAULTS, current: null, history: [], prediction: null,
    });
  }
  function transition(state, action, payload) {
    if (!state || !minted.has(state)) throw new Error('Invalid state: use a state produced by this model.');
    if (!['start', 'step', 'again', 'predict', 'reset'].includes(action)) throw new Error('Unknown action.');
    if (!['start', 'predict'].includes(action) && payload !== undefined) throw new Error('Unexpected action payload.');
    if (action === 'reset') return createState();
    if (action === 'start') {
      if (state.phase !== 'ready') throw new Error('Invalid phase: start requires a ready attempt.');
      if (state.history.length >= 8) throw new Error('History holds 8 attempts; reset explicitly to continue.');
      const config = configuration(payload);
      return seal({
        ...state, phase: 'running', config, prediction: null,
        current: attempt(state.history.length + 1, config, []),
      });
    }
    if (action === 'step') {
      if (state.phase !== 'running') throw new Error('Invalid phase: send a request only during an active attempt.');
      const rows = [...state.current.rows, request(state.config, state.current.cursor)];
      const current = attempt(state.current.id, state.config, rows);
      const complete = rows.length === 4;
      return seal({
        ...state, current, phase: complete ? 'complete' : 'running',
        history: complete ? [...state.history, current] : state.history,
      });
    }
    if (state.phase !== 'complete') throw new Error('Invalid phase: complete all four requests first.');
    if (action === 'again') {
      if (state.history.length >= 8) throw new Error('History holds 8 attempts; reset explicitly to continue.');
      return seal({ ...state, phase: 'ready', current: null, prediction: null });
    }
    if (typeof payload !== 'string' || !['success', 'failure', 'unknown'].includes(payload)) {
      throw new Error('Invalid prediction: choose exactly success, failure or unknown.');
    }
    return seal({
      ...state,
      prediction: {
        expected: payload, actual: state.current.outcome,
        verdict: payload === state.current.outcome ? 'PASS' : 'FAIL',
      },
    });
  }
  return Object.freeze({ DEFAULTS, OPTIONS, createState, transition });
}));
