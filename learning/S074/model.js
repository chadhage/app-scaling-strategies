(function (root, factory) {
  'use strict';
  const fixtures = typeof module === 'object' && module.exports ? require('./fixtures.js') : root.S074Fixtures;
  const value = factory(fixtures);
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.S074Model = value;
}(typeof globalThis === 'object' ? globalThis : this, function (fixtures) {
  'use strict';
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  const detached = (value) => freeze(clone(value));
  const empty = () => ({
    phase: 'idle', input: null, pressure: null, result: null, prediction: null,
    history: [], totals: { success: 0, failure: 0, unknown: 0 }, trace: [],
  });
  function validateInput(input) {
    const invalid = (field) => {
      const error = new Error(`Invalid input: ${field}. Select a declared fixture.`);
      error.field = field;
      throw error;
    };
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype) invalid('settings');
    const keys = Reflect.ownKeys(input);
    const expected = ['pressure', 'durable', 'response'];
    if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) invalid('settings');
    for (const field of expected) {
      const descriptor = Object.getOwnPropertyDescriptor(input, field);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable
          || typeof descriptor.value !== 'string') invalid(field);
    }
    if (!Object.hasOwn(fixtures.pressures, input.pressure)) invalid('pressure');
    if (!fixtures.durableModes.includes(input.durable)) invalid('durable');
    if (!fixtures.responseModes.includes(input.response)) invalid('response');
    return detached(input);
  }
  function pressureFor(input) {
    const { tick, slots } = fixtures.pressures[input.pressure];
    let remaining = clone(fixtures.entries);
    const evicted = [];
    for (const entry of remaining) {
      if (tick >= entry.expiresAt) evicted.push({ ...entry, reason: 'ttl', tick });
    }
    remaining = remaining.filter((entry) => tick < entry.expiresAt);
    remaining.sort((left, right) => left.lastUsed - right.lastUsed);
    while (remaining.length > slots) evicted.push({ ...remaining.shift(), reason: 'capacity', tick });
    return { tick, slots, before: clone(fixtures.entries), remaining, evicted };
  }
  function outcomeFor(input, pressure) {
    const requiredMisses = Number(!pressure.remaining.some((entry) => entry.kind === 'required'));
    const optionalMisses = Number(!pressure.remaining.some((entry) => entry.kind === 'optional'));
    const result = {
      outcome: 'SUCCESS', requiredState: 'preserved', requiredMisses, optionalMisses,
      recomputed: optionalMisses, recovered: 0, requiredPreserved: 1,
      lostRequiredState: 0, interruptions: 0, unverified: 0,
      status: 200, served: clone(fixtures.required), durableObserved: null,
      source: 'cache-hit', reason: 'required-cache-hit', derivedTile: fixtures.derivedTile,
    };
    if (requiredMisses) {
      result.source = `durable-${input.durable}`;
      result.reason = 'approved-durable-recovery';
      result.served = null;
      result.requiredPreserved = 0;
      if (input.response === 'empty-success') {
        Object.assign(result, {
          outcome: 'FAILURE', requiredState: 'lost', source: 'empty-success',
          reason: 'empty-success-required-state-loss', served: {}, lostRequiredState: 1, interruptions: 1,
        });
      } else if (input.durable === 'current') {
        Object.assign(result, {
          served: clone(fixtures.required), durableObserved: clone(fixtures.required),
          recovered: 1, requiredPreserved: 1,
        });
      } else if (input.durable === 'unverified') {
        Object.assign(result, {
          outcome: 'UNKNOWN', requiredState: 'unverified', reason: 'durable-evidence-unavailable',
          unverified: 1, status: null,
        });
      } else {
        Object.assign(result, {
          outcome: 'FAILURE', requiredState: 'lost', reason: `durable-required-state-${input.durable}`,
          durableObserved: input.durable === 'stale' ? clone(fixtures.stale) : null,
          lostRequiredState: 1, interruptions: 1, status: 503,
        });
      }
    }
    result.comparison = Object.entries(fixtures.required).map(([field, expected]) => {
      const actual = result.served && Object.hasOwn(result.served, field) ? result.served[field] : null;
      return { field, expected, actual, status: result.unverified ? 'UNKNOWN' : actual === expected ? 'PASS' : 'FAIL' };
    });
    if (result.outcome === 'SUCCESS' && result.comparison.some((entry) => entry.status !== 'PASS')) {
      throw new Error('Required-state oracle rejected a success-shaped response.');
    }
    return result;
  }
  function runCase(input) {
    const accepted = validateInput(input);
    return detached(outcomeFor(accepted, pressureFor(accepted)));
  }
  function createLesson() {
    let state = empty();
    const snapshot = () => detached(state);
    return Object.freeze({
      snapshot,
      applyPressure(input) {
        if (state.phase !== 'idle') throw new Error('Pressure already applied. Retain the current attempt first.');
        if (state.history.length >= fixtures.historyLimit) throw new Error('Six retained attempts reached. Reset explicitly; no history is evicted.');
        const accepted = validateInput(input);
        const pressure = pressureFor(accepted);
        state = {
          ...state, phase: 'pressured', input: accepted, pressure,
          trace: [
            `Begin with two cache entries; required session revision ${fixtures.required.revision}.`,
            `Apply ${accepted.pressure}: logical tick ${pressure.tick}; capacity ${pressure.slots}.`,
            ...pressure.evicted.map((entry) => `Evict ${entry.key} (${entry.kind}) by ${entry.reason}; expiry ${entry.expiresAt}.`),
            `Remaining cache entries: ${pressure.remaining.length}. No durable evidence consumed yet.`,
          ],
        };
        return snapshot();
      },
      evaluate() {
        if (state.phase === 'idle') throw new Error('Apply pressure first.');
        if (state.phase !== 'pressured') throw new Error('Continuity already checked. Retain this attempt.');
        const result = outcomeFor(state.input, state.pressure);
        state = {
          ...state, phase: 'evaluated', result,
          trace: [...state.trace,
            `Required cache misses ${result.requiredMisses}; optional misses ${result.optionalMisses}.`,
            `Optional tile ${result.recomputed ? 'recomputed from its fixed synthetic catalog' : 'cache hit'}; never used as required state.`,
            `Required-state source: ${result.source}; ${result.reason}.`,
            `Oracle ${result.outcome}: preserved ${result.requiredPreserved}; lost ${result.lostRequiredState}; unverified ${result.unverified}; interruptions ${result.interruptions}.`,
          ],
        };
        return snapshot();
      },
      check(prediction) {
        if (state.phase === 'checked') throw new Error('Attempt already retained. Start a new attempt.');
        if (state.phase !== 'evaluated') throw new Error('Check continuity first.');
        if (!fixtures.outcomes.includes(prediction)) {
          const error = new Error('Invalid prediction. Choose SUCCESS, FAILURE or UNKNOWN.');
          error.field = 'prediction';
          throw error;
        }
        const learning = { choice: prediction, correct: prediction === state.result.outcome };
        const trace = [...state.trace, `Prediction ${prediction}: ${learning.correct ? 'correct' : 'incorrect'}; measured outcome unchanged.`];
        const attempt = {
          id: state.history.length + 1, input: state.input, pressure: state.pressure,
          result: state.result, prediction: learning, trace,
        };
        const totals = { ...state.totals };
        totals[state.result.outcome.toLowerCase()]++;
        state = {
          ...state, phase: 'checked', prediction: learning, trace, totals,
          history: [...state.history, clone(attempt)],
        };
        return snapshot();
      },
      newAttempt() {
        if (state.phase !== 'checked') throw new Error('Retain the current attempt first.');
        state = { ...empty(), history: state.history, totals: state.totals };
        return snapshot();
      },
      reset() {
        state = empty();
        return snapshot();
      },
    });
  }
  return Object.freeze({ createLesson, runCase, validateInput });
}));
