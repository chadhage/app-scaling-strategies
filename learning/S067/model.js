(function (root, factory) {
  'use strict';
  const fixture = typeof module === 'object' && module.exports
    ? require('./fixture.js') : root.S067Fixture;
  const model = factory(fixture);
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.S067Model = model;
}(typeof globalThis === 'object' ? globalThis : this, function (fixture) {
  'use strict';
  const states = new WeakSet();
  const fields = Object.keys(fixture.defaults);

  class GuardError extends Error {
    constructor(code, message, field = null) {
      super(message);
      this.name = 'GuardError';
      this.code = code;
      this.field = field;
    }
  }

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }

  function seal(value) {
    freeze(value);
    states.add(value);
    return value;
  }

  function requireState(state, phase) {
    if (!state || typeof state !== 'object' || !states.has(state)) {
      throw new GuardError('UNTRUSTED_STATE', 'Use a state created by this rehearsal.');
    }
    if (state.phase !== phase) {
      throw new GuardError('INVALID_PHASE', `Action requires phase ${phase}; current phase is ${state.phase}.`);
    }
  }

  function configuration(input) {
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype
        || Reflect.ownKeys(input).length !== fields.length
        || fields.some((field) => !Object.hasOwn(input, field))) {
      throw new GuardError('INVALID_CONFIG', 'Choose exactly the four declared fixture inputs.');
    }
    const config = {};
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(input, field);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
        throw new GuardError('INVALID_INPUT', 'Fixture inputs must be literal values.', field);
      }
      const value = descriptor.value;
      const choices = field === 'lag' ? Object.keys(fixture.lagTicks)
        : field === 'freshness' ? Object.keys(fixture.freshnessTicks)
          : field === 'routing' ? fixture.routes : fixture.coverage;
      if (typeof value !== 'string' || !choices.includes(value)) {
        throw new GuardError('INVALID_INPUT', `Choose a listed ${field} option.`, field);
      }
      config[field] = value;
    }
    return freeze(config);
  }

  function fresh(history = []) {
    return seal({
      phase: 'configuring', attempt: history.length + 1, config: null,
      lagObservation: null, result: null, prediction: null, trace: [], history,
    });
  }

  function initial() { return fresh(); }

  function introduceLag(state, input) {
    requireState(state, 'configuring');
    const config = configuration(input);
    const lagTicks = fixture.lagTicks[config.lag];
    const readerTick = lagTicks === null ? null : fixture.primaryTick - lagTicks;
    const lagObservation = {
      primaryTick: fixture.primaryTick, primaryVersion: fixture.primaryVersion,
      readerTick, readerVersion: readerTick, lagTicks,
      budgetTicks: fixture.freshnessTicks[config.freshness],
    };
    return seal({
      ...state, phase: 'lagged', config, lagObservation,
      trace: [
        `Declare maximum staleness ${lagObservation.budgetTicks} synthetic ticks for ${fixture.record}.`,
        `Primary remains version ${fixture.primaryVersion} at tick ${fixture.primaryTick}; topology stays one primary and one reader.`,
        readerTick === null
          ? 'Introduce reader fixture with unknown watermark and unknown lag. No synchronization is inferred.'
          : `Introduce reader watermark ${readerTick} at tick ${readerTick}; observed lag ${lagTicks} synthetic ticks.`,
      ],
    });
  }

  function read(state) {
    requireState(state, 'lagged');
    const { config, lagObservation: lag } = state;
    const requiredVersion = fixture.primaryVersion - lag.budgetTicks;
    const eligible = lag.readerVersion !== null && lag.readerVersion >= requiredVersion;
    const selectedReader = config.routing === 'gated' && !eligible ? 'primary' : 'reader-1';
    const routingReason = config.routing === 'reader-only'
      ? 'Operator chose reader-1 without a freshness gate.'
      : eligible ? 'Observed reader watermark meets the declared minimum.'
        : lag.readerVersion === null
          ? 'Reader watermark unknown; fall back to the known-current primary.'
          : 'Reader watermark below the declared minimum; fall back to primary.';
    // Missing read evidence must not inherit the planned route's known watermark.
    const receivedVersion = config.coverage === 'missing' ? null
      : selectedReader === 'primary' ? fixture.primaryVersion : lag.readerVersion;
    const observedLagTicks = receivedVersion === null ? null : fixture.primaryVersion - receivedVersion;
    const gate = receivedVersion === null ? 'UNKNOWN'
      : receivedVersion >= requiredVersion ? 'PASS' : 'FAIL';
    const code = config.coverage === 'missing' ? 'READ_OBSERVATION_MISSING'
      : receivedVersion === null ? 'READER_WATERMARK_UNKNOWN'
        : gate === 'PASS' ? 'FRESH_ENOUGH' : 'STALE_READ';
    const result = {
      gate, impact: gate === 'PASS' ? 'CONTRACT_MET' : gate === 'FAIL' ? 'INTERRUPTED' : 'UNVERIFIED',
      code, selectedReader, routingReason, requiredVersion, receivedVersion,
      observedLagTicks, budgetTicks: lag.budgetTicks,
      correct: Number(gate === 'PASS'), failed: Number(gate === 'FAIL'), unknown: Number(gate === 'UNKNOWN'),
    };
    return seal({
      ...state, phase: 'observed', result,
      trace: [
        ...state.trace,
        `Select ${selectedReader}. ${routingReason}`,
        receivedVersion === null
          ? `${code}: no returned version can be certified; minimum required version ${requiredVersion}.`
          : `Receive version ${receivedVersion}; returned-data lag ${observedLagTicks} ticks; minimum required version ${requiredVersion}.`,
        `Freshness ${gate}; synthetic impact ${result.impact}. Reader fixture does not advance.`,
      ],
    });
  }

  function check(state, predicted) {
    requireState(state, 'observed');
    if (typeof predicted !== 'string' || !fixture.predictions.includes(predicted)) {
      throw new GuardError('INVALID_PREDICTION', 'Choose PASS, FAIL or UNKNOWN before checking.', 'prediction');
    }
    if (state.history.length >= fixture.maximumAttempts) {
      throw new GuardError('HISTORY_FULL', 'Six retained attempts reached; explicitly reset to clear history.');
    }
    const prediction = { predicted, matched: predicted === state.result.gate };
    const entry = {
      attempt: state.attempt, config: state.config, lagObservation: state.lagObservation,
      result: state.result, predicted, matched: prediction.matched,
    };
    return seal({
      ...state, phase: 'checked', prediction, history: [...state.history, entry],
      trace: [...state.trace,
        `Prediction ${prediction.matched ? 'matches' : 'does not match'}; actual ${state.result.gate} / ${state.result.impact} remains recorded.`],
    });
  }

  function next(state) {
    requireState(state, 'checked');
    if (state.history.length >= fixture.maximumAttempts) {
      throw new GuardError('HISTORY_FULL', 'Six retained attempts reached; explicitly reset to clear history.');
    }
    return fresh(state.history);
  }

  return Object.freeze({
    initial, introduceLag, read, check, next, reset: initial, configuration, GuardError,
  });
}));
