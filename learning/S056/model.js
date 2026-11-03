(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SchemaLesson = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const LIMIT = 8;
  const CHOICES = freeze({
    schema: ['additive', 'renamed', 'unit-drift'],
    oldReader: ['tolerant', 'strict'],
    checks: ['contracts-effects', 'shape-only', 'new-only'],
    observation: ['complete', 'withhold-old'],
  });
  const DEFAULTS = freeze({
    schema: 'additive', oldReader: 'tolerant',
    checks: 'contracts-effects', observation: 'complete',
  });
  const PAIRS = freeze([
    { producer: 'old', consumer: 'old' }, { producer: 'old', consumer: 'new' },
    { producer: 'new', consumer: 'old' }, { producer: 'new', consumer: 'new' },
  ]);
  const OUTCOMES = ['success', 'failure', 'unknown'];

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function invalid(kind, message) { throw new Error(`Invalid ${kind}: ${message}`); }
  function exact(value, keys, kind) {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype
        || Reflect.ownKeys(value).length !== keys.length
        || keys.some((key) => !Object.hasOwn(value, key)
          || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) {
      invalid(kind, `expected exactly ${keys.join(', ')}.`);
    }
  }
  function array(value, limit, kind) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
        || value.length > limit || Reflect.ownKeys(value).length !== value.length + 1
        || Reflect.ownKeys(value).some((key) => key !== 'length'
          && (typeof key !== 'string' || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')))
        || Array.from({ length: value.length }, (_, index) => index)
          .some((index) => !Object.hasOwn(value, index))) invalid(kind, 'invalid bounded dense array.');
  }
  function stable(value, ancestors = new Set(), depth = 0) {
    if (depth > 14) invalid('state', 'data nesting is too deep.');
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
    if (!value || typeof value !== 'object' || ancestors.has(value)) invalid('state', 'expected acyclic plain data.');
    ancestors.add(value);
    let result;
    if (Array.isArray(value)) {
      array(value, 8, 'state');
      result = `[${value.map((item) => stable(item, ancestors, depth + 1)).join(',')}]`;
    } else {
      if (Object.getPrototypeOf(value) !== Object.prototype) invalid('state', 'unexpected object prototype.');
      const keys = Reflect.ownKeys(value);
      if (keys.some((key) => typeof key !== 'string'
          || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) {
        invalid('state', 'accessors and symbol properties are unsupported.');
      }
      result = `{${keys.sort().map((key) => `${JSON.stringify(key)}:${stable(value[key], ancestors, depth + 1)}`).join(',')}}`;
    }
    ancestors.delete(value);
    return result;
  }
  function equal(left, right) { return stable(left) === stable(right); }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function configGuard(config) {
    exact(config, Object.keys(DEFAULTS), 'input');
    for (const [key, choices] of Object.entries(CHOICES)) {
      if (typeof config[key] !== 'string' || !choices.includes(config[key])) invalid('input', `unsupported ${key} choice.`);
    }
  }
  function event(config, producer) {
    if (producer === 'old') return { eventId: 'evt-old', accountId: 'account-synthetic', amountCents: 1250 };
    const payload = { eventId: 'evt-new', accountId: 'account-synthetic' };
    if (config.schema === 'renamed') payload.amountMinor = 2500;
    else payload.amountCents = config.schema === 'unit-drift' ? 25 : 2500;
    payload.currency = 'USD';
    return payload;
  }
  function interpret(payload, consumer, oldReader) {
    if (consumer === 'old' && oldReader === 'strict'
        && Object.keys(payload).some((key) => !['eventId', 'accountId', 'amountCents'].includes(key))) {
      return { interpretable: false, cents: null, reason: 'Strict old reader rejects added or renamed fields.' };
    }
    const cents = consumer === 'new' && !Object.hasOwn(payload, 'amountCents')
      ? payload.amountMinor : payload.amountCents;
    if (!Number.isSafeInteger(cents) || cents < 1) {
      return { interpretable: false, cents: null, reason: 'Required integer amountCents is absent for this reader.' };
    }
    return { interpretable: true, cents, reason: 'Reader interprets an integer-cent amount.' };
  }
  function receipt(config, index) {
    const pair = PAIRS[index];
    const payload = event(config, pair.producer);
    const base = { ...pair, payload, expectedCents: pair.producer === 'old' ? 1250 : 2500 };
    if (pair.consumer === 'old' && (config.checks === 'new-only' || config.observation === 'withhold-old')) {
      return { ...base, interpretable: null, interpretedCents: null, effectCorrect: null,
        appliedCents: null, outcome: 'unknown',
        reason: config.checks === 'new-only' ? 'Old consumer excluded from selected checks.' : 'Old-consumer observation withheld.' };
    }
    const read = interpret(payload, pair.consumer, config.oldReader);
    if (config.checks === 'shape-only') {
      return { ...base, interpretable: read.interpretable, interpretedCents: read.cents,
        effectCorrect: null, appliedCents: null, outcome: read.interpretable ? 'unknown' : 'failure',
        reason: `${read.reason} Business effect was not measured.` };
    }
    const appliedCents = read.interpretable ? read.cents : 0;
    const effectCorrect = read.interpretable && appliedCents === base.expectedCents;
    return { ...base, interpretable: read.interpretable, interpretedCents: read.cents,
      effectCorrect, appliedCents, outcome: effectCorrect ? 'success' : 'failure',
      reason: !read.interpretable ? `${read.reason} Rejected; observed credit is 0 cents.`
        : effectCorrect ? 'Interpretable event; observed credit equals the intended cents.'
          : `Interpretable but wrong business effect: intended ${base.expectedCents}, observed ${appliedCents} cents.` };
  }
  function summary(rows) {
    const failures = rows.filter((row) => row.outcome === 'failure').length;
    const successes = rows.filter((row) => row.outcome === 'success').length;
    const outcome = failures ? 'failure' : successes === 4 ? 'success' : 'unknown';
    return {
      outcome, checked: rows.length, success: successes, failure: failures, unknown: 4 - successes - failures,
      interpretable: rows.filter((row) => row.interpretable === true).length,
      incompatible: rows.filter((row) => row.interpretable === false).length,
      measuredEffects: rows.filter((row) => row.effectCorrect !== null).length,
      correctEffects: rows.filter((row) => row.effectCorrect === true).length,
      incorrectEffects: rows.filter((row) => row.effectCorrect === false).length,
      observedCents: rows.reduce((total, row) => total + (row.appliedCents === null ? 0 : row.appliedCents), 0),
      expectedCents: 7500,
      oldConsumerCoverage: rows.filter((row) => row.consumer === 'old' && row.interpretable !== null).length,
      newConsumerCoverage: rows.filter((row) => row.consumer === 'new' && row.interpretable !== null).length,
      reason: outcome === 'success' ? 'All four consumer contracts and intended business effects were observed correct.'
        : outcome === 'failure' ? 'An observed interpretation or business-effect failure blocks introduction.'
          : 'Incomplete consumer or business-effect evidence cannot establish compatibility.',
    };
  }
  function predictionGuard(prediction, outcome) {
    if (prediction === null) return;
    exact(prediction, ['choice', 'verdict'], 'state');
    if (!OUTCOMES.includes(prediction.choice)
        || prediction.verdict !== (prediction.choice === outcome ? 'PASS' : 'FAIL')) {
      invalid('state', 'prediction cannot alter the measured outcome.');
    }
  }
  function rowsGuard(rows, config, complete) {
    array(rows, 4, 'state');
    if (complete && rows.length !== 4) invalid('state', 'complete matrix needs four receipts.');
    rows.forEach((row, index) => {
      if (!equal(row, receipt(config, index))) invalid('state', 'matrix receipt differs from the pinned synthetic configuration.');
    });
  }
  function stateGuard(state) {
    exact(state, ['version', 'phase', 'config', 'rows', 'introduced', 'history', 'prediction'], 'state');
    stable(state);
    if (state.version !== 1 || !['ready', 'checking', 'checked', 'decided'].includes(state.phase)) {
      invalid('state', 'unsupported version or phase.');
    }
    array(state.history, LIMIT, 'state');
    state.history.forEach((entry, index) => {
      exact(entry, ['id', 'config', 'rows', 'outcome', 'introduced', 'prediction'], 'state');
      configGuard(entry.config);
      rowsGuard(entry.rows, entry.config, true);
      const measured = summary(entry.rows).outcome;
      if (entry.id !== index + 1 || entry.outcome !== measured || entry.introduced !== (measured === 'success')) {
        invalid('state', 'retained history contradicts the compatibility gate.');
      }
      predictionGuard(entry.prediction, measured);
    });
    if (state.phase === 'ready') {
      if (state.config !== null || !equal(state.rows, []) || state.introduced !== false || state.prediction !== null) {
        invalid('state', 'ready state cannot retain active evidence.');
      }
      return;
    }
    configGuard(state.config);
    rowsGuard(state.rows, state.config, state.phase !== 'checking');
    if (state.phase === 'checking' && state.rows.length >= 4) invalid('state', 'checking phase is already complete.');
    if (state.phase !== 'decided') {
      if (state.history.length >= LIMIT || state.introduced !== false || state.prediction !== null) {
        invalid('state', 'undecided state cannot contain introduction or prediction.');
      }
      return;
    }
    const measured = summary(state.rows).outcome;
    const last = state.history[state.history.length - 1];
    if (!last || !equal(last, { id: state.history.length, config: state.config, rows: state.rows,
      outcome: measured, introduced: state.introduced, prediction: state.prediction })) {
      invalid('state', 'active decision does not match retained history.');
    }
    predictionGuard(state.prediction, measured);
  }
  function phase(state, expected) {
    stateGuard(state);
    if (state.phase !== expected) invalid('phase', `expected ${expected}, observed ${state.phase}.`);
  }
  function createState() {
    return freeze({ version: 1, phase: 'ready', config: null, rows: [], introduced: false, history: [], prediction: null });
  }
  function start(state, config) {
    phase(state, 'ready');
    configGuard(config);
    if (state.history.length >= LIMIT) invalid('state', 'eight attempts are retained; reset explicitly before another start.');
    return freeze({ ...copy(state), config: copy(config), phase: 'checking' });
  }
  function step(state) {
    phase(state, 'checking');
    const rows = [...copy(state.rows), receipt(state.config, state.rows.length)];
    return freeze({ ...copy(state), rows, phase: rows.length === 4 ? 'checked' : 'checking' });
  }
  function decide(state) {
    phase(state, 'checked');
    const outcome = summary(state.rows).outcome;
    const introduced = outcome === 'success';
    const entry = { id: state.history.length + 1, config: copy(state.config), rows: copy(state.rows),
      outcome, introduced, prediction: null };
    return freeze({ ...copy(state), phase: 'decided', introduced, history: [...copy(state.history), entry] });
  }
  function another(state) {
    phase(state, 'decided');
    return freeze({ ...createState(), history: copy(state.history) });
  }
  function predict(state, choice) {
    phase(state, 'decided');
    if (typeof choice !== 'string' || !OUTCOMES.includes(choice)) invalid('input', 'choose success, failure or unknown.');
    if (state.prediction !== null) invalid('phase', 'one prediction is retained per attempt.');
    const prediction = { choice, verdict: choice === summary(state.rows).outcome ? 'PASS' : 'FAIL' };
    const next = copy(state);
    next.prediction = prediction;
    next.history[next.history.length - 1].prediction = copy(prediction);
    return freeze(next);
  }
  function summarize(state) {
    stateGuard(state);
    return freeze({ ...summary(state.rows), introduced: state.introduced });
  }
  return Object.freeze({ DEFAULTS, CHOICES, LIMIT, createState, start, step, decide, another, predict, summarize });
}));
