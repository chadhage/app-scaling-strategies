(function (root, factory) {
  'use strict';
  const lesson = factory();
  if (typeof module === 'object' && module.exports) module.exports = lesson;
  else root.S135Lesson = lesson;
}(globalThis, function () {
  'use strict';
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const CONFIG = Object.freeze({
    eventId: 'fictional-event-135',
    intendedEffectId: 'fictional-effect-135',
    originalStartMs: 0,
    budgetMs: 1000,
    maximumRuns: 4,
    maximumActions: 16,
  });

  class LessonGuardError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'LessonGuardError';
      this.code = code;
    }
  }

  function freezeData(value) {
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) freezeData(value[key]);
      Object.freeze(value);
    }
    return value;
  }

  const correctEffect = {
    effectId: CONFIG.intendedEffectId,
    eventId: CONFIG.eventId,
    result: 'correct',
    state: 'applied-once',
  };
  const firstDelivery = {
    deliveryId: 'fictional-delivery-135-1', eventId: CONFIG.eventId,
    version: 'v1', key: CONFIG.eventId, completion: 'completed',
    acknowledgement: 'received', dedupState: 'retained', elapsedMs: 120,
    effectsAfter: [correctEffect],
  };
  const delayedDelivery = {
    deliveryId: 'fictional-delivery-135-2', eventId: CONFIG.eventId,
    version: 'v2', key: CONFIG.eventId, completion: 'deduplicated',
    acknowledgement: 'received', dedupState: 'retained', elapsedMs: 640,
    effectsAfter: [correctEffect],
  };

  const PRESETS = freezeData({
    'stable-key': {
      title: 'Stable event key',
      explanation: 'A delayed v2 retry keeps the event key and observes one correct effect.',
      deliveries: [firstDelivery, delayedDelivery],
    },
    'versioned-key': {
      title: 'Unsafe version-scoped key',
      explanation: 'A different v2 key records a duplicate effect despite received acknowledgements.',
      deliveries: [firstDelivery, {
        ...delayedDelivery, key: 'fictional-event-135@v2',
        completion: 'completed', dedupState: 'version-scoped',
        effectsAfter: [correctEffect, {
          effectId: 'fictional-effect-135-duplicate', eventId: CONFIG.eventId,
          result: 'correct', state: 'applied-once',
        }],
      }],
    },
    'lost-ack': {
      title: 'Lost original acknowledgement',
      explanation: 'The retry is acknowledged, but the original lost acknowledgement remains unverified.',
      deliveries: [{ ...firstDelivery, acknowledgement: 'lost' }, delayedDelivery],
    },
    'unknown-completion': {
      title: 'Unobserved original completion',
      explanation: 'A later one-effect snapshot cannot prove the unobserved original completion.',
      deliveries: [{
        ...firstDelivery, completion: 'unknown', acknowledgement: 'unknown',
        dedupState: 'unobserved', effectsAfter: null,
      }, delayedDelivery],
    },
    'budget-exceeded': {
      title: 'Retry exceeds original budget',
      explanation: '1250 ms exceeds the original 1000 ms budget even with a deduplicated retry.',
      deliveries: [firstDelivery, { ...delayedDelivery, elapsedMs: 1250 }],
    },
    'wrong-effect': {
      title: 'One effect, wrong state/result',
      explanation: 'A one-row effect ledger and acknowledgement do not establish a correct business result.',
      deliveries: [firstDelivery, {
        ...delayedDelivery, dedupState: 'changed',
        effectsAfter: [{
          ...correctEffect, result: 'incorrect', state: 'corrupt-after-cutover',
        }],
      }],
    },
  });

  function guard(code, message) { throw new LessonGuardError(code, message); }

  function readData(value, code) {
    const seen = new WeakSet();
    let nodes = 0;
    function visit(input, depth) {
      if (++nodes > 3000 || depth > 12) guard(code, 'DATA shape exceeds the bounded lesson schema.');
      if (input === null || typeof input === 'boolean') return input;
      if (typeof input === 'string' && input.length <= 400) return input;
      if (typeof input === 'number' && Number.isSafeInteger(input)) return input;
      if (!input || typeof input !== 'object') guard(code, 'DATA must use exact JSON-like types; coercion is not allowed.');
      if (seen.has(input)) guard(code, 'Cyclic or aliased DATA is not allowed.');
      seen.add(input);
      const keys = Reflect.ownKeys(input);
      if (keys.some((key) => typeof key !== 'string')) guard(code, 'Symbol DATA keys are not allowed.');
      if (Array.isArray(input)) {
        if (Object.getPrototypeOf(input) !== Array.prototype) guard(code, 'Array DATA must have the ordinary array prototype.');
        const length = Object.getOwnPropertyDescriptor(input, 'length').value;
        if (!Number.isSafeInteger(length) || length > 64 || keys.length !== length + 1) {
          guard(code, 'Array DATA must be dense, bounded and have no extra keys.');
        }
        const output = [];
        for (let index = 0; index < length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
          if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
            guard(code, 'Array DATA accessors or holes are not allowed.');
          }
          output.push(visit(descriptor.value, depth + 1));
        }
        return output;
      }
      const prototype = Object.getPrototypeOf(input);
      if (prototype !== Object.prototype && prototype !== null) guard(code, 'Record DATA must have a plain prototype.');
      if (keys.length > 32) guard(code, 'Record DATA has too many fields.');
      const output = {};
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
          guard(code, 'Record DATA accessors or hidden fields are not allowed.');
        }
        Object.defineProperty(output, key, {
          value: visit(descriptor.value, depth + 1),
          enumerable: true, configurable: true, writable: true,
        });
      }
      return output;
    }
    try { return visit(value, 0); }
    catch (error) {
      if (error instanceof LessonGuardError) throw error;
      guard(code, 'DATA descriptors could not be read safely.');
    }
  }

  function exactKeys(record, expected, code) {
    if (!record || Array.isArray(record) || typeof record !== 'object') guard(code, 'Expected an exact command/state record.');
    const actual = Object.keys(record).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
      guard(code, 'Unexpected or missing command/state fields.');
    }
  }

  function readCommand(value, code = 'ERR_LESSON_INPUT') {
    const command = readData(value, code);
    if (!command || Array.isArray(command) || typeof command !== 'object' || typeof command.type !== 'string') {
      guard(code, 'Action must be an exact typed command record.');
    }
    if (command.type === 'load') {
      exactKeys(command, ['type', 'presetId', 'eventId', 'budgetMs'], code);
      if (typeof command.presetId !== 'string' || !Object.hasOwn(PRESETS, command.presetId)) {
        guard(code, 'Choose one exact fixed preset DATA identifier.');
      }
      if (command.eventId !== CONFIG.eventId) guard(code, 'Event token DATA must be exactly fictional-event-135; no trimming or coercion.');
      if (typeof command.budgetMs !== 'number' || !Number.isSafeInteger(command.budgetMs) || command.budgetMs !== CONFIG.budgetMs) {
        guard(code, 'Original budget DATA must be the number 1000 ms; it cannot restart at retry.');
      }
    } else {
      if (!['cutover', 'redeliver', 'measure'].includes(command.type)) guard(code, 'Unsupported lesson action.');
      exactKeys(command, ['type'], code);
    }
    return command;
  }

  function freshState() {
    return { schemaVersion: 1, phase: 'ready', active: null, attempts: [], results: [], history: [] };
  }

  function unobserved(attempt) {
    return attempt.completion === 'unknown' || attempt.acknowledgement !== 'received'
      || attempt.dedupState === 'unobserved' || attempt.effectsAfter === null;
  }

  function measureEvent(state) {
    const active = state.active;
    const attempts = state.attempts.filter((attempt) => attempt.runNumber === active.runNumber);
    const negativeReasons = [];
    const unknownReasons = [];
    for (const attempt of attempts) {
      const label = `Delivery ${attempt.deliveryId}`;
      if (attempt.key !== CONFIG.eventId) negativeReasons.push(`${label}: version-scoped key is not the stable event key.`);
      if (attempt.elapsedMs - active.originalStartMs > active.budgetMs) {
        negativeReasons.push(`${label}: ${attempt.elapsedMs} ms exceeds the ORIGINAL ${active.budgetMs} ms budget.`);
      }
      if (attempt.dedupState === 'changed') negativeReasons.push(`${label}: dedup/effect state changed after cutover.`);
      if (attempt.completion === 'unknown') unknownReasons.push(`${label}: original completion was unobserved.`);
      if (attempt.acknowledgement !== 'received') unknownReasons.push(`${label}: original acknowledgement ${attempt.acknowledgement}.`);
      if (attempt.dedupState === 'unobserved') unknownReasons.push(`${label}: original dedup state was unobserved.`);
      if (attempt.effectsAfter === null) {
        unknownReasons.push(`${label}: original effect snapshot was unobserved.`);
      } else {
        if (attempt.effectsAfter.length !== 1) {
          negativeReasons.push(`${label}: ${attempt.effectsAfter.length} effect rows for ONE intended business event.`);
        }
        if (attempt.effectsAfter.some((effect) => effect.effectId !== CONFIG.intendedEffectId
            || effect.eventId !== CONFIG.eventId || effect.result !== 'correct' || effect.state !== 'applied-once')) {
          negativeReasons.push(`${label}: effect identity, state or result is not the intended correct effect.`);
        }
      }
    }
    const latestEffects = attempts[attempts.length - 1].effectsAfter;
    const unknownAttemptCount = attempts.filter(unobserved).length;
    const outcome = negativeReasons.length ? 'negative' : unknownAttemptCount ? 'unknown' : 'positive';
    return {
      runNumber: active.runNumber, presetId: active.presetId, eventId: CONFIG.eventId,
      eventCount: 1, deliveryAttempts: attempts.length,
      originalStartMs: active.originalStartMs, budgetMs: active.budgetMs,
      observedEffects: latestEffects === null ? null : latestEffects.length,
      duplicateEffects: latestEffects === null ? null : Math.max(0, latestEffects.length - 1),
      acknowledgedAttempts: attempts.filter((attempt) => attempt.acknowledgement === 'received').length,
      unknownAttemptCount,
      outcome,
      verification: unknownAttemptCount ? 'unverified' : `verified-${outcome}`,
      verifiedCorrectBusinessResults: outcome === 'positive' ? 1 : 0,
      recovery: unknownAttemptCount && attempts[1].acknowledgement === 'received'
        ? 'Later retry acknowledged; ORIGINAL unknown remains unverified.'
        : 'No unresolved original status observed in this fixed sample.',
      reasons: [...negativeReasons, ...unknownReasons, ...(outcome === 'positive'
        ? ['Two delivery attempts, ONE correct effect, observable statuses and original budget met.'] : [])],
    };
  }

  function applyCommand(state, command) {
    if (state.history.length >= CONFIG.maximumActions) guard('ERR_LESSON_LIMIT', 'Sixteen retained actions reached; Reset lesson is required. No history is pruned.');
    let detail;
    if (command.type === 'load') {
      if (!['ready', 'measured'].includes(state.phase)) guard('ERR_LESSON_ORDER', 'Measure the current event before loading another rehearsal.');
      if (state.results.length >= CONFIG.maximumRuns) guard('ERR_LESSON_LIMIT', 'Four retained rehearsals reached; Reset lesson is required.');
      state.active = {
        runNumber: state.results.length + 1, presetId: command.presetId,
        eventId: command.eventId, originalStartMs: CONFIG.originalStartMs, budgetMs: command.budgetMs,
      };
      state.attempts.push({
        runNumber: state.active.runNumber,
        ...readData(PRESETS[command.presetId].deliveries[0], 'ERR_LESSON_STATE'),
      });
      state.phase = 'loaded';
      detail = `Loaded v1 delivery DATA; original acknowledgement ${state.attempts[state.attempts.length - 1].acknowledgement}. Not yet verified.`;
    } else {
      const requiredPhase = { cutover: 'loaded', redeliver: 'cutover', measure: 'redelivered' }[command.type];
      if (state.phase !== requiredPhase) guard('ERR_LESSON_ORDER', `${command.type} requires phase ${requiredPhase}; retained DATA is unchanged.`);
      if (command.type === 'cutover') {
        state.phase = 'cutover';
        detail = 'Recorded fictional v1 -> v2 cutover DATA; no new delivery or effect.';
      } else if (command.type === 'redeliver') {
        state.attempts.push({
          runNumber: state.active.runNumber,
          ...readData(PRESETS[state.active.presetId].deliveries[1], 'ERR_LESSON_STATE'),
        });
        state.phase = 'redelivered';
        detail = 'Loaded delayed v2 retry DATA for the SAME event; effect snapshots are NOT additive.';
      } else {
        const result = measureEvent(state);
        state.results.push(result);
        state.phase = 'measured';
        detail = `Measured ONE business event: ${result.outcome}; ${result.verification}; ${result.recovery}`;
      }
    }
    state.history.push({
      step: state.history.length + 1,
      runNumber: state.active.runNumber,
      command: readData(command, 'ERR_LESSON_STATE'),
      detail,
    });
    return state;
  }

  function equalData(left, right) {
    if (left === right) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object'
        || Array.isArray(left) !== Array.isArray(right)) return false;
    const a = Object.keys(left).sort();
    const b = Object.keys(right).sort();
    return a.length === b.length && a.every((key, index) => key === b[index] && equalData(left[key], right[key]));
  }

  function readState(value) {
    const state = readData(value, 'ERR_LESSON_STATE');
    exactKeys(state, ['schemaVersion', 'phase', 'active', 'attempts', 'results', 'history'], 'ERR_LESSON_STATE');
    if (!Array.isArray(state.history) || state.history.length > CONFIG.maximumActions) {
      guard('ERR_LESSON_STATE', 'State must retain its bounded command history.');
    }
    const expected = freshState();
    try {
      for (const entry of state.history) {
        exactKeys(entry, ['step', 'runNumber', 'command', 'detail'], 'ERR_LESSON_STATE');
        applyCommand(expected, readCommand(entry.command, 'ERR_LESSON_STATE'));
      }
    } catch (error) {
      if (error instanceof LessonGuardError && error.code === 'ERR_LESSON_STATE') throw error;
      guard('ERR_LESSON_STATE', 'State history cannot be replayed in the guarded action order.');
    }
    if (!equalData(state, expected)) guard('ERR_LESSON_STATE', 'State, attempts or results disagree with retained deterministic history.');
    return expected;
  }

  function createState() { return freezeData(freshState()); }

  function execute(state, command) {
    const replayed = readState(state);
    return freezeData(applyCommand(replayed, readCommand(command)));
  }

  function summarize(state) {
    const replayed = readState(state);
    return Object.freeze({
      deliveryAttempts: replayed.attempts.length,
      measuredEvents: replayed.results.length,
      positive: replayed.results.filter((result) => result.outcome === 'positive').length,
      negative: replayed.results.filter((result) => result.outcome === 'negative').length,
      unknown: replayed.results.filter((result) => result.outcome === 'unknown').length,
      retainedUnknownAttempts: replayed.attempts.filter(unobserved).length,
      actions: replayed.history.length,
    });
  }

  return Object.freeze({ BANNER, CONFIG, PRESETS, LessonGuardError, createState, execute, summarize });
}));
