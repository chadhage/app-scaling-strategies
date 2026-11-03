'use strict';

(function expose(root, factory) {
  const lesson = factory();
  if (typeof module === 'object' && module.exports) module.exports = lesson;
  else root.S106Lesson = lesson;
})(typeof globalThis === 'object' ? globalThis : this, function makeLesson() {
  const MAX_RUNS = 12;
  const BUDGET_MS = 150;
  const REQUIRED_CLIENT = 'application-private-segment';
  const REQUIRED_DNS = 'private-address-label';
  const REQUIRED_DEPENDENCY = 'orders-private-label';
  const actions = freeze([
    { id: 'public-only', label: 'Record public probe only' },
    { id: 'public-internal', label: 'Record public and internal health only' },
    { id: 'compare-private', label: 'Compare with the private teaching trace' }
  ]);
  const ready = {
    client: REQUIRED_CLIENT, dnsAnswer: REQUIRED_DNS, connected: true, authorized: true,
    dependency: REQUIRED_DEPENDENCY, httpStatus: 200, latencyMs: 84, managementExposed: false
  };
  const conditions = freeze([
    { id: 'private-ready', label: 'Complete private-path teaching trace', trace: { ...ready } },
    { id: 'dns-public-answer', label: 'Private client gets a public DNS answer', trace: { ...ready, dnsAnswer: 'public-address-label' } },
    { id: 'connection-denied', label: 'Private connection denied', trace: { ...ready, connected: false, authorized: null, httpStatus: null, latencyMs: null } },
    { id: 'authorization-denied', label: 'Dependency authorization denied', trace: { ...ready, authorized: false, httpStatus: 403, latencyMs: 73 } },
    { id: 'wrong-client', label: 'Successful probe from an unrelated client', trace: { ...ready, client: 'external-probe-segment' } },
    { id: 'wrong-dependency', label: 'HTTP 200 from the wrong dependency', trace: { ...ready, dependency: 'different-service-label' } },
    { id: 'private-unobserved', label: 'No private-path observations', trace: null },
    { id: 'dns-unobserved', label: 'Private DNS answer not observed', trace: { ...ready, dnsAnswer: null } },
    { id: 'management-exposed', label: 'Private path works but management is exposed', trace: { ...ready, managementExposed: true } },
    { id: 'dependency-slow', label: 'Private HTTP 200 exceeds the journey budget', trace: { ...ready, latencyMs: 220 } }
  ]);
  const checkNames = freeze([
    ['placement', 'Application client placement'],
    ['dns', 'Private DNS answer'],
    ['connectivity', 'Private connectivity'],
    ['authorization', 'Dependency authorization'],
    ['dependency', 'Required dependency journey'],
    ['management', 'Management access remains unexposed']
  ]);

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function invalid(label) {
    throw new TypeError(`Invalid ${label}: exact typed schema required.`);
  }

  function exactObject(value, keys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.getPrototypeOf(value) !== Object.prototype) invalid(label);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const own = Reflect.ownKeys(descriptors);
    if (own.length !== keys.length || own.some(key => !keys.includes(key))) invalid(label);
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) invalid(label);
    }
  }

  function exactArray(value, label) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid(label);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const length = descriptors.length.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_RUNS) invalid(label);
    const own = Reflect.ownKeys(descriptors);
    if (own.length !== length + 1) invalid(label);
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) invalid(label);
    }
  }

  function exactTree(value, expected, label) {
    if (Array.isArray(expected)) {
      exactArray(value, label);
      if (value.length !== expected.length) invalid(label);
      expected.forEach((entry, index) => exactTree(value[index], entry, label));
    } else if (expected && typeof expected === 'object') {
      exactObject(value, Object.keys(expected), label);
      Object.keys(expected).forEach(key => exactTree(value[key], expected[key], label));
    } else if (!Object.is(value, expected)) invalid(label);
  }

  function validateInput(input) {
    exactObject(input, ['condition', 'action'], 'input');
    if (typeof input.condition !== 'string' || typeof input.action !== 'string'
        || !conditions.some(condition => condition.id === input.condition)
        || !actions.some(action => action.id === input.action)) invalid('selection');
  }

  function check(id, status, detail) {
    return { id, label: checkNames.find(item => item[0] === id)[1], status, detail };
  }

  function measured(id, value, expected, description) {
    return check(id, value === null ? 'unknown' : value === expected ? 'success' : 'failure',
      value === null ? 'Unknown - not observed' : `${description}: ${String(value)}; expected ${String(expected)}`);
  }

  function privateProbe(trace) {
    const unknownChecks = () => checkNames.map(([id]) => check(id, 'unknown', 'Unknown - not measured on the required private path'));
    if (!trace) return { status: 'unknown', latencyMs: null, observations: null, checks: unknownChecks() };
    if (trace.client !== REQUIRED_CLIENT) {
      const checks = unknownChecks();
      checks[0] = measured('placement', trace.client, REQUIRED_CLIENT, 'Observed probe client');
      // A probe outside the application path cannot diagnose that path's connectivity.
      return { status: 'unknown', latencyMs: null, observations: { ...trace }, checks };
    }
    const dependencyMissing = [trace.dependency, trace.httpStatus, trace.latencyMs].includes(null);
    const dependencyPasses = trace.dependency === REQUIRED_DEPENDENCY
      && trace.httpStatus === 200 && trace.latencyMs <= BUDGET_MS;
    const checks = [
      measured('placement', trace.client, REQUIRED_CLIENT, 'Observed probe client'),
      measured('dns', trace.dnsAnswer, REQUIRED_DNS, 'Observed DNS answer'),
      measured('connectivity', trace.connected, true, 'Observed connectivity'),
      measured('authorization', trace.authorized, true, 'Observed dependency authorization'),
      check('dependency', dependencyMissing ? 'unknown' : dependencyPasses ? 'success' : 'failure',
        dependencyMissing ? 'Unknown - dependency completion or duration not observed'
          : `Observed ${trace.dependency}; HTTP ${trace.httpStatus}; ${trace.latencyMs} synthetic ms. Required ${REQUIRED_DEPENDENCY}; HTTP 200; budget ${BUDGET_MS} synthetic ms`),
      measured('management', trace.managementExposed, false, 'Observed management exposure')
    ];
    const status = checks.some(item => item.status === 'failure') ? 'failure'
      : checks.some(item => item.status === 'unknown') ? 'unknown' : 'success';
    return { status, latencyMs: trace.latencyMs, observations: { ...trace }, checks };
  }

  function evaluate(input) {
    validateInput(input);
    const condition = conditions.find(item => item.id === input.condition);
    const privateResult = privateProbe(input.action === 'compare-private' ? condition.trace : null);
    const internal = input.action !== 'public-only';
    const conclusion = privateResult.status === 'success'
      ? 'Synthetic private-path gate passes for this fixed teaching trace only. Native private access remains unverified.'
      : privateResult.status === 'failure'
        ? 'Observed required-path or management-safety failure blocks eligibility despite public/internal success.'
        : privateResult.observations?.client !== undefined && privateResult.observations.client !== REQUIRED_CLIENT
          ? 'Unrelated probe success cannot diagnose the application client path. The actual private path remains unknown.'
          : 'Public/internal success is not private-path proof. Missing required private observations remain unknown.';
    return freeze({
      condition: input.condition, action: input.action,
      publicProbe: { status: 'success', httpStatus: 200, latencyMs: 24, scope: 'public endpoint only' },
      internalProbe: { status: internal ? 'success' : 'unknown', httpStatus: internal ? 200 : null, latencyMs: internal ? 18 : null, scope: 'process health only' },
      privateProbe: privateResult, eligible: privateResult.status === 'success',
      nativePrivatePath: 'unverified', conclusion
    });
  }

  function validateState(state) {
    exactObject(state, ['schemaVersion', 'history', 'current'], 'state');
    if (state.schemaVersion !== 1) invalid('state version');
    exactArray(state.history, 'history');
    if (state.history.length > MAX_RUNS) invalid('history bound');
    state.history.forEach((entry, index) => {
      exactObject(entry, ['sequence', 'input', 'result'], 'history record');
      validateInput(entry.input);
      exactTree(entry, { sequence: index + 1, input: entry.input, result: evaluate(entry.input) }, 'historical result');
    });
    if (state.current !== null) {
      if (!state.history.length) invalid('current record');
      exactTree(state.current, state.history[state.history.length - 1], 'current record');
    }
  }

  function initialState() {
    return freeze({ schemaVersion: 1, history: [], current: null });
  }

  function record(state, input) {
    validateState(state);
    validateInput(input);
    if (state.history.length === MAX_RUNS) {
      throw new RangeError('The 12-record page-session limit is reached. Reset keeps history and does not grant more records; reload to start a new session.');
    }
    const entry = freeze({
      sequence: state.history.length + 1, input: { condition: input.condition, action: input.action },
      result: evaluate(input)
    });
    return freeze({ schemaVersion: 1, history: [...state.history, entry], current: entry });
  }

  function reset(state) {
    validateState(state);
    return freeze({ schemaVersion: 1, history: state.history, current: null });
  }

  function summarize(state) {
    validateState(state);
    return freeze({
      attempts: state.history.length,
      publicSuccesses: state.history.filter(entry => entry.result.publicProbe.status === 'success').length,
      internalSuccesses: state.history.filter(entry => entry.result.internalProbe.status === 'success').length,
      privateSuccesses: state.history.filter(entry => entry.result.privateProbe.status === 'success').length,
      privateFailures: state.history.filter(entry => entry.result.privateProbe.status === 'failure').length,
      privateUnknowns: state.history.filter(entry => entry.result.privateProbe.status === 'unknown').length
    });
  }

  return freeze({ MAX_RUNS, BUDGET_MS, REQUIRED_CLIENT, REQUIRED_DNS, REQUIRED_DEPENDENCY,
    conditions, actions, evaluate, initialState, record, reset, summarize });
});
