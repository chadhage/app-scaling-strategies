(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S035 = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const MAX_HISTORY = 6;
  const DEFAULTS = Object.freeze({
    storeMode: 'shared', callbackPath: 'compatible', callbackState: 'matching',
    observations: 'complete', budgetMs: 500, delayMs: 100, prediction: 'SUCCESS',
  });
  const CONFIG_KEYS = Object.keys(DEFAULTS);
  const ENUMS = {
    storeMode: ['shared', 'v1-only'],
    callbackPath: ['compatible', 'redirect-loop'],
    callbackState: ['matching', 'mismatch'],
    observations: ['complete', 'missing'],
    prediction: ['SUCCESS', 'FAILURE', 'UNKNOWN'],
  };
  function record(value, keys, label) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      throw new Error(`invalid ${label}: expected a plain record`);
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== keys.length || ownKeys.some((key) => !keys.includes(key))) {
      throw new Error(`invalid ${label}: exact fields required`);
    }
    const result = {};
    for (const key of keys) {
      const field = Object.getOwnPropertyDescriptor(value, key);
      if (!field || !Object.hasOwn(field, 'value') || !field.enumerable) {
        throw new Error(`invalid ${label}: enumerable data fields required`);
      }
      result[key] = field.value;
    }
    return result;
  }
  function array(value, maximum, label) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      throw new Error(`invalid ${label}: expected a dense array`);
    }
    const length = Object.getOwnPropertyDescriptor(value, 'length').value;
    if (!Number.isInteger(length) || length < 0 || length > maximum
        || Reflect.ownKeys(value).length !== length + 1) {
      throw new Error(`invalid ${label}: sparse, decorated or oversized array`);
    }
    const items = [];
    for (let index = 0; index < length; index++) {
      const field = Object.getOwnPropertyDescriptor(value, String(index));
      if (!field || !Object.hasOwn(field, 'value') || !field.enumerable) {
        throw new Error(`invalid ${label}: dense data entries required`);
      }
      items.push(field.value);
    }
    return items;
  }
  function equalShape(actual, expected, label) {
    if (expected === null || typeof expected !== 'object') {
      if (!Object.is(actual, expected)) throw new Error(`invalid ${label}: recomputation mismatch`);
    } else if (Array.isArray(expected)) {
      const values = array(actual, expected.length, label);
      if (values.length !== expected.length) throw new Error(`invalid ${label}: length mismatch`);
      expected.forEach((value, index) => equalShape(values[index], value, label));
    } else {
      const values = record(actual, Object.keys(expected), label);
      for (const key of Object.keys(expected)) equalShape(values[key], expected[key], label);
    }
  }
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function integer(value, minimum, maximum, label) {
    if (!Number.isInteger(value) || Object.is(value, -0) || value < minimum || value > maximum) {
      throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
    }
  }
  function validateConfig(input) {
    const config = record(input, CONFIG_KEYS, 'configuration');
    for (const [key, choices] of Object.entries(ENUMS)) {
      if (!choices.includes(config[key])) throw new Error(`invalid ${key}`);
    }
    integer(config.budgetMs, 100, 2000, 'budgetMs');
    integer(config.delayMs, 0, 1000, 'delayMs');
    return freeze(config);
  }
  function startTrace(config) {
    return [{
      atMs: 0, version: 'v1', path: '/login', event: 'login-start',
      detail: `Stored a synthetic correlation marker and /training/home return path in ${config.storeMode} state.`,
    }, {
      atMs: 40, version: 'v2', path: '/callback', event: 'cutover',
      detail: 'Callback routing now targets v2; the original login budget still starts at 0 ms.',
    }];
  }
  function evaluate(input, id = 1) {
    const config = validateConfig(input);
    integer(id, 1, MAX_HISTORY, 'run id');
    const trace = startTrace(config);
    const reasons = [];
    let callbackVersion = null;
    let elapsedMs = null;
    let loginCompleted = null;
    let correlationMatched = null;
    let returnPath = null;
    let redirectHops = null;
    let restartRequired = null;
    if (config.observations === 'missing') {
      reasons.push('CALLBACK_UNOBSERVED');
      trace.push({
        atMs: null, version: null, path: '/callback', event: 'callback-unobserved',
        detail: 'No callback observations: destination, completion and elapsed time remain unknown.',
      });
    } else {
      callbackVersion = 'v2';
      elapsedMs = 40 + config.delayMs;
      loginCompleted = false;
      redirectHops = 0;
      restartRequired = false;
      correlationMatched = config.storeMode === 'shared' && config.callbackState === 'matching';
      trace.push({
        atMs: elapsedMs, version: 'v2', path: '/callback', event: 'callback-arrived',
        detail: 'Synthetic callback arrives at v2 after the routing boundary.',
      });
      if (config.storeMode === 'v1-only') {
        reasons.push('STATE_LOST');
        restartRequired = true;
        trace.push({
          atMs: elapsedMs, version: 'v2', path: '/callback', event: 'state-lost',
          detail: 'v2 cannot find v1-local correlation or return state. A forced restart would be needed; none is executed.',
        });
      } else if (config.callbackState === 'mismatch') {
        reasons.push('STATE_MISMATCH');
        trace.push({
          atMs: elapsedMs, version: 'v2', path: '/callback', event: 'state-rejected',
          detail: 'Returned synthetic marker does not match; the callback is rejected, never bypassed.',
        });
      } else if (config.callbackPath === 'redirect-loop') {
        for (let hop = 1; hop <= 3; hop++) {
          elapsedMs += 20;
          redirectHops = hop;
          trace.push({
            atMs: elapsedMs, version: 'v2', path: hop % 2 ? '/login' : '/callback', event: 'redirect',
            detail: `Synthetic redirect hop ${hop} of 3; not a new successful login.`,
          });
        }
        reasons.push('REDIRECT_LOOP');
        trace.push({
          atMs: elapsedMs, version: 'v2', path: '/callback', event: 'loop-stopped',
          detail: 'Three-hop bound reached. Stop rather than retrying or resetting the original budget.',
        });
      } else {
        elapsedMs += 20;
        loginCompleted = true;
        returnPath = '/training/home';
        trace.push({
          atMs: elapsedMs, version: 'v2', path: returnPath, event: 'login-complete',
          detail: 'v2 completes the original synthetic login with matched correlation and the original return path.',
        });
      }
      if (elapsedMs > config.budgetMs) reasons.push('BUDGET_EXCEEDED');
    }
    const outcome = config.observations === 'missing' ? 'UNKNOWN' : reasons.length ? 'FAILURE' : 'SUCCESS';
    return freeze({
      id, config, outcome, reasons, callbackVersion, elapsedMs, loginCompleted,
      correlationMatched, returnPath, redirectHops, restartRequired, budgetMs: config.budgetMs,
      counts: {
        success: outcome === 'SUCCESS' ? 1 : 0,
        failure: outcome === 'FAILURE' ? 1 : 0,
        unknown: outcome === 'UNKNOWN' ? 1 : 0,
      },
      verifier: config.prediction === outcome ? 'PASS' : 'FAIL',
      trace,
    });
  }
  function validateState(input) {
    const state = record(input, ['active', 'history'], 'state');
    const history = array(state.history, MAX_HISTORY, 'state history').map((item, index) => {
      const fields = record(item, [
        'id', 'config', 'outcome', 'reasons', 'callbackVersion', 'elapsedMs', 'loginCompleted',
        'correlationMatched', 'returnPath', 'redirectHops', 'restartRequired', 'budgetMs', 'counts', 'verifier', 'trace',
      ], 'state history');
      let expected;
      try { expected = evaluate(fields.config, index + 1); }
      catch (error) { throw new Error(`invalid state history: ${error.message}`); }
      equalShape(item, expected, 'state history');
      return expected;
    });
    let active = null;
    if (state.active !== null) {
      const fields = record(state.active, ['id', 'stage', 'config'], 'state active');
      if (history.length >= MAX_HISTORY || fields.id !== history.length + 1
          || !['started', 'cutover'].includes(fields.stage)) {
        throw new Error('invalid state active identity or stage');
      }
      let config;
      try { config = validateConfig(fields.config); }
      catch (error) { throw new Error(`invalid state active: ${error.message}`); }
      active = { id: fields.id, stage: fields.stage, config };
    }
    return freeze({ active, history });
  }
  function createLesson() { return freeze({ active: null, history: [] }); }
  function startLogin(input, config) {
    const state = validateState(input);
    if (state.active) throw new Error('an active login must finish before starting another');
    if (state.history.length >= MAX_HISTORY) throw new Error('six runs retained; reset explicitly before another login');
    return freeze({
      history: state.history,
      active: { id: state.history.length + 1, stage: 'started', config: validateConfig(config) },
    });
  }
  function cutover(input) {
    const state = validateState(input);
    if (!state.active) throw new Error('start login before cutover');
    if (state.active.stage !== 'started') throw new Error('routing already cut over');
    return freeze({ history: state.history, active: { ...state.active, stage: 'cutover' } });
  }
  function deliverCallback(input) {
    const state = validateState(input);
    if (!state.active || state.active.stage !== 'cutover') throw new Error('cutover must happen before callback');
    return freeze({
      active: null,
      history: [...state.history, evaluate(state.active.config, state.active.id)],
    });
  }
  return Object.freeze({ MAX_HISTORY, DEFAULTS, validateConfig, createLesson, evaluate, startLogin, cutover, deliverCallback });
}));
