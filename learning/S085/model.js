'use strict';

(function publish(root) {
  const firstSessions = ['alpha', 'bravo'];
  const conditions = ['busy-lock', 'stale-epoch', 'serialized', 'missing-owner'];
  const outcomes = ['SUCCESS', 'FAILURE', 'UNKNOWN'];
  const versions = { alpha: 'green-v2', bravo: 'amber-v3' };
  const otherLease = {
    id: 'training-other', owner: 'observer', epoch: 40, version: 'purple-v4', effects: 0,
  };
  const copy = (value) => JSON.parse(JSON.stringify(value));
  function requireGuard(condition, message) {
    if (!condition) {
      const error = new Error(message);
      error.name = 'GuardError';
      throw error;
    }
  }
  function validateOptions(input) {
    requireGuard(input !== null && typeof input === 'object'
      && Object.getPrototypeOf(input) === Object.prototype, 'Choose an exact plain input record.');
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Reflect.ownKeys(descriptors);
    requireGuard(keys.length === 2 && keys.includes('first') && keys.includes('condition'),
      'Only first and condition inputs are permitted.');
    for (const key of keys) {
      requireGuard(Object.hasOwn(descriptors[key], 'value') && descriptors[key].enumerable,
        'Inputs must be ordinary own data fields.');
    }
    requireGuard(firstSessions.includes(descriptors.first.value), 'Choose alpha or bravo as the first session.');
    requireGuard(conditions.includes(descriptors.condition.value), 'Choose one of the four fixed conditions.');
    return { first: descriptors.first.value, condition: descriptors.condition.value };
  }

  function createLesson() {
    let phase = 'idle';
    let active = null;
    let history = [];
    function snapshot() {
      const totals = { attempts: history.length, submitted: 0, applied: 0, rejected: 0, unknown: 0, correct: 0 };
      for (const attempt of history) {
        for (const key of ['submitted', 'applied', 'rejected', 'unknown']) totals[key] += attempt.metrics[key];
        if (attempt.predictionCorrect) totals.correct++;
      }
      return copy({ phase, active, history, totals });
    }
    const unchanged = () => JSON.stringify(active.other) === JSON.stringify(otherLease);
    function addTrace(entry) {
      active.trace.push({
        step: active.trace.length + 1, ...entry, unrelatedUnchanged: unchanged(),
      });
    }
    function submit(actor, expectedEpoch, observedOwner) {
      const destination = active.destination;
      const ownerGate = observedOwner === null ? 'UNKNOWN' : observedOwner === actor ? 'PASS' : 'FAIL';
      const epochGate = expectedEpoch === destination.epoch ? 'PASS' : 'FAIL';
      const outcome = ownerGate === 'FAIL' || epochGate === 'FAIL' ? 'FAILURE'
        : ownerGate === 'UNKNOWN' ? 'UNKNOWN' : 'SUCCESS';
      const reason = ownerGate === 'FAIL' ? 'LOCK_CONFLICT' : epochGate === 'FAIL' ? 'STALE_EPOCH'
        : ownerGate === 'UNKNOWN' ? 'MISSING_OWNER_EVIDENCE' : 'VALID_OWNER_AND_EPOCH';
      const entry = {
        kind: 'submission', actor, destination: destination.id, expectedEpoch,
        actualEpoch: destination.epoch, observedOwner, ownerGate, epochGate,
        versionBefore: destination.version, outcome, reason, applied: outcome === 'SUCCESS',
      };
      active.metrics.submitted++;
      if (outcome === 'SUCCESS') {
        if (destination.owner !== actor || destination.epoch !== expectedEpoch) active.metrics.invalidOwnerEffects++;
        destination.version = versions[actor];
        destination.epoch++;
        destination.effects++;
        active.metrics.applied++;
      } else if (outcome === 'FAILURE') active.metrics.rejected++;
      else active.metrics.unknown++;
      entry.versionAfter = destination.version;
      entry.epochAfter = destination.epoch;
      addTrace(entry);
      return copy(entry);
    }
    function start(input) {
      requireGuard(arguments.length === 1, 'Start requires exactly one input record.');
      requireGuard(phase === 'idle', 'Finish and retain the current attempt before starting another.');
      requireGuard(history.length < 6, 'Six attempts are retained. Reset explicitly; no history is evicted.');
      const options = validateOptions(input);
      active = {
        number: history.length + 1, options, firstSession: options.first,
        secondSession: options.first === 'alpha' ? 'bravo' : 'alpha',
        destination: { id: 'training-destination', owner: options.first, epoch: 7, version: 'blue-v1', effects: 0 },
        other: copy(otherLease), trace: [], contender: null, outcome: null, safety: null,
        metrics: { submitted: 0, applied: 0, rejected: 0, unknown: 0, invalidOwnerEffects: 0, unrelatedChanges: 0 },
        prediction: null, predictionCorrect: null,
      };
      addTrace({ kind: 'lock-acquired', owner: options.first, epoch: 7 });
      phase = 'first-ready';
      return snapshot();
    }
    function submitFirst() {
      requireGuard(arguments.length === 0, 'First submission does not accept external commands.');
      requireGuard(phase === 'first-ready', 'First promotion must be submitted exactly once after Start.');
      submit(active.firstSession, 7, active.destination.owner);
      phase = 'contender-ready';
      return snapshot();
    }
    function submitContender() {
      requireGuard(arguments.length === 0, 'Contender submission does not accept external commands.');
      requireGuard(phase === 'contender-ready', 'Submit the first promotion before the contender, exactly once.');
      const condition = active.options.condition;
      if (condition !== 'busy-lock') {
        const previousOwner = active.destination.owner;
        active.destination.owner = active.secondSession;
        addTrace({
          kind: 'lock-transferred', previousOwner, owner: active.secondSession,
          epoch: active.destination.epoch,
        });
      }
      const expectedEpoch = condition === 'stale-epoch' ? 7 : 8;
      const observedOwner = condition === 'missing-owner' ? null : active.destination.owner;
      active.contender = submit(active.secondSession, expectedEpoch, observedOwner);
      active.outcome = active.contender.outcome;
      active.metrics.unrelatedChanges = unchanged() ? 0 : 1;
      active.safety = active.metrics.invalidOwnerEffects || active.metrics.unrelatedChanges ? 'FAIL'
        : active.outcome === 'UNKNOWN' ? 'UNVERIFIED' : 'PASS';
      addTrace({ kind: 'independent-lease-check', before: copy(otherLease), after: copy(active.other) });
      phase = 'decided';
      return snapshot();
    }
    function checkPrediction(prediction) {
      requireGuard(arguments.length === 1 && outcomes.includes(prediction), 'Choose SUCCESS, FAILURE or UNKNOWN before checking.');
      requireGuard(phase === 'decided', 'Submit both promotions before checking once.');
      active.prediction = prediction;
      active.predictionCorrect = prediction === active.outcome;
      history.push(copy(active));
      phase = 'checked';
      return snapshot();
    }
    function newAttempt() {
      requireGuard(arguments.length === 0, 'New attempt does not accept arguments.');
      requireGuard(phase === 'checked', 'Check and retain the current attempt before starting a new one.');
      requireGuard(history.length < 6, 'Six attempts are retained. Reset explicitly; no history is evicted.');
      phase = 'idle';
      active = null;
      return snapshot();
    }
    function reset() {
      requireGuard(arguments.length === 0, 'Reset does not accept arguments.');
      phase = 'idle';
      active = null;
      history = [];
      return snapshot();
    }
    return Object.freeze({
      snapshot, start, submitFirst, submitContender, checkPrediction, newAttempt, reset,
    });
  }
  const api = Object.freeze({ createLesson });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PromotionLesson = api;
})(globalThis);
