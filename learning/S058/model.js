(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WorkflowReplay = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const MAX_ATTEMPTS = 6;
  const definitions = freeze({
    '1.0': ['ReadOrder', 'ReserveStock', 'ShipOrder'],
    '2.0': ['ReadOrder', 'RiskCheck', 'ReserveStock', 'ShipOrder'],
  });
  const fixtures = freeze([
    { id: 'WF-101', version: '1.0', recorded: ['ReadOrder', 'ReserveStock'] },
    { id: 'WF-102', version: '1.0', recorded: ['ReadOrder'] },
    { id: 'WF-201', version: '2.0', recorded: ['ReadOrder', 'RiskCheck', 'ReserveStock'] },
  ]);
  const choices = {
    strategy: ['pin-exact', 'explicit-branch', 'latest'],
    workers: ['overlap', 'new-only'],
    historyEvidence: ['complete', 'missing', 'incompatible'],
  };

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function record(value, keys, label) {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype
        || Reflect.ownKeys(value).length !== keys.length
        || !keys.every((key) => {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable;
        })) throw new TypeError(`Invalid ${label}: expected exactly ${keys.join(', ')}.`);
  }

  function validateInput(input) {
    record(input, Object.keys(choices), 'input');
    for (const [key, values] of Object.entries(choices)) {
      if (!values.includes(input[key])) throw new TypeError(`Invalid input: unapproved ${key}.`);
    }
  }

  function sameData(actual, expected) {
    if (!expected || typeof expected !== 'object') return Object.is(actual, expected);
    if (!actual || Object.getPrototypeOf(actual) !== Object.getPrototypeOf(expected)) return false;
    const keys = Reflect.ownKeys(expected);
    if (Reflect.ownKeys(actual).length !== keys.length) return false;
    return keys.every((key) => {
      const observed = Object.getOwnPropertyDescriptor(actual, key);
      const wanted = Object.getOwnPropertyDescriptor(expected, key);
      return observed && Object.hasOwn(observed, 'value') && observed.enumerable === wanted.enumerable
        && sameData(observed.value, wanted.value);
    });
  }

  function compare(fixture, index, input) {
    const worker = input.strategy === 'pin-exact'
      ? (input.workers === 'overlap' || fixture.version === '2.0' ? fixture.version : null)
      : '2.0';
    const definition = input.strategy === 'latest' ? '2.0' : fixture.version;
    const recorded = [...fixture.recorded];
    if (input.historyEvidence === 'incompatible' && index === 1) recorded.push('ChargeCard');
    const row = {
      id: fixture.id, version: fixture.version, worker, definition,
      recorded, expected: [...definitions[definition]], matchedEvents: 0,
      outcome: 'matched', next: null, divergence: null, explanation: '',
    };
    if (input.historyEvidence === 'missing' && index === 2) {
      return { ...row, recorded: null, outcome: 'unknown', explanation: 'No observed history; do not infer a successful replay.' };
    }
    if (!worker) {
      return { ...row, outcome: 'worker-unavailable', explanation: 'Pinned version 1.0 worker was removed; work cannot continue.' };
    }
    for (let event = 0; event < recorded.length; event += 1) {
      if (row.expected[event] !== recorded[event]) {
        row.outcome = 'history-mismatch';
        row.divergence = { index: event, expected: row.expected[event] || null, recorded: recorded[event] };
        row.explanation = `Recorded event ${event + 1} is ${recorded[event]}; selected definition expects ${row.expected[event] || 'no command'}.`;
        return row;
      }
      row.matchedEvents += 1;
    }
    if (definition !== fixture.version) {
      row.outcome = 'version-mismatch';
      row.explanation = `The short prefix matches, but version ${fixture.version} requires next ${definitions[fixture.version][recorded.length]}; unversioned latest would choose ${row.expected[recorded.length]}. Continuation is blocked.`;
      return row;
    }
    row.next = row.expected[recorded.length];
    row.explanation = `Recorded prefix matches version ${definition}; next modeled command is ${row.next}. No activity was executed.`;
    return row;
  }

  function evaluate(input, attempt) {
    const rows = fixtures.map((fixture, index) => compare(fixture, index, input));
    const metrics = {
      started: rows.length, matched: 0, mismatches: 0, blocked: 0, unknown: 0,
      replayedEvents: 0, externalEffects: 0,
    };
    for (const row of rows) {
      metrics.replayedEvents += row.matchedEvents;
      if (row.outcome === 'matched') metrics.matched += 1;
      else if (row.outcome === 'history-mismatch') metrics.mismatches += 1;
      else if (row.outcome === 'unknown') metrics.unknown += 1;
      else metrics.blocked += 1;
    }
    const verdict = metrics.mismatches + metrics.blocked > 0 ? 'FAILED'
      : metrics.unknown > 0 ? 'UNKNOWN' : 'PASSED';
    return {
      attempt, input: { ...input }, verdict,
      impact: verdict === 'PASSED' ? 'modeled continuation permitted'
        : verdict === 'FAILED' ? 'modeled interruption or blocked work' : 'undetermined',
      rows, metrics,
    };
  }

  function validateState(state) {
    record(state, ['attempts'], 'state');
    const attempts = state.attempts;
    if (!Array.isArray(attempts) || Object.getPrototypeOf(attempts) !== Array.prototype
        || attempts.length > MAX_ATTEMPTS
        || Reflect.ownKeys(attempts).length !== attempts.length + 1) {
      throw new TypeError('Invalid state: expected a dense bounded attempt history.');
    }
    for (let index = 0; index < attempts.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(attempts, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new TypeError('Invalid state: sparse or accessor history.');
      const entry = descriptor.value;
      record(entry, ['input', 'result'], 'state');
      try { validateInput(entry.input); }
      catch { throw new TypeError('Invalid state: unapproved retained input.'); }
      if (!sameData(entry.result, evaluate(entry.input, index + 1))) {
        throw new TypeError('Invalid state: retained result does not match its deterministic input.');
      }
    }
  }

  function createState() { return freeze({ attempts: [] }); }

  function conduct(state, input) {
    validateState(state);
    validateInput(input);
    if (state.attempts.length === MAX_ATTEMPTS) throw new RangeError('Six comparisons retained. Reset before another comparison.');
    const result = evaluate(input, state.attempts.length + 1);
    const attempts = state.attempts.map((entry, index) => ({
      input: { ...entry.input }, result: evaluate(entry.input, index + 1),
    }));
    attempts.push({ input: { ...input }, result });
    return freeze({ state: { attempts }, result });
  }

  function reset(state) {
    validateState(state);
    return createState();
  }
  return freeze({ MAX_ATTEMPTS, fixtures, createState, conduct, reset });
}));
