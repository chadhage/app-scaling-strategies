(function (root, factory) {
  'use strict';
  const lesson = factory();
  if (typeof module === 'object' && module.exports) module.exports = lesson;
  else root.S023Lesson = lesson;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const DEFAULTS = Object.freeze({
    mode: 'shallow', fixture: 'transaction-rejected', budgetMs: 150, isolated: true
  });
  const MAX_RUNS = 6;
  const MODES = Object.freeze(['shallow', 'representative']);
  const FIXTURES = Object.freeze([
    'healthy', 'login-denied', 'read-wrong-owner', 'transaction-rejected', 'transaction-unobserved'
  ]);
  const CONFIG_KEYS = ['mode', 'fixture', 'budgetMs', 'isolated'];
  const RESULT_KEYS = ['id', 'config', 'endpoint', 'outcome', 'ready', 'reason', 'steps', 'metrics', 'effects'];

  function reject(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function exactRecord(value, keys, code) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      reject(code, `${code}: expected a plain record.`);
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== keys.length || ownKeys.some(key => !keys.includes(key))) {
      reject(code, `${code}: unexpected or missing fields.`);
    }
    for (const key of keys) {
      const property = Object.getOwnPropertyDescriptor(value, key);
      if (!property || !Object.hasOwn(property, 'value') || !property.enumerable) {
        reject(code, `${code}: accessor and hidden fields are not supported.`);
      }
    }
  }

  function denseArray(value, code) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
        || Reflect.ownKeys(value).length !== value.length + 1) {
      reject(code, `${code}: expected a dense array without extra fields.`);
    }
    for (let index = 0; index < value.length; index++) {
      const property = Object.getOwnPropertyDescriptor(value, String(index));
      if (!property || !Object.hasOwn(property, 'value') || !property.enumerable) {
        reject(code, `${code}: sparse arrays and accessors are not supported.`);
      }
    }
  }

  function configRecord(value, code = 'INPUT') {
    exactRecord(value, CONFIG_KEYS, code);
    if (!MODES.includes(value.mode)) reject(code, `${code}: choose shallow or representative check.`);
    if (!FIXTURES.includes(value.fixture)) reject(code, `${code}: choose a declared fixture-v1 condition.`);
    if (!Number.isSafeInteger(value.budgetMs) || value.budgetMs < 50 || value.budgetMs > 500) {
      reject(code, `${code}: journey budget must be a whole number from 50 to 500 ms.`);
    }
    if (typeof value.isolated !== 'boolean') reject(code, `${code}: isolation must be a boolean.`);
    return { mode: value.mode, fixture: value.fixture, budgetMs: value.budgetMs, isolated: value.isolated };
  }

  function freeze(value) {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }

  function notRun(name, detail) {
    return { name, observation: 'not-run', status: null, durationMs: null, detail };
  }

  function observation(config, id) {
    const steps = ['login', 'read', 'transaction'].map(name => notRun(name, 'Business path not exercised.'));
    const result = {
      id, config,
      endpoint: { status: 200, durationMs: 10, observation: 'success' },
      outcome: 'unknown', ready: false,
      reason: 'Shallow HTTP 200 is not login, owned-profile read or transaction evidence. Readiness is unknown.',
      steps,
      metrics: { passed: 0, failed: 0, unmeasured: 3, journeyMs: null },
      effects: { fixtureCommits: 0, externalWrites: 0, receipt: null }
    };

    if (!config.isolated) {
      result.endpoint = { status: null, durationMs: null, observation: 'not-run' };
      result.outcome = 'failure';
      result.reason = 'Isolation guard failed before execution. No endpoint, login, read or transaction ran.';
      for (const step of steps) step.detail = 'Not run: isolated fixtures are required.';
      return result;
    }
    if (config.mode === 'shallow') return result;

    steps[0] = {
      name: 'login', observation: config.fixture === 'login-denied' ? 'failure' : 'success',
      status: config.fixture === 'login-denied' ? 403 : 200, durationMs: 15,
      detail: config.fixture === 'login-denied'
        ? 'Fixture login denied; required identity assertion failed.'
        : 'Fixture-only identity fixture-user authenticated; no real token or account.'
    };
    if (steps[0].observation === 'success') {
      steps[1] = {
        name: 'read', observation: config.fixture === 'read-wrong-owner' ? 'failure' : 'success',
        status: 200, durationMs: 25,
        detail: config.fixture === 'read-wrong-owner'
          ? 'HTTP 200 but profile owner fixture-other does not match fixture-user.'
          : 'Profile fixture-profile belongs to fixture-user; required owner assertion passed.'
      };
    } else {
      steps[1].detail = 'Not run after failed login.';
      steps[2].detail = 'Not run after failed login.';
    }

    if (steps[1].observation === 'success') {
      if (config.fixture === 'transaction-unobserved') {
        steps[2] = {
          name: 'transaction', observation: 'unknown', status: null, durationMs: null,
          detail: 'Fixture receipt and timing were not observed; commit count is unknown, not zero.'
        };
        result.effects.fixtureCommits = null;
      } else if (config.fixture === 'transaction-rejected') {
        steps[2] = {
          name: 'transaction', observation: 'failure', status: 409, durationMs: 60,
          detail: 'Fixture transaction rejected; no receipt or fixture ledger commit.'
        };
      } else {
        const receipt = `fixture-v1-run-${id}`;
        steps[2] = {
          name: 'transaction', observation: 'success', status: 200, durationMs: 60,
          detail: `Isolated receipt ${receipt} matches the fixture-only ledger marker.`
        };
        result.effects = { fixtureCommits: 1, externalWrites: 0, receipt };
      }
    } else if (steps[0].observation === 'success') {
      steps[2].detail = 'Not run after failed profile owner assertion.';
    }

    const passed = steps.filter(step => step.observation === 'success').length;
    const failed = steps.filter(step => step.observation === 'failure').length;
    const unmeasured = 3 - passed - failed;
    const journeyMs = steps.every(step => step.durationMs !== null)
      ? steps.reduce((total, step) => total + step.durationMs, 0) : null;
    result.metrics = { passed, failed, unmeasured, journeyMs };
    if (failed > 0) {
      result.outcome = 'failure';
      result.reason = `Required business assertion failed: ${steps.find(step => step.observation === 'failure').detail}`;
    } else if (journeyMs !== null && journeyMs > config.budgetMs) {
      result.outcome = 'failure';
      result.reason = `Journey budget failed: ${journeyMs} ms exceeds ${config.budgetMs} ms despite passing business assertions.`;
    } else if (unmeasured > 0) {
      result.reason = 'Transaction evidence is unobserved. Readiness and fixture commit count remain unknown.';
    } else {
      result.outcome = 'success';
      result.ready = true;
      result.reason = 'All three isolated business assertions and the synthetic journey budget passed. Rehearsal only; no user transition was measured.';
    }
    return result;
  }

  function identical(actual, expected) {
    if (!expected || typeof expected !== 'object') {
      if (!Object.is(actual, expected)) reject('STATE', 'STATE: retained observation was altered.');
      return;
    }
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual) || actual.length !== expected.length) {
        reject('STATE', 'STATE: retained trace length is invalid.');
      }
      denseArray(actual, 'STATE');
      expected.forEach((value, index) => identical(actual[index], value));
    } else {
      exactRecord(actual, Object.keys(expected), 'STATE');
      for (const key of Object.keys(expected)) identical(actual[key], expected[key]);
    }
  }

  function historyRecord(session) {
    exactRecord(session, ['version', 'history'], 'STATE');
    if (session.version !== 1) reject('STATE', 'STATE: unsupported session version.');
    if (!Array.isArray(session.history) || session.history.length > MAX_RUNS) {
      reject('STATE', 'STATE: history must contain at most six observations.');
    }
    denseArray(session.history, 'STATE');
    return session.history.map((entry, index) => {
      exactRecord(entry, RESULT_KEYS, 'STATE');
      const expected = observation(configRecord(entry.config, 'STATE'), index + 1);
      identical(entry, expected);
      return expected;
    });
  }

  function createSession() {
    return freeze({ version: 1, history: [] });
  }

  function evaluate(config, id = 1) {
    const checked = configRecord(config);
    if (!Number.isSafeInteger(id) || id < 1 || id > MAX_RUNS) {
      reject('STATE', 'STATE: observation ID must be an integer from 1 to 6.');
    }
    return freeze(observation(checked, id));
  }

  function run(session, config) {
    const history = historyRecord(session);
    const checked = configRecord(config);
    if (history.length === MAX_RUNS) {
      reject('HISTORY_FULL', 'History is full (6/6). Reset lesson to start a new isolated rehearsal; no observations were discarded.');
    }
    return freeze({ version: 1, history: [...history, observation(checked, history.length + 1)] });
  }

  return Object.freeze({ DEFAULTS, MAX_RUNS, MODES, FIXTURES, createSession, evaluate, run });
}));
