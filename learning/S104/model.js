(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S104Lesson = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const MAX_RUNS = 12;
  const JOURNEY_BUDGET_MS = 250;
  const EXPECTED_HOST = 'production-host-label';
  const EXPECTED_STATE = 'lesson-state-A';
  const EXPECTED_ROUTE = 'candidate-label';
  const CHECK_NAMES = ['host', 'redirect', 'callback', 'authentication', 'routing', 'journey'];
  const SCENARIOS = freeze([
    { id: 'approved', label: 'Approved external path' },
    { id: 'host-mismatch', label: 'External host-header mismatch' },
    { id: 'redirect-loop', label: 'External redirect loop' },
    { id: 'callback-state-lost', label: 'External callback loses state' },
    { id: 'authentication-fails', label: 'External authentication fails' },
    { id: 'routing-mismatch', label: 'External destination differs' },
    { id: 'external-unobserved', label: 'External path unobserved' },
    { id: 'callback-unobserved', label: 'Callback observation missing' }
  ]);
  const ACTIONS = freeze([
    { id: 'warm-up', label: 'Record internal warm-up only' },
    { id: 'compare', label: 'Compare with the external teaching trace' }
  ]);

  function freeze(value) {
    if (value !== null && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function invalid(label, detail) {
    throw new TypeError(`Invalid ${label}: ${detail}`);
  }

  function plain(value, keys, label) {
    if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      invalid(label, 'expected a plain record');
    }
    const own = Reflect.ownKeys(value);
    if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) {
      invalid(label, 'unexpected or missing fields');
    }
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
        invalid(label, 'accessors and hidden fields are unsupported');
      }
    }
  }

  function array(value, length, label) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== length) {
      invalid(label, 'expected an exact dense array');
    }
    if (Reflect.ownKeys(value).length !== length + 1) invalid(label, 'extra array fields or holes');
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
        invalid(label, 'array accessors and holes are unsupported');
      }
    }
  }

  function exact(value, expected, label) {
    if (Array.isArray(expected)) {
      array(value, expected.length, label);
      expected.forEach((item, index) => exact(value[index], item, label));
    } else if (expected !== null && typeof expected === 'object') {
      plain(value, Object.keys(expected), label);
      for (const key of Object.keys(expected)) exact(value[key], expected[key], label);
    } else if (!Object.is(value, expected)) {
      invalid(label, 'record differs from its fixed teaching trace');
    }
  }

  function selection(value, list, label) {
    if (typeof value !== 'string' || !list.some(item => item.id === value)) invalid(label, 'choose a listed teaching condition');
  }

  function externalFixture(scenarioId) {
    if (scenarioId === 'external-unobserved') return null;
    const fixture = {
      host: EXPECTED_HOST, hops: 1, loop: false, callback: EXPECTED_STATE,
      authentication: 'success', route: EXPECTED_ROUTE, statusCode: 200, durationMs: 180
    };
    if (scenarioId === 'host-mismatch') fixture.host = 'internal-host-label';
    if (scenarioId === 'redirect-loop') { fixture.hops = 3; fixture.loop = true; fixture.durationMs = 240; }
    if (scenarioId === 'callback-state-lost') fixture.callback = 'lesson-state-B';
    if (scenarioId === 'authentication-fails') { fixture.authentication = 'failure'; fixture.statusCode = 401; }
    if (scenarioId === 'routing-mismatch') fixture.route = 'stale-route-label';
    if (scenarioId === 'callback-unobserved') fixture.callback = null;
    return fixture;
  }

  function check(name, status, observed, durationMs) {
    return { name, status, observed, durationMs };
  }

  function externalChecks(fixture) {
    if (fixture === null) return CHECK_NAMES.map(name => check(name, 'unknown', 'Not observed', null));
    return [
      check('host', fixture.host === EXPECTED_HOST ? 'success' : 'failure',
        `Expected ${EXPECTED_HOST}; observed ${fixture.host}`, 12),
      check('redirect', fixture.loop ? 'failure' : 'success',
        fixture.loop ? '3 approved-hop attempts; loop detected' : '1 approved hop; no loop', fixture.loop ? 90 : 30),
      check('callback', fixture.callback === null ? 'unknown' : fixture.callback === EXPECTED_STATE ? 'success' : 'failure',
        `Expected ${EXPECTED_STATE}; observed ${fixture.callback === null ? 'not observed' : fixture.callback}`, fixture.callback === null ? null : 40),
      check('authentication', fixture.authentication, `Teaching authentication ${fixture.authentication}`, 25),
      check('routing', fixture.route === EXPECTED_ROUTE ? 'success' : 'failure',
        `Expected ${EXPECTED_ROUTE}; observed ${fixture.route}`, 13),
      check('journey', fixture.statusCode === 200 && fixture.durationMs <= JOURNEY_BUDGET_MS ? 'success' : 'failure',
        `HTTP ${fixture.statusCode}; ${fixture.durationMs} synthetic ms; budget ${JOURNEY_BUDGET_MS} ms`, fixture.durationMs)
    ];
  }

  function record(sequence, scenarioId, actionId) {
    const fixture = actionId === 'compare' ? externalFixture(scenarioId) : null;
    const checks = externalChecks(fixture);
    const failures = checks.filter(item => item.status === 'failure').map(item => item.name);
    const unknowns = checks.filter(item => item.status === 'unknown').map(item => item.name);
    const status = failures.length ? 'failure' : unknowns.length ? 'unknown' : 'success';
    let reason = 'Only this synthetic external path passes: matching host, approved non-looping redirect, retained callback state, authentication, routing and journey budget.';
    if (failures.length) reason = `Internal warm-up succeeded, but external failures were detected: ${failures.join(', ')}.`;
    else if (unknowns.length) reason = `Internal warm-up succeeded; external checks not observed: ${unknowns.join(', ')}. Internal success is not external-path proof.`;
    return {
      sequence, scenarioId, actionId,
      internal: { status: 'success', host: 'internal-host-label', path: 'warm-up-label', statusCode: 200, durationMs: 32 },
      checks, externalMs: fixture === null ? null : fixture.durationMs,
      assessment: { status, eligible: status === 'success', reason }
    };
  }

  function validateState(state) {
    plain(state, ['schemaVersion', 'current', 'history'], 'state');
    if (state.schemaVersion !== 1) invalid('state', 'unsupported schema version');
    if (!Array.isArray(state.history) || state.history.length > MAX_RUNS) invalid('state', 'history exceeds the fixed session bound');
    array(state.history, state.history.length, 'state');
    state.history.forEach((item, index) => {
      plain(item, ['sequence', 'scenarioId', 'actionId', 'internal', 'checks', 'externalMs', 'assessment'], 'state');
      selection(item.scenarioId, SCENARIOS, 'state');
      selection(item.actionId, ACTIONS, 'state');
      exact(item, record(index + 1, item.scenarioId, item.actionId), 'state');
    });
    if (state.current !== null && (!Number.isInteger(state.current) || state.current < 1 || state.current !== state.history.length)) {
      invalid('state', 'current must be the latest retained record or null after reset');
    }
    return true;
  }

  function retained(state) {
    return state.history.map(item => record(item.sequence, item.scenarioId, item.actionId));
  }

  function createState() {
    return freeze({ schemaVersion: 1, current: null, history: [] });
  }

  function run(state, input) {
    validateState(state);
    plain(input, ['scenarioId', 'actionId'], 'input');
    selection(input.scenarioId, SCENARIOS, 'input');
    selection(input.actionId, ACTIONS, 'input');
    if (state.history.length === MAX_RUNS) throw new RangeError('Session limit: 12 recorded comparisons. Reset retains history; open a new page session for another allowance.');
    const next = record(state.history.length + 1, input.scenarioId, input.actionId);
    return freeze({ schemaVersion: 1, current: next.sequence, history: [...retained(state), next] });
  }

  function reset(state) {
    validateState(state);
    return freeze({ schemaVersion: 1, current: null, history: retained(state) });
  }

  function current(state) {
    validateState(state);
    return state.current === null ? null : state.history[state.current - 1];
  }

  function summary(state) {
    validateState(state);
    const counts = { total: state.history.length, success: 0, failure: 0, unknown: 0, remaining: MAX_RUNS - state.history.length };
    state.history.forEach(item => { counts[item.assessment.status] += 1; });
    return freeze(counts);
  }

  return freeze({ SCENARIOS, ACTIONS, MAX_RUNS, JOURNEY_BUDGET_MS, createState, run, reset, current, summary, validateState });
}));
