(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.S049Lesson = factory();
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DEFAULT_CONFIG = Object.freeze({
    deduplication: 'atomic',
    retryKey: 'same',
    retryPayload: 'same',
    retryResponse: 'received',
    retryAfterMs: 30,
    deadlineMs: 100,
  });
  const BOUNDS = Object.freeze({ maxRuns: 6, maxTimeMs: 1000, maxEffects: 2, maxTrace: 6 });
  const choices = Object.freeze({
    deduplication: ['atomic', 'none'],
    retryKey: ['same', 'new', 'missing'],
    retryPayload: ['same', 'changed'],
    retryResponse: ['received', 'lost'],
  });

  function immutableCopy(value) {
    const copy = JSON.parse(JSON.stringify(value));
    function freeze(item) {
      if (item && typeof item === 'object') {
        Object.values(item).forEach(freeze);
        Object.freeze(item);
      }
      return item;
    }
    return freeze(copy);
  }

  function requireCount(args, expected) {
    if (args.length !== expected) throw new Error(`Expected exactly ${expected} command arguments.`);
  }

  function validateConfig(input) {
    const keys = Object.keys(DEFAULT_CONFIG);
    if (!input || Object.getPrototypeOf(input) !== Object.prototype
        || Reflect.ownKeys(input).length !== keys.length
        || keys.some((key) => !Object.hasOwn(input, key))) {
      throw new Error('Configuration must contain exactly the six declared fields.');
    }
    const fields = Object.getOwnPropertyDescriptors(input);
    if (keys.some((key) => !Object.hasOwn(fields[key], 'value'))) {
      throw new Error('Configuration fields must be data values, not accessors.');
    }
    const config = {};
    for (const key of keys) {
      const value = fields[key].value;
      if (choices[key]) {
        if (!choices[key].includes(value)) throw new Error(`Invalid synthetic choice: ${key}.`);
      } else {
        const minimum = key === 'deadlineMs' ? 1 : 0;
        if (!Number.isInteger(value) || value < minimum || value > BOUNDS.maxTimeMs) {
          throw new Error(`${key} must be an integer from ${minimum} to ${BOUNDS.maxTimeMs}.`);
        }
      }
      config[key] = value;
    }
    return config;
  }

  function fresh(history = []) {
    return {
      schemaVersion: 1, phase: 'configure', config: { ...DEFAULT_CONFIG },
      effects: [], trace: [], client: { status: 'not-sent', effectId: null, units: null },
      elapsedMs: 0, postCount: 0, result: null, prediction: null, history: history.slice(),
    };
  }

  function assess(state) {
    const correctClientResult = state.client.status === 'unresolved' ? null
      : state.client.status === 'confirmed'
        && state.client.effectId === 'synth-effect-1' && state.client.units === 10;
    const withinBudget = state.elapsedMs <= state.config.deadlineMs;
    const reasons = [];
    if (state.effects.length !== 1) reasons.push('Duplicate business effects: one order was committed twice.');
    if (!withinBudget) reasons.push('The original deadline was exceeded; retry does not restart it.');
    if (correctClientResult === false) reasons.push('The client did not receive the correct original order result.');
    let outcome = 'failure';
    if (reasons.length === 0) {
      outcome = correctClientResult === null ? 'unknown' : 'success';
      reasons.push(outcome === 'unknown'
        ? 'One effect is observed, but the client is explicitly unresolved after another lost response.'
        : 'One business effect and the correct original client result within the original deadline.');
    }
    return {
      outcome, reasons, effectCount: state.effects.length,
      totalUnits: state.effects.reduce((sum, effect) => sum + effect.units, 0),
      clientStatus: state.client.status, correctClientResult, withinBudget,
      elapsedMs: state.elapsedMs, deadlineMs: state.config.deadlineMs, postAttempts: state.postCount,
    };
  }

  function createLesson(...creationArgs) {
    requireCount(creationArgs, 0);
    let state = fresh();
    const snapshot = () => immutableCopy(state);
    function requirePhase(phase) {
      if (state.phase !== phase) throw new Error(`Action requires ${phase}; current phase is ${state.phase}.`);
    }
    return Object.freeze({
      snapshot(...args) {
        requireCount(args, 0);
        return snapshot();
      },
      commitAndLoseResponse(...args) {
        requireCount(args, 1);
        requirePhase('configure');
        const config = validateConfig(args[0]);
        if (state.history.length >= BOUNDS.maxRuns) throw new Error('Six results retained. Reset explicitly to clear them.');
        state = {
          ...fresh(state.history), phase: 'ambiguous', config, postCount: 1,
          effects: [{ effectId: 'synth-effect-1', key: 'synth-key-A', operation: 'synth-order', units: 10 }],
          client: { status: 'unresolved', effectId: null, units: null },
          trace: [
            { atMs: 0, event: 'POST synth-order (10 units), synth-key-A: committed synth-effect-1.' },
            { atMs: 0, event: 'Response lost after commit. The effect remains; the client is unresolved, not rolled back.' },
          ],
        };
        return snapshot();
      },
      retry(...args) {
        requireCount(args, 0);
        requirePhase('ambiguous');
        const config = state.config;
        const key = { same: 'synth-key-A', new: 'synth-key-B', missing: null }[config.retryKey];
        const units = config.retryPayload === 'same' ? 10 : 20;
        const atMs = config.retryAfterMs;
        const effects = state.effects.slice();
        const trace = state.trace.concat({ atMs, event: `Retry POST: key ${key || '(missing)'}, synth-order (${units} units).` });
        const existing = effects.find((effect) => effect.key === key);
        let response;
        if (config.deduplication === 'atomic' && key === null) {
          response = { status: 'rejected-missing-key', effectId: null, units: null };
          trace.push({ atMs, event: 'Synthetic 400 missing-key rejection; no new effect.' });
        } else if (config.deduplication === 'atomic' && existing) {
          if (existing.units !== units) {
            response = { status: 'rejected-conflict', effectId: null, units: null };
            trace.push({ atMs, event: 'Synthetic 409 payload conflict; the same key cannot name a different request. No new effect.' });
          } else {
            response = { status: 'confirmed', effectId: existing.effectId, units: existing.units };
            trace.push({ atMs, event: 'Atomic key-and-payload ledger replay: remembered result synth-effect-1; no new effect.' });
          }
        } else {
          const effect = { effectId: 'synth-effect-2', key, operation: 'synth-order', units };
          effects.push(effect);
          response = { status: 'confirmed', effectId: effect.effectId, units };
          trace.push({ atMs, event: 'Retry committed synth-effect-2: a second business effect for the same intended order.' });
        }
        const client = config.retryResponse === 'lost'
          ? { status: 'unresolved', effectId: null, units: null } : response;
        trace.push({
          atMs,
          event: config.retryResponse === 'lost'
            ? 'Retry response also lost. The client remains explicitly unresolved.'
            : `Client received ${response.status}${response.effectId ? `: ${response.effectId}, ${response.units} units` : ''}.`,
        });
        const next = {
          ...state, phase: 'observed', effects, trace, client, elapsedMs: atMs, postCount: 2,
        };
        state = { ...next, result: assess(next) };
        return snapshot();
      },
      checkPrediction(...args) {
        requireCount(args, 1);
        requirePhase('observed');
        const selected = args[0];
        if (!['success', 'failure', 'unknown'].includes(selected)) throw new Error('Choose success, failure, or unknown.');
        const prediction = { selected, correct: selected === state.result.outcome };
        const row = {
          runId: state.history.length + 1, config: state.config, effects: state.effects,
          trace: state.trace, client: state.client, result: state.result, prediction,
        };
        state = { ...state, phase: 'complete', prediction, history: state.history.concat(row) };
        return snapshot();
      },
      newAttempt(...args) {
        requireCount(args, 0);
        requirePhase('complete');
        if (state.history.length >= BOUNDS.maxRuns) throw new Error('Six results retained. Reset explicitly to clear them.');
        state = fresh(state.history);
        return snapshot();
      },
      reset(...args) {
        requireCount(args, 0);
        state = fresh();
        return snapshot();
      },
    });
  }
  return Object.freeze({ DEFAULT_CONFIG, BOUNDS, createLesson });
}));
