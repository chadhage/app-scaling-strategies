(function (root, factory) {
  'use strict';
  const fixtures = typeof module === 'object' && module.exports
    ? require('./fixtures.js') : root.WebSocketFixtures;
  const model = factory(fixtures);
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.WebSocketLesson = model;
}(typeof globalThis === 'object' ? globalThis : this, function (fixtures) {
  'use strict';

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function validateConfig(input) {
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype) {
      fail('ERR_CONFIG', 'Configuration must be a plain object with every declared field.');
    }
    const keys = Object.keys(fixtures.defaults);
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Reflect.ownKeys(input).length !== keys.length
        || !keys.every((key) => Object.hasOwn(descriptors, key) && Object.hasOwn(descriptors[key], 'value'))) {
      fail('ERR_CONFIG', 'Configuration has missing, extra or accessor fields.');
    }
    for (const [field, values] of Object.entries(fixtures.choices)) {
      if (!values.includes(input[field])) fail('ERR_CONFIG', `Choose a declared ${field} value.`);
    }
    for (const [field, min, max] of [
      ['gapMs', fixtures.limits.minGapMs, fixtures.limits.maxGapMs],
      ['budgetMs', fixtures.limits.minBudgetMs, fixtures.limits.maxBudgetMs],
    ]) {
      if (!Number.isInteger(input[field]) || input[field] < min || input[field] > max) {
        fail('ERR_CONFIG', `${field} must be an integer from ${min} to ${max}; no coercion is allowed.`);
      }
    }
    return freeze(copy(input));
  }

  function fresh(history = []) {
    return {
      phase: 'idle', attempt: history.length, config: null, ackCursor: 0, ackState: 0,
      trace: [], result: null, prediction: null, history,
    };
  }

  function event(trace, phase, atMs, text) {
    trace.push({ step: trace.length + 1, phase, atMs, text });
  }

  function sequenceOf(frame) {
    return frame.version === 1 ? frame.seq : frame.sequence;
  }

  function replayFrames(cursor, delivery) {
    let frames = [...fixtures.v1, ...fixtures.v2].filter((frame) => sequenceOf(frame) > cursor);
    if (delivery === 'drop-5') frames = frames.filter((frame) => sequenceOf(frame) !== 5);
    if (delivery === 'repeat-4') {
      const index = frames.findIndex((frame) => sequenceOf(frame) === 4);
      if (index >= 0) frames.splice(index + 1, 0, frames[index]);
    }
    if (delivery === 'reorder') {
      const fifth = frames.findIndex((frame) => sequenceOf(frame) === 5);
      const sixth = frames.findIndex((frame) => sequenceOf(frame) === 6);
      if (fifth >= 0 && sixth >= 0) [frames[fifth], frames[sixth]] = [frames[sixth], frames[fifth]];
    }
    return frames;
  }

  function addCheck(checks, id, label, value, detail) {
    checks.push({ id, label, outcome: value === null ? 'unknown' : value ? 'pass' : 'fail', detail });
  }

  function evaluate(config, trace) {
    const requestedCursor = {
      'last-ack': fixtures.acknowledgedCursor, rewind: 0, skip: 4, absent: null,
    }[config.cursor];
    const observed = requestedCursor !== null && config.observation === 'complete';
    const retained = config.stateRetention === 'retained';
    let lastAcknowledged = observed ? fixtures.acknowledgedCursor : null;
    let finalState = observed ? retained ? fixtures.acknowledgedState : 0 : null;
    let wireReplays = observed ? 0 : null;
    let duplicateEffects = observed ? 0 : null;
    let rejectedGaps = observed ? 0 : null;
    let schemaRejects = observed ? 0 : null;
    const visibleSequences = observed ? [1, 2, 3] : null;
    event(trace, 'reconnect', config.gapMs,
      `Requested resume cursor: ${requestedCursor === null ? 'unknown; no fallback cursor invented' : requestedCursor}.`);

    if (observed) {
      for (const frame of replayFrames(requestedCursor, config.delivery)) {
        if (frame.version === 2 && config.decoder === 'v1-only') {
          schemaRejects++;
          event(trace, 'replay', config.gapMs, `Rejected v2 sequence ${frame.sequence}: v1-only decoder.`);
          continue;
        }
        const seq = sequenceOf(frame);
        const delta = frame.version === 1 ? frame.delta : frame.increment;
        if (seq <= lastAcknowledged) {
          wireReplays++;
          if (config.replayProtection === 'deduplicate') {
            event(trace, 'replay', config.gapMs, `Suppressed wire replay ${seq}; no duplicate visible effect.`);
            continue;
          }
          duplicateEffects++;
          finalState += delta;
          visibleSequences.push(seq);
          event(trace, 'replay', config.gapMs, `Applied duplicate effect ${seq}; state is now ${finalState}.`);
        } else if (seq !== lastAcknowledged + 1) {
          rejectedGaps++;
          event(trace, 'replay', config.gapMs, `Rejected sequence ${seq}; expected ${lastAcknowledged + 1}. ACK does not advance.`);
        } else {
          lastAcknowledged = seq;
          finalState += delta;
          visibleSequences.push(seq);
          event(trace, 'replay', config.gapMs, `Decoded v${frame.version}, applied and acknowledged ${seq}; state ${finalState}.`);
        }
      }
    } else {
      event(trace, 'replay', config.gapMs, 'Post-reconnect sequence and state proof are absent; no completion is inferred.');
    }

    const missingVisible = observed
      ? fixtures.expectedSequences.filter((seq) => !visibleSequences.includes(seq)) : null;
    const ordered = observed
      ? rejectedGaps === 0 && visibleSequences.every((seq, index) => !index || seq > visibleSequences[index - 1])
      : null;
    const checks = [];
    addCheck(checks, 'cursor', 'Resume cursor does not skip required work',
      requestedCursor === null ? null : requestedCursor <= fixtures.acknowledgedCursor,
      requestedCursor === null ? 'No confirmed cursor.' : `Requested ${requestedCursor}; prior ACK is 3.`);
    addCheck(checks, 'retention', 'Previously acknowledged state retained', retained,
      retained ? 'Prior state 30 retained.' : 'Prior acknowledged state 30 was lost.');
    addCheck(checks, 'versions', 'Both versioned frame formats are readable',
      observed ? schemaRejects === 0 : null,
      observed ? `${schemaRejects} schema rejections.` : 'No frame observation proof.');
    addCheck(checks, 'complete', 'Every sequence 1-6 is visible and acknowledged',
      observed ? missingVisible.length === 0 && lastAcknowledged === 6 : null,
      observed ? `Missing visible sequences: ${missingVisible.join(', ') || 'none'}; final ACK ${lastAcknowledged}.` : 'Sequence completeness unknown.');
    addCheck(checks, 'ordering', 'No sequence gap or out-of-order effect', ordered,
      observed ? `${rejectedGaps} gap rejections; visible order ${visibleSequences.join(', ')}.` : 'Ordering unknown.');
    addCheck(checks, 'duplicates', 'No duplicate user-visible effects',
      observed ? duplicateEffects === 0 : null,
      observed ? `${wireReplays} wire replays; ${duplicateEffects} duplicate effects.` : 'Duplicate-effect count unknown.');
    addCheck(checks, 'state', 'Final acknowledged state is 60',
      observed ? finalState === fixtures.expectedState : null,
      observed ? `Observed state ${finalState}; expected 60.` : 'Final state unknown.');
    addCheck(checks, 'budget', 'Recovery meets the original UX budget',
      config.gapMs <= config.budgetMs,
      `${config.gapMs} ms from disconnect to final replay observation; original budget ${config.budgetMs} ms.`);
    const impact = checks.some((entry) => entry.outcome === 'fail') ? 'interrupted'
      : checks.some((entry) => entry.outcome === 'unknown') ? 'unknown' : 'uninterrupted';
    event(trace, 'verify', config.gapMs, `Synthetic user impact: ${impact}. This is not a live WebSocket result.`);
    return {
      impact, requestedCursor, lastAcknowledged, finalState, wireReplays, duplicateEffects,
      rejectedGaps, schemaRejects, missingVisible, visibleSequences,
      gapMs: config.gapMs, budgetMs: config.budgetMs, checks,
    };
  }

  function createLesson() {
    let state = fresh();
    const snapshot = () => freeze(copy(state));
    const requirePhase = (expected, action) => {
      if (state.phase !== expected) fail('ERR_PHASE', `${action} requires ${expected}; current phase is ${state.phase}.`);
    };
    return Object.freeze({
      snapshot,
      start(input) {
        requirePhase('idle', 'Start');
        if (state.history.length >= fixtures.limits.attempts) fail('ERR_LIMIT', 'Eight attempts retained. Reset explicitly; no history is evicted.');
        const config = validateConfig(input);
        const trace = [];
        for (const frame of fixtures.v1) {
          event(trace, 'v1', frame.seq - 4, `v1 applied and acknowledged ${frame.seq}; state ${frame.seq * 10}.`);
        }
        state = {
          ...fresh(state.history), phase: 'connected-v1', attempt: state.history.length + 1,
          config, ackCursor: fixtures.acknowledgedCursor, ackState: fixtures.acknowledgedState, trace,
        };
        return snapshot();
      },
      cutover() {
        requirePhase('connected-v1', 'Cutover');
        event(state.trace, 'cutover', 0, 'Disconnected v1; retained last confirmed ACK 3 and state 30.');
        event(state.trace, 'cutover', 0, 'v2 offers sequences 4-6 as {version:2, sequence, increment}; reconnection is not yet a success.');
        state.phase = 'disconnected';
        return snapshot();
      },
      reconnect() {
        requirePhase('disconnected', 'Reconnect');
        const trace = copy(state.trace);
        const result = evaluate(state.config, trace);
        state = {
          ...state, phase: 'complete', trace, result,
          ackCursor: result.lastAcknowledged === null ? state.ackCursor : result.lastAcknowledged,
          ackState: result.finalState === null ? state.ackState : result.finalState,
          history: [...state.history, {
            attempt: state.attempt, config: copy(state.config), result: copy(result), prediction: null,
          }],
        };
        return snapshot();
      },
      checkPrediction(expected) {
        requirePhase('complete', 'Prediction');
        if (!['uninterrupted', 'interrupted', 'unknown'].includes(expected)) {
          fail('ERR_PREDICTION', 'Choose uninterrupted, interrupted or unknown.');
        }
        state.prediction = {
          expected, actual: state.result.impact, verdict: expected === state.result.impact ? 'PASS' : 'FAIL',
        };
        state.history[state.history.length - 1].prediction = copy(state.prediction);
        return snapshot();
      },
      nextAttempt() {
        requirePhase('complete', 'New attempt');
        if (state.history.length >= fixtures.limits.attempts) fail('ERR_LIMIT', 'Eight attempts retained. Reset explicitly; no history is evicted.');
        state = fresh(state.history);
        return snapshot();
      },
      reset() {
        state = fresh();
        return snapshot();
      },
    });
  }

  return Object.freeze({ createLesson });
}));
