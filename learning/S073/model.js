(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CacheOutageLesson = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const REQUIRED = freeze({
    id: 'synthetic-profile-073',
    revision: 7,
    label: 'Sample learner 073',
    preferences: { theme: 'dark' },
    savedItems: ['synthetic-item-1', 'synthetic-item-2'],
  });
  const DEFAULTS = freeze({ cache: 'lost', recovery: 'durable', durable: 'correct', budgetMs: 150 });
  const OPTIONS = freeze({
    cache: ['available', 'lost', 'unknown'],
    recovery: ['durable', 'empty', 'fail'],
    durable: ['correct', 'stale', 'wrong', 'empty', 'unavailable', 'unknown'],
    budgetMs: [80, 110, 150],
  });
  const CLASSIFICATIONS = freeze(['SUCCESS', 'FAILURE', 'UNKNOWN']);
  const MAX_HISTORY = 6;
  const states = new WeakSet();
  function fault(message, field) {
    const error = new RangeError(message);
    error.field = field;
    throw error;
  }
  function validateConfig(config) {
    if (!config || typeof config !== 'object'
      || ![Object.prototype, null].includes(Object.getPrototypeOf(config))
      || Reflect.ownKeys(config).length !== 4
      || Object.keys(OPTIONS).some((key) => !Object.hasOwn(config, key))) {
      fault('Use exactly the four declared synthetic controls.', 'cache');
    }
    for (const [key, choices] of Object.entries(OPTIONS)) {
      const property = Object.getOwnPropertyDescriptor(config, key);
      if (!property || !Object.hasOwn(property, 'value') || !choices.includes(property.value)) {
        fault(`Choose a supported ${key === 'budgetMs' ? 'budget' : key} value.`, key === 'budgetMs' ? 'budget' : key);
      }
    }
    return freeze({ cache: config.cache, recovery: config.recovery, durable: config.durable, budgetMs: config.budgetMs });
  }
  function evaluate(input) {
    const config = validateConfig(input);
    const trace = [];
    let profile = null;
    let valid = null;
    let elapsedMs = null;
    let classification = 'UNKNOWN';
    let reason = 'CACHE_OBSERVATION_UNKNOWN';
    let detail = 'Cache access was not observed. No fallback or returned profile is invented.';
    const event = (source, elapsed, message) => trace.push({ source, elapsedMs: elapsed, message });
    if (config.cache === 'unknown') {
      event('cache', null, 'No cache observation receipt; recovery cannot be inferred.');
    } else if (config.cache === 'available') {
      elapsedMs = 10;
      profile = REQUIRED;
      valid = true;
      classification = 'SUCCESS';
      reason = 'CACHE_PROFILE_VERIFIED';
      detail = 'The exact required synthetic profile was read from cache; no fallback was attempted.';
      event('cache', elapsedMs, 'Exact required profile returned. The recovery choice was not used.');
    } else {
      elapsedMs = 20;
      event('cache', elapsedMs, 'Cache access lost; no cached profile returned.');
      if (config.recovery === 'empty') {
        profile = freeze({});
        valid = false;
        classification = 'FAILURE';
        reason = 'EMPTY_PROFILE';
        detail = 'An empty object is not the required profile, even when returned quickly.';
        event('empty substitute', elapsedMs, 'An empty object was substituted: required state is missing.');
      } else if (config.recovery === 'fail') {
        classification = 'FAILURE';
        reason = 'EXPLICIT_FAILURE';
        detail = 'An explicit unavailable result is honest failure, not uninterrupted recovery.';
        event('explicit failure', elapsedMs, 'Operation failed explicitly. No synthetic profile was fabricated.');
      } else {
        elapsedMs += 90;
        const receipts = {
          correct: [REQUIRED, true, 'SUCCESS', 'DURABLE_PROFILE_VERIFIED', 'The durable receipt preserves every required synthetic field.'],
          stale: [freeze({ ...REQUIRED, revision: 6 }), false, 'FAILURE', 'STALE_PROFILE', 'Revision 6 is stale; revision 7 is required.'],
          wrong: [freeze({ ...REQUIRED, id: 'synthetic-other-073' }), false, 'FAILURE', 'WRONG_PROFILE', 'The receipt belongs to a different synthetic profile.'],
          empty: [freeze({}), false, 'FAILURE', 'EMPTY_PROFILE', 'The durable receipt is empty; required state is missing.'],
          unavailable: [null, false, 'FAILURE', 'DURABLE_UNAVAILABLE', 'The durable path explicitly failed to return required state.'],
          unknown: [null, null, 'UNKNOWN', 'DURABLE_RECEIPT_UNKNOWN', 'The returned-profile receipt is missing. Recovery remains unverified.'],
        };
        [profile, valid, classification, reason, detail] = receipts[config.durable];
        event('durable recovery', elapsedMs, detail);
      }
    }
    // A known missed budget is failure even if the returned-state receipt is unknown.
    if (elapsedMs !== null && elapsedMs > config.budgetMs) {
      classification = 'FAILURE';
      reason = 'BUDGET_EXCEEDED';
      detail = `Measured ${elapsedMs} synthetic ms exceeds the ${config.budgetMs} ms budget. State validity: ${valid === null ? 'unknown' : valid}.`;
    }
    event('assertion', elapsedMs, `${classification}: ${reason}. ${detail}`);
    return freeze({
      classification, reason, detail, elapsedMs, budgetMs: config.budgetMs,
      profile, requiredStateValid: valid, trace,
    });
  }
  function mint(value) {
    freeze(value);
    states.add(value);
    return value;
  }
  function guard(state, phase) {
    if (!states.has(state)) throw new TypeError('Use the current lesson state, not a forged or serialized state.');
    if (phase && state.phase !== phase) fault(`This action requires the ${phase} phase.`, 'phase');
  }
  function create() {
    return mint({ phase: 'configuring', config: DEFAULTS, current: null, history: [] });
  }
  function configure(state, input) {
    guard(state, 'configuring');
    return mint({ ...state, config: validateConfig(input) });
  }
  function run(state) {
    guard(state, 'configuring');
    if (state.history.length >= MAX_HISTORY) fault('Six attempts are retained. Reset explicitly before another run.', 'phase');
    const current = {
      attempt: state.history.length + 1, config: state.config, result: evaluate(state.config),
      prediction: null, predictionCorrect: null,
    };
    return mint({ ...state, phase: 'observed', current, history: [...state.history, current] });
  }
  function check(state, prediction) {
    guard(state, 'observed');
    if (!CLASSIFICATIONS.includes(prediction)) fault('Choose SUCCESS, FAILURE or UNKNOWN before checking.', 'prediction');
    const current = {
      ...state.current, prediction,
      predictionCorrect: prediction === state.current.result.classification,
    };
    return mint({ ...state, phase: 'checked', current, history: [...state.history.slice(0, -1), current] });
  }
  function next(state) {
    guard(state, 'checked');
    if (state.history.length >= MAX_HISTORY) fault('Six attempts are retained. Reset explicitly before another run.', 'phase');
    return mint({ phase: 'configuring', config: DEFAULTS, current: null, history: state.history });
  }
  function reset(state) {
    guard(state);
    return create();
  }
  function summary(state) {
    guard(state);
    const counts = { total: state.history.length, SUCCESS: 0, FAILURE: 0, UNKNOWN: 0 };
    state.history.forEach((entry) => { counts[entry.result.classification] += 1; });
    return freeze(counts);
  }
  return freeze({ REQUIRED, DEFAULTS, OPTIONS, CLASSIFICATIONS, MAX_HISTORY, evaluate, validateConfig, create, configure, run, check, next, reset, summary });
}));
