(function (root) {
  'use strict';
  const LIMITS = Object.freeze({ maxAttempts: 6, consumers: 3 });
  const INPUTS = Object.freeze({
    deployment: ['blue', 'green'],
    route: ['adapter', 'versioned', 'force-v2'],
    upgrades: ['none', 'one', 'all'],
    observation: ['complete', 'missing-last'],
  });
  const CONSUMERS = Object.freeze(['synthetic-a', 'synthetic-b', 'synthetic-c']);

  function invalid(message) {
    throw new Error(message);
  }

  function record(value, expectedKeys, label) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      invalid(`${label}: expected a plain data object.`);
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== expectedKeys.length
        || keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))) {
      invalid(`${label}: invalid or extra properties.`);
    }
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
        invalid(`${label}: accessors and hidden properties are invalid.`);
      }
    }
  }

  function array(value, label) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
        || value.length > LIMITS.maxAttempts
        || Reflect.ownKeys(value).length !== value.length + 1) {
      invalid(`${label}: invalid bounded array.`);
    }
    for (let i = 0; i < value.length; i += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
        invalid(`${label}: sparse arrays and accessors are invalid.`);
      }
    }
  }

  function input(value, label = 'Invalid input configuration') {
    record(value, Object.keys(INPUTS), label);
    for (const key of Object.keys(INPUTS)) {
      if (!INPUTS[key].includes(value[key])) invalid(`${label}: invalid ${key}.`);
    }
    return {
      deployment: value.deployment, route: value.route,
      upgrades: value.upgrades, observation: value.observation,
    };
  }

  function freeze(value) {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }

  function sameData(actual, expected) {
    const label = 'Invalid state history';
    if (Array.isArray(expected)) {
      array(actual, label);
      if (actual.length !== expected.length) invalid(`${label}: changed array length.`);
      expected.forEach((value, i) => sameData(actual[i], value));
    } else if (expected && typeof expected === 'object') {
      record(actual, Object.keys(expected), label);
      for (const key of Object.keys(expected)) sameData(actual[key], expected[key]);
    } else if (actual !== expected) {
      invalid(`${label}: recorded result does not match the deterministic observation.`);
    }
  }

  function profile(contract) {
    return contract === 'v1'
      ? { profileId: 'synthetic-053', displayName: 'Ada Example' }
      : { profileId: 'synthetic-053', name: { given: 'Ada', family: 'Example' } };
  }

  function validBody(body, contract) {
    if (!body || body.profileId !== 'synthetic-053') return false;
    return contract === 'v1'
      ? body.displayName === 'Ada Example'
      : body.name?.given === 'Ada' && body.name?.family === 'Example';
  }

  function journey(config, index) {
    const upgraded = config.upgrades === 'all' || (config.upgrades === 'one' && index === 0);
    const expectedContract = upgraded ? 'v2' : 'v1';
    const requestedContract = config.route === 'force-v2' ? 'v2' : expectedContract;
    const requestedEndpoint = config.route === 'adapter' ? '/profile' : `/api/${requestedContract}/profile`;
    const common = { consumer: CONSUMERS[index], expectedContract, requestedEndpoint };
    if (config.observation === 'missing-last' && index === LIMITS.consumers - 1) {
      return {
        ...common, adapterUsed: null, observed: null, status: 'unknown',
        reason: 'Journey started, but response and deployment observation are absent; no success is inferred.',
      };
    }
    const supported = config.deployment === 'green' || requestedContract === 'v1';
    const observed = {
      deployment: config.deployment,
      softwareVersion: config.deployment === 'green' ? '2.0.0' : '1.8.0',
      apiContract: supported ? requestedContract : null,
      httpStatus: supported ? 200 : 404,
      body: supported ? profile(requestedContract) : null,
    };
    const passed = observed.httpStatus === 200 && validBody(observed.body, expectedContract);
    const reason = !supported
      ? 'Blue software does not serve the requested API v2 contract (synthetic HTTP 404).'
      : passed
        ? `Required API ${expectedContract} shape and synthetic profile value preserved on ${config.deployment}.`
        : `HTTP 200 is not compatibility: expected ${expectedContract} displayName, received v2 name.`;
    return {
      ...common,
      adapterUsed: supported && config.deployment === 'green' && requestedContract === 'v1',
      observed, status: passed ? 'passed' : 'failed', reason,
    };
  }

  function result(config, id) {
    const rows = CONSUMERS.map((_, index) => journey(config, index));
    const completed = rows.filter((row) => row.status === 'passed').length;
    const migrated = rows.filter((row) => row.status === 'passed' && row.observed.deployment === 'green').length;
    const interruptions = rows.filter((row) => row.status === 'failed').length;
    const unknown = rows.filter((row) => row.status === 'unknown').length;
    const stayedOnBlue = completed - migrated;
    const verdict = interruptions > 0 ? 'failed' : migrated === LIMITS.consumers ? 'passed' : 'unknown';
    const impact = interruptions > 0 ? 'interrupted'
      : unknown > 0 ? 'unverified' : migrated === LIMITS.consumers ? 'complete-synthetic-migration' : 'no-migration';
    const explanation = verdict === 'passed'
      ? 'Every declared contract and profile value passes on green. This is only a synthetic migration result.'
      : interruptions > 0
        ? 'Known broken contracts are interruptions, even with HTTP 200; later attempts cannot erase them.'
        : unknown > 0
          ? 'Missing observation remains in the denominator and blocks a successful migration verdict.'
          : 'Requests passed on blue, but no completed migration to green was observed.';
    return {
      id, config, rows,
      summary: {
        attempted: LIMITS.consumers, completed, migrated, interruptions,
        unknown, stayedOnBlue, migrationFraction: `${migrated}/${LIMITS.consumers}`,
      },
      verdict, impact, explanation,
    };
  }

  function stateGuard(state) {
    record(state, ['schemaVersion', 'nextId', 'history'], 'Invalid state');
    array(state.history, 'Invalid state history');
    if (state.schemaVersion !== 1 || !Number.isInteger(state.nextId)
        || state.nextId !== state.history.length + 1) invalid('Invalid state version or sequence.');
    state.history.forEach((entry, index) => {
      record(entry, ['id', 'config', 'rows', 'summary', 'verdict', 'impact', 'explanation'], 'Invalid state history');
      const config = input(entry.config, 'Invalid state history configuration');
      sameData(entry, result(config, index + 1));
    });
  }

  function initialState() {
    return freeze({ schemaVersion: 1, nextId: 1, history: [] });
  }

  function conduct(state, configuration) {
    stateGuard(state);
    const config = input(configuration);
    if (state.history.length === LIMITS.maxAttempts) {
      invalid('The six-attempt history limit is reached; explicitly reset to start again.');
    }
    return freeze({
      schemaVersion: 1, nextId: state.nextId + 1,
      history: [...state.history, result(config, state.nextId)],
    });
  }

  const api = Object.freeze({ LIMITS, initialState, conduct });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.defineProperty(root, 'S053', { value: api });
}(typeof globalThis === 'object' ? globalThis : this));
