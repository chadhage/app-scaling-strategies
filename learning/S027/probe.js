(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S027 = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const LIMITS = Object.freeze({ runs: 8, revisions: 32 });
  const DEFAULT = Object.freeze({ fixture: 'error-500', prediction: 'HOLD' });
  const FIXTURES = {
    'error-500': { status: 500, location: null, body: { error: 'synthetic-unavailable' } },
    'redirect-302': { status: 302, location: '/sign-in', body: null },
    'misleading-200': {
      status: 200, location: null,
      body: { ready: true, candidate: 'candidate-v2', profileId: 'wrong-profile' },
    },
    'ready-200': {
      status: 200, location: null,
      body: { ready: true, candidate: 'candidate-v2', profileId: 'training-profile' },
    },
    'unobserved-200': { status: 200, location: null, body: null },
  };
  const copy = (value) => JSON.parse(JSON.stringify(value));

  function record(value, keys, label) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      throw new TypeError(`${label} must be a plain data record.`);
    }
    const own = Reflect.ownKeys(value);
    if (own.length !== keys.length || keys.some((key) => !own.includes(key))) {
      throw new TypeError(`${label} has missing or extra keys.`);
    }
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
        throw new TypeError(`${label} must contain enumerable data, not accessors.`);
      }
    }
  }

  function array(value, maximum, label) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
        || value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1) {
      throw new TypeError(`${label} must be a bounded, undecorated array.`);
    }
    for (let i = 0; i < value.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
        throw new TypeError(`${label} cannot be sparse or contain accessors.`);
      }
    }
  }

  function integer(value, minimum, maximum, label) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new TypeError(`${label} must be an integer in ${minimum}..${maximum}.`);
    }
  }

  function checkConfig(config) {
    record(config, ['fixture', 'prediction'], 'Config');
    if (typeof config.fixture !== 'string' || !Object.hasOwn(FIXTURES, config.fixture)) {
      throw new TypeError('Config fixture is unsupported.');
    }
    if (config.prediction !== 'HOLD' && config.prediction !== 'ADMIT') {
      throw new TypeError('Config prediction must be HOLD or ADMIT.');
    }
  }

  function sameConfig(left, right) {
    return left.fixture === right.fixture && left.prediction === right.prediction;
  }

  function canonical(actual, expected, label) {
    if (Array.isArray(expected)) {
      array(actual, expected.length, label);
      if (actual.length !== expected.length) throw new TypeError(`${label} length is forged.`);
      expected.forEach((value, i) => canonical(actual[i], value, label));
    } else if (expected !== null && typeof expected === 'object') {
      record(actual, Object.keys(expected), label);
      for (const key of Object.keys(expected)) canonical(actual[key], expected[key], label);
    } else if (!Object.is(actual, expected)) {
      throw new TypeError(`${label} does not match the canonical synthetic result.`);
    }
  }

  function createSession() {
    return {
      schemaVersion: 1,
      revision: 0,
      config: { ...DEFAULT },
      history: [],
    };
  }

  function evaluate(config) {
    checkConfig(config);
    const response = copy(FIXTURES[config.fixture]);
    const status = response.status === 200 ? 'SUCCESS' : 'FAILURE';
    let business = 'UNKNOWN';
    if (status === 'SUCCESS' && response.body !== null) {
      business = response.body.ready === true
        && response.body.candidate === 'candidate-v2'
        && response.body.profileId === 'training-profile' ? 'SUCCESS' : 'FAILURE';
    }
    const checks = { status, business };
    const counts = { success: 0, failure: 0, unknown: 0 };
    for (const value of Object.values(checks)) counts[value.toLowerCase()]++;
    const readiness = counts.failure ? 'FAILURE' : counts.unknown ? 'UNKNOWN' : 'SUCCESS';
    const decision = readiness === 'SUCCESS' ? 'ADMIT' : 'HOLD';
    return {
      fixture: config.fixture,
      response,
      checks,
      counts,
      readiness,
      decision,
      prediction: config.prediction,
      verifier: config.prediction === decision ? 'PASS' : 'FAIL',
      trace: [
        `Synthetic fixture ${config.fixture}; no HTTP request was made.`,
        `Original status ${response.status}; redirects are not followed${response.location ? ` (Location ${response.location})` : ''}.`,
        `Strict status assertion: ${status}; only original status 200 is accepted.`,
        `Business assertion: ${business}; ${status !== 'SUCCESS' ? 'not evaluated after rejected status' : response.body === null ? 'body unobserved, not successful' : 'ready=true AND candidate=candidate-v2 AND profileId=training-profile required'}.`,
        `${decision}: synthetic eligibility only; no promotion or user migration is performed.`,
      ],
      syntheticUsersMoved: 0,
      realJourneys: 'UNMEASURED',
    };
  }

  function validateSession(state) {
    record(state, ['schemaVersion', 'revision', 'config', 'history'], 'Session');
    if (state.schemaVersion !== 1) throw new TypeError('Session schemaVersion must be 1.');
    integer(state.revision, 0, LIMITS.revisions, 'Session revision');
    checkConfig(state.config);
    if (state.revision === 0 && !sameConfig(state.config, DEFAULT)) {
      throw new TypeError('Session config contradicts revision zero.');
    }
    array(state.history, LIMITS.runs, 'Session history');
    let previousRevision = -1;
    let previousConfig;
    state.history.forEach((row, i) => {
      record(row, ['run', 'revision', 'config', 'result'], 'History row');
      if (row.run !== i + 1) throw new TypeError('History run identity is not sequential.');
      integer(row.revision, 0, state.revision, 'History revision');
      checkConfig(row.config);
      if (row.revision < previousRevision
          || (row.revision === previousRevision && !sameConfig(row.config, previousConfig))
          || (row.revision === 0 && !sameConfig(row.config, DEFAULT))
          || (row.revision === state.revision && !sameConfig(row.config, state.config))) {
        throw new TypeError('History revision/config is inconsistent.');
      }
      canonical(row.result, evaluate(row.config), 'History result');
      previousRevision = row.revision;
      previousConfig = row.config;
    });
    return true;
  }

  function configure(state, config) {
    validateSession(state);
    checkConfig(config);
    const changed = !sameConfig(state.config, config);
    if (changed && state.revision === LIMITS.revisions) {
      throw new RangeError('Configuration revision limit 32 reached; reset to continue.');
    }
    return {
      ...copy(state),
      revision: state.revision + (changed ? 1 : 0),
      config: { ...config },
    };
  }

  function conduct(state) {
    validateSession(state);
    if (state.history.length === LIMITS.runs) {
      throw new RangeError('Run limit eight (8) reached; reset to continue. No history was evicted.');
    }
    const next = copy(state);
    next.history.push({
      run: next.history.length + 1,
      revision: next.revision,
      config: { ...next.config },
      result: evaluate(next.config),
    });
    return next;
  }
  return Object.freeze({ LIMITS, createSession, evaluate, configure, conduct, validateSession });
}));
