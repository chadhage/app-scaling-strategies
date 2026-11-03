(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RestartRehearsal = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const POLICIES = Object.freeze(['reconcile', 'unsafe-replay']);
  const EVIDENCE = Object.freeze(['complete', 'missing-effect-receipt', 'missing-user-outcome', 'recorded-user-failure']);
  const OUTCOMES = Object.freeze(['SUCCESS', 'FAILURE', 'UNKNOWN']);
  const EFFECT_ID = 'retire-v1@7';
  const MAX_HISTORY = 6;

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

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function initial(history) {
    return { phase: 'idle', config: null, trace: [], result: null, prediction: null, history };
  }

  function validateConfig(value) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      fail('INPUT', 'Choose an exact resume policy and evidence fixture.');
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 2 || !keys.includes('policy') || !keys.includes('evidence')) {
      fail('INPUT', 'Configuration must contain only policy and evidence.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (!Object.hasOwn(descriptors.policy, 'value') || !Object.hasOwn(descriptors.evidence, 'value')
        || !POLICIES.includes(descriptors.policy.value) || !EVIDENCE.includes(descriptors.evidence.value)) {
      fail('INPUT', 'Choose an exact resume policy and evidence fixture; unsupported values are rejected.');
    }
    return { policy: descriptors.policy.value, evidence: descriptors.evidence.value };
  }

  function append(trace, kind, detail, effectId) {
    if (trace.length >= 16) fail('LIMIT', 'The fixed trace limit was reached.');
    const event = { seq: trace.length + 1, kind, detail };
    if (effectId) event.effectId = effectId;
    trace.push(event);
  }

  function restoredUsers(evidence, held) {
    return [
      { id: 'journey-A', outcome: 'SUCCESS' },
      { id: 'journey-B', outcome: evidence === 'missing-user-outcome' ? 'UNKNOWN' : evidence === 'recorded-user-failure' ? 'FAILURE' : 'SUCCESS' },
      { id: 'journey-C', outcome: held ? 'UNKNOWN' : 'SUCCESS' }
    ];
  }

  function createLesson() {
    let state = initial([]);
    const copy = () => freeze(clone(state));
    const requirePhase = (expected) => {
      if (state.phase !== expected) fail('STATE', `This action requires ${expected}; the current phase is ${state.phase}.`);
    };

    return {
      getState: copy,
      stage(input) {
        requirePhase('idle');
        if (state.history.length >= MAX_HISTORY) fail('LIMIT', 'Six full attempts are retained. Explicitly reset to start over.');
        const config = validateConfig(input);
        const trace = [];
        append(trace, 'CHECKPOINT', 'Synthetic durable checkpoint still names retire-v1 as the next step (epoch 7).');
        append(trace, 'DESTRUCTIVE_DATA', 'DATA ONLY: retire-v1@7 was applied once before the crash. No resource is touched.', EFFECT_ID);
        append(trace, 'USER_OUTCOMES', `Three journeys already attempted: journey-A SUCCESS; journey-B ${restoredUsers(config.evidence, true)[1].outcome}; journey-C in progress.`);
        append(trace, 'CRASH', 'Synthetic controller trace pauses after the effect, before checkpoint advancement. The browser console remains available.');
        state = { ...initial(state.history), phase: 'crashed', config, trace };
        return copy();
      },
      restart() {
        requirePhase('crashed');
        const { policy, evidence } = state.config;
        const trace = clone(state.trace);
        const receiptMissing = evidence === 'missing-effect-receipt';
        const held = policy === 'reconcile' && receiptMissing;
        const reasons = [];
        append(trace, 'RESTART', `DATA ONLY: resume policy ${policy}; durable effect receipt ${receiptMissing ? 'missing' : 'present'}.`);
        if (policy === 'unsafe-replay') {
          append(trace, 'DESTRUCTIVE_DATA', 'DATA ONLY: unsafe checkpoint replay applies retire-v1@7 a second time. This is a duplicate destructive action.', EFFECT_ID);
          reasons.push('The same retirement identity appears twice. Successful users and an available console cannot excuse duplicate destructive work.');
        } else if (held) {
          append(trace, 'HOLD', 'Missing durable effect receipt: do not replay, do not guess completion, retain unresolved progress.');
          reasons.push('The observer trace shows one effect, but the simulated controller lacks its durable receipt. Reconciliation is required, not blind replay.');
        } else {
          append(trace, 'RECONCILED', 'The durable receipt for retire-v1@7 proves the step already completed. Skip replay and advance its checkpoint.');
        }
        const userOutcomes = restoredUsers(evidence, held);
        const destructiveExecutions = trace.filter((event) => event.kind === 'DESTRUCTIVE_DATA').length;
        const metrics = {
          destructiveExecutions,
          duplicateDestructiveActions: Math.max(0, destructiveExecutions - 1),
          userAttempted: userOutcomes.length,
          userSucceeded: userOutcomes.filter((user) => user.outcome === 'SUCCESS').length,
          userFailed: userOutcomes.filter((user) => user.outcome === 'FAILURE').length,
          userUnknown: userOutcomes.filter((user) => user.outcome === 'UNKNOWN').length
        };
        if (metrics.userFailed) reasons.push('The pre-crash interruption for journey-B remains a failure after restart.');
        if (evidence === 'missing-user-outcome') reasons.push('journey-B has no durable outcome. It remains UNKNOWN in the denominator of three attempted journeys.');
        if (held) reasons.push('journey-C remains unresolved while recovery is held.');
        const outcome = metrics.duplicateDestructiveActions || metrics.userFailed
          ? 'FAILURE' : held || metrics.userUnknown ? 'UNKNOWN' : 'SUCCESS';
        if (outcome === 'SUCCESS') reasons.push('One destructive execution, no duplicate, complete recovered progress, and all three user outcomes are accounted for.');
        const checkpoint = held ? 'RECONCILE_REQUIRED' : 'COMPLETE';
        append(trace, 'USER_OUTCOMES', userOutcomes.map((user) => `${user.id} ${user.outcome}`).join('; '));
        append(trace, 'CHECKPOINT', `Recovered checkpoint: ${checkpoint}. This alone is not the success criterion.`);
        append(trace, 'VERDICT', `${outcome}: ${metrics.duplicateDestructiveActions} duplicate destructive actions; ${metrics.userFailed} failed and ${metrics.userUnknown} unknown of ${metrics.userAttempted} user journeys.`);
        state = {
          ...state, phase: 'resumed', trace,
          result: { outcome, checkpoint, consoleAvailable: true, effectReceipt: receiptMissing ? 'MISSING' : 'PRESENT', metrics, userOutcomes, reasons }
        };
        return copy();
      },
      check(prediction) {
        requirePhase('resumed');
        if (!OUTCOMES.includes(prediction)) fail('INPUT', 'Choose exactly SUCCESS, FAILURE, or UNKNOWN before checking.');
        const correct = prediction === state.result.outcome;
        const attempt = {
          attempt: state.history.length + 1, config: clone(state.config), trace: clone(state.trace),
          result: clone(state.result), prediction, correct
        };
        state = { ...state, phase: 'checked', prediction: { choice: prediction, correct }, history: [...state.history, attempt] };
        return copy();
      },
      newAttempt() {
        requirePhase('checked');
        if (state.history.length >= MAX_HISTORY) fail('LIMIT', 'Six full attempts are retained. Explicitly reset to start over.');
        state = initial(state.history);
        return copy();
      },
      reset() {
        state = initial([]);
        return copy();
      }
    };
  }

  return Object.freeze({ createLesson, policies: POLICIES, evidence: EVIDENCE, maxHistory: MAX_HISTORY });
}));
