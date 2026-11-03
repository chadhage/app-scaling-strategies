(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S036Lesson = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const MAX_RUNS = 6;
  const DEFAULTS = Object.freeze({
    configuration: 'compatible', token: 'valid-prior', observation: 'observed'
  });
  const choices = Object.freeze({
    configuration: Object.freeze(['compatible', 'retired-key', 'changed-application']),
    token: Object.freeze(['valid-prior', 'forged', 'missing-cookie', 'foreign-pair']),
    observation: Object.freeze(['observed', 'missing'])
  });
  const checkNames = Object.freeze(['oldKeyReadable', 'application', 'requestIntegrity', 'cookieBinding']);
  function exactObject(value, keys, label) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      throw new TypeError(`${label} must be a plain record.`);
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== keys.length || ownKeys.some((key) => !keys.includes(key))) {
      throw new TypeError(`${label} has missing or unexpected fields.`);
    }
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError(`${label}.${key} must be an enumerable data field.`);
      }
    }
  }
  function exactArray(value, length, label) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
        || value.length !== length || Reflect.ownKeys(value).length !== length + 1) {
      throw new TypeError(`${label} must be a dense, bounded array without extra fields.`);
    }
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError(`${label} must contain only dense data entries.`);
      }
    }
  }
  function matches(actual, expected, label) {
    if (Array.isArray(expected)) {
      exactArray(actual, expected.length, label);
      expected.forEach((value, index) => matches(actual[index], value, `${label}[${index}]`));
    } else if (expected && typeof expected === 'object') {
      const keys = Object.keys(expected);
      exactObject(actual, keys, label);
      keys.forEach((key) => matches(actual[key], expected[key], `${label}.${key}`));
    } else if (actual !== expected) {
      throw new TypeError(`${label} does not match the deterministic fixture.`);
    }
  }
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function configCopy(config) {
    exactObject(config, Object.keys(choices), 'Configuration');
    for (const key of Object.keys(choices)) {
      if (!choices[key].includes(config[key])) throw new TypeError(`Invalid ${key} choice.`);
    }
    return { configuration: config.configuration, token: config.token, observation: config.observation };
  }
  function policyDescription(configuration) {
    if (configuration === 'retired-key') return 'old fixture key is unavailable; application A is unchanged';
    if (configuration === 'changed-application') return 'old fixture key is retained; application boundary changed to B';
    return 'old fixture key is retained and application A is unchanged';
  }
  function openingTrace(config) {
    return [
      'v1 rendered the old form with synthetic request/cookie pair A, fixture key OLD and application A.',
      `Route v1 -> v2; ${policyDescription(config.configuration)}. All four validation checks remain required.`
    ];
  }
  function makeRecord(config, id) {
    const observed = config.observation === 'observed';
    const checkValues = {
      oldKeyReadable: config.configuration !== 'retired-key',
      application: config.configuration !== 'changed-application',
      requestIntegrity: config.token !== 'forged',
      cookieBinding: !['missing-cookie', 'foreign-pair'].includes(config.token)
    };
    const accepted = Object.values(checkValues).every(Boolean);
    const invalid = config.token !== 'valid-prior';
    const result = {
      status: !observed ? 'unknown' : accepted || invalid ? 'success' : 'failure',
      submission: !observed ? 'unknown' : accepted ? 'accepted' : 'rejected',
      httpStatus: !observed ? null : accepted ? 200 : 400,
      continuity: !observed ? 'unknown' : invalid ? 'not-tested' : accepted ? 'preserved' : 'interrupted',
      checks: Object.fromEntries(checkNames.map((name) => [
        name, !observed ? 'unknown' : checkValues[name] ? 'pass' : 'fail'
      ])),
      failedChecks: observed ? checkNames.filter((name) => !checkValues[name]) : [],
      metrics: {
        accepted: observed ? Number(accepted) : null,
        rejected: observed ? Number(!accepted) : null,
        unknown: Number(!observed),
        effects: observed ? Number(accepted) : null
      }
    };
    const decision = !observed
      ? 'No submission observation: validation, HTTP status and synthetic effects UNKNOWN.'
      : `v2 ${result.submission.toUpperCase()} ${config.token}; synthetic HTTP ${result.httpStatus}; failed checks: ${result.failedChecks.join(', ') || 'none'}; effects ${result.metrics.effects}; valid-prior continuity ${result.continuity}.`;
    return freeze({
      id, config: configCopy(config), result,
      trace: [...openingTrace(config), decision]
    });
  }
  function assertState(state) {
    exactObject(state, ['phase', 'current', 'history'], 'State');
    if (!['empty', 'old-page', 'cutover', 'complete'].includes(state.phase)) {
      throw new TypeError('Invalid phase.');
    }
    if (!Array.isArray(state.history) || state.history.length > MAX_RUNS) {
      throw new RangeError(`History is limited to ${MAX_RUNS} completed rehearsals.`);
    }
    exactArray(state.history, state.history.length, 'History');
    state.history.forEach((record, index) => {
      exactObject(record, ['id', 'config', 'result', 'trace'], 'History record');
      matches(record, makeRecord(configCopy(record.config), index + 1), `History[${index}]`);
    });
    if (state.phase === 'empty') {
      if (state.current !== null) throw new TypeError('An empty rehearsal cannot have an active form.');
      return;
    }
    exactObject(state.current, ['id', 'config', 'trace'], 'Current rehearsal');
    configCopy(state.current.config);
    const completed = state.phase === 'complete';
    const expectedId = state.history.length + Number(!completed);
    if (state.current.id !== expectedId || (completed && state.history.length === 0)
        || (!completed && state.history.length === MAX_RUNS)) {
      throw new TypeError('Current rehearsal identity does not match history.');
    }
    if (completed) matches(state.current.config, state.history.at(-1).config, 'Completed configuration');
    const expectedTrace = completed ? state.history.at(-1).trace
      : openingTrace(state.current.config).slice(0, state.phase === 'old-page' ? 1 : 2);
    matches(state.current.trace, expectedTrace, 'Current trace');
  }
  function historyCopy(history) {
    return history.map((record) => makeRecord(record.config, record.id));
  }
  function requirePhase(state, phase, action) {
    assertState(state);
    if (state.phase !== phase) throw new RangeError(`${action} requires phase ${phase}; current phase is ${state.phase}.`);
  }
  function createState() {
    return freeze({ phase: 'empty', current: null, history: [] });
  }
  function loadForm(state, config) {
    requirePhase(state, 'empty', 'Load old form');
    const safeConfig = configCopy(config);
    if (state.history.length === MAX_RUNS) throw new RangeError('Six completed rehearsals retained. Reload to clear page memory.');
    return freeze({
      phase: 'old-page', current: {
        id: state.history.length + 1, config: safeConfig, trace: openingTrace(safeConfig).slice(0, 1)
      },
      history: historyCopy(state.history)
    });
  }
  function cutOver(state) {
    requirePhase(state, 'old-page', 'Cut over');
    return freeze({
      phase: 'cutover', current: {
        id: state.current.id, config: configCopy(state.current.config), trace: openingTrace(state.current.config)
      },
      history: historyCopy(state.history)
    });
  }
  function submit(state) {
    requirePhase(state, 'cutover', 'Submit old form');
    const record = makeRecord(state.current.config, state.current.id);
    return freeze({
      phase: 'complete', current: { id: record.id, config: configCopy(record.config), trace: [...record.trace] },
      history: [...historyCopy(state.history), record]
    });
  }
  function resetCurrent(state) {
    assertState(state);
    return freeze({ phase: 'empty', current: null, history: historyCopy(state.history) });
  }
  function currentTrace(state) {
    assertState(state);
    if (state.phase === 'empty') return Object.freeze([]);
    return Object.freeze([...state.current.trace]);
  }
  return Object.freeze({
    BANNER, MAX_RUNS, DEFAULTS, createState, loadForm, cutOver, submit, resetCurrent, currentTrace
  });
}));
