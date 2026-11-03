(function (root, factory) {
  'use strict';
  const fixtures = typeof module === 'object' && module.exports
    ? require('./fixtures.js') : root.CachePayloadFixtures;
  const model = factory(fixtures);
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.CachePayloadLesson = model;
}(typeof globalThis === 'object' ? globalThis : this, function (fixtures) {
  'use strict';
  const DEFAULTS = Object.freeze({
    layout: 'shared', translation: 'none', payload: 'equivalent', observation: 'complete',
  });
  const OPTIONS = Object.freeze({
    layout: Object.freeze(['shared', 'versioned']),
    translation: Object.freeze(['none', 'lossless']),
    payload: Object.freeze(['equivalent', 'malformed', 'wrong-total']),
    observation: Object.freeze(['complete', 'partial', 'none']),
  });
  const HISTORY_LIMIT = 6;
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  function configuration(input) {
    if (input === null || typeof input !== 'object'
        || Object.getPrototypeOf(input) !== Object.prototype) {
      throw new Error('Configuration: expected an exact plain own-data record.');
    }
    const keys = Reflect.ownKeys(input);
    if (keys.length !== 4 || keys.some((key) => typeof key !== 'string'
        || !Object.hasOwn(OPTIONS, key))) {
      throw new Error('Configuration: exactly layout, translation, payload and observation are required.');
    }
    const checked = {};
    for (const key of Object.keys(OPTIONS)) {
      const field = Object.getOwnPropertyDescriptor(input, key);
      const label = key[0].toUpperCase() + key.slice(1);
      if (!field || !Object.hasOwn(field, 'value') || !field.enumerable
          || typeof field.value !== 'string' || !OPTIONS[key].includes(field.value)) {
        throw new Error(`${label}: choose one of ${OPTIONS[key].join(', ')}; no coercion or accessors.`);
      }
      checked[key] = field.value;
    }
    return checked;
  }
  function decode(payload) {
    const minor = payload.schema === 1 ? payload.totalCents : payload.money?.minor;
    const currency = payload.schema === 1 ? payload.currency : payload.money?.currency;
    if (![1, 2].includes(payload.schema) || typeof payload.itemId !== 'string'
        || !Number.isSafeInteger(minor) || minor < 0
        || typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
      throw new Error('INVALID_PAYLOAD: schema requires an item ID, nonnegative safe integer minor units and a currency; strings are not coerced.');
    }
    return { itemId: payload.itemId, minor, currency };
  }
  function encode(reader, value) {
    return reader === 1
      ? { schema: 1, itemId: value.itemId, totalCents: value.minor, currency: value.currency }
      : { schema: 2, itemId: value.itemId, money: { minor: value.minor, currency: value.currency } };
  }
  function readPlan(config) {
    const key = 'cart:SYN-CART-055';
    const readers = [1, 2, 1, 2];
    return readers.map((reader, index) => {
      const writer = config.layout === 'versioned' ? reader : index < 2 ? 1 : 2;
      return {
        id: index + 1, reader, writer,
        key: config.layout === 'versioned' ? `v${reader}:${key}` : key,
        payload: writer === 1 ? fixtures.v1 : fixtures.v2[config.payload],
      };
    });
  }
  function evaluate(entry, config, observed) {
    const read = {
      id: entry.id, reader: entry.reader, writer: entry.writer, key: entry.key,
      status: 'unknown', code: 'UNOBSERVED', payload: null, deliveredPayload: null,
      value: null, translated: null, detail: 'No observation; selected fixtures are not evidence of this read.',
    };
    if (!observed) return read;
    read.payload = copy(entry.payload);
    read.translated = false;
    const crossSchema = read.payload.schema !== read.reader;
    if (crossSchema && config.translation === 'none') {
      read.status = 'failure';
      read.code = 'SCHEMA_MISMATCH';
      read.detail = `SCHEMA_MISMATCH: reader v${read.reader} cannot consume schema ${read.payload.schema}; use validated translation or a versioned namespace.`;
      return read;
    }
    try {
      const value = decode(read.payload);
      read.deliveredPayload = crossSchema ? encode(read.reader, value) : copy(read.payload);
      read.translated = crossSchema;
      read.value = decode(read.deliveredPayload);
    } catch (error) {
      read.status = 'failure';
      read.code = 'INVALID_PAYLOAD';
      read.detail = error.message;
      return read;
    }
    const correct = Object.keys(fixtures.expected)
      .every((field) => read.value[field] === fixtures.expected[field]);
    read.status = correct ? 'success' : 'failure';
    read.code = correct ? 'CORRECT' : 'VALUE_MISMATCH';
    read.detail = correct
      ? `${read.translated ? 'Validated translation' : 'Direct read'} preserves SYN-CART-055, USD and 1250 integer minor units.`
      : 'VALUE_MISMATCH: decoded object does not preserve SYN-CART-055, USD and exactly 1250 minor units; shape compatibility alone is insufficient.';
    return read;
  }
  function createLesson() {
    const initial = () => ({
      phase: 'idle', config: null, result: null, history: [], trace: [], prediction: null,
    });
    let state = initial();
    const snapshot = () => freeze(copy(state));
    const requirePhase = (expected, action) => {
      if (state.phase !== expected) {
        throw new Error(`${action} requires ${expected}; current phase is ${state.phase}.`);
      }
    };
    const prepare = (input) => {
      requirePhase('idle', 'Prepare');
      if (state.history.length >= HISTORY_LIMIT) {
        throw new Error('History full: six completed attempts retained; reset explicitly to clear them.');
      }
      const checked = configuration(input);
      state.config = checked;
      state.phase = 'prepared';
      state.trace = [
        `Attempt ${state.history.length + 1}: prepared two synthetic readers; layout ${checked.layout}, translation ${checked.translation}, payload ${checked.payload}, observation ${checked.observation}.`,
        checked.layout === 'shared'
          ? 'Synthetic write v1 -> shared cart key; both readers read. Synthetic write v2 overwrites that key; both readers read again.'
          : 'Both synthetic versioned keys are pre-populated. Each reader reads only its own namespace twice; this is not cache warming or synchronization proof.',
        'Expected invariant: SYN-CART-055, USD, exactly 1250 integer minor units. No cache service or network is contacted.',
      ];
      return snapshot();
    };
    const read = () => {
      requirePhase('prepared', 'Read');
      const observed = { complete: 4, partial: 2, none: 0 }[state.config.observation];
      const reads = readPlan(state.config)
        .map((entry, index) => evaluate(entry, state.config, index < observed));
      const metrics = {
        started: 4, observed,
        success: reads.filter((entry) => entry.status === 'success').length,
        failure: reads.filter((entry) => entry.status === 'failure').length,
        unknown: reads.filter((entry) => entry.status === 'unknown').length,
        translated: reads.filter((entry) => entry.translated === true).length,
      };
      const gate = metrics.failure ? 'FAIL' : metrics.unknown ? 'UNKNOWN' : 'PASS';
      state.result = {
        attempt: state.history.length + 1, metrics, reads, gate,
        impact: gate === 'PASS' ? 'UNINTERRUPTED' : gate === 'FAIL' ? 'INTERRUPTED' : 'UNKNOWN',
      };
      state.phase = 'complete';
      reads.forEach((entry) => state.trace.push(
        `Read ${entry.id}: reader v${entry.reader}, ${entry.key} -> ${entry.code}. ${entry.detail}`,
      ));
      state.trace.push(`Compatibility gate ${gate}; ${metrics.success} correct, ${metrics.failure} failed, ${metrics.unknown} unknown. No started read was dropped.`);
      state.history.push({
        attempt: state.result.attempt, config: copy(state.config), result: copy(state.result),
        prediction: null, trace: copy(state.trace),
      });
      return snapshot();
    };
    const predict = (prediction) => {
      requirePhase('complete', 'Prediction');
      if (state.prediction !== null) throw new Error('Prediction already checked for this attempt.');
      if (typeof prediction !== 'string' || !['PASS', 'FAIL', 'UNKNOWN'].includes(prediction)) {
        throw new Error('Prediction: choose PASS, FAIL or UNKNOWN.');
      }
      state.prediction = {
        selected: prediction, actual: state.result.gate,
        verdict: prediction === state.result.gate ? 'PASS' : 'FAIL',
      };
      state.trace.push(`Learner prediction ${prediction}: verifier ${state.prediction.verdict}; measured gate ${state.result.gate} is unchanged.`);
      const retained = state.history[state.history.length - 1];
      retained.prediction = copy(state.prediction);
      retained.trace = copy(state.trace);
      return snapshot();
    };
    const newAttempt = () => {
      requirePhase('complete', 'New attempt');
      state = { ...initial(), history: state.history };
      return snapshot();
    };
    const reset = () => {
      state = initial();
      return snapshot();
    };
    return Object.freeze({
      snapshot, prepare, read, predict, newAttempt, reset,
    });
  }
  return Object.freeze({ DEFAULTS, OPTIONS, HISTORY_LIMIT, createLesson });
}));
