(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('.\\fixtures.js'));
  else root.CanaryModel = factory(root.CanaryFixtures);
})(globalThis, function (fixtures) {
  'use strict';

  const copy = (value) => JSON.parse(JSON.stringify(value));
  function fail(code, message, field = null) {
    const error = new Error(message);
    error.code = code;
    error.field = field;
    throw error;
  }
  function exactRecord(input, fields) {
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype) {
      fail('ERR_INPUT', 'Use an exact plain record of the declared string selections.');
    }
    const keys = Reflect.ownKeys(input);
    if (keys.length !== Object.keys(fields).length || keys.some((key) => !Object.hasOwn(fields, key))) {
      fail('ERR_INPUT', 'Only the exact declared selection keys are accepted.');
    }
    const result = {};
    for (const [field, allowed] of Object.entries(fields)) {
      const descriptor = Object.getOwnPropertyDescriptor(input, field);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable
          || typeof descriptor.value !== 'string' || !allowed.includes(descriptor.value)) {
        fail('ERR_INPUT', `Choose an allowed ${field} selection; accessors and coerced values are rejected.`, field);
      }
      result[field] = descriptor.value;
    }
    return Object.freeze(result);
  }
  function summarize(journeys) {
    const successful = journeys.filter((row) => row.outcome === 'SUCCESS').length;
    const interrupted = journeys.filter((row) => row.outcome === 'FAILURE').length;
    const unknown = journeys.length - successful - interrupted;
    return {
      attempted: journeys.length, successful, interrupted, unknown,
      verdict: interrupted ? 'FAILURE' : unknown || !journeys.length ? 'UNKNOWN' : 'SUCCESS',
      journeys,
    };
  }
  const row = (clientId, destination, outcome, reason) => ({
    clientId, intendedDestination: destination, observedDestination: destination,
    syntheticHttpStatus: outcome === 'UNKNOWN' ? null : outcome === 'FAILURE' ? 503 : 200,
    syntheticLatencyMs: outcome === 'UNKNOWN' ? null : outcome === 'FAILURE' ? 60 : destination === 'old-v1' ? 80 : 120,
    outcome, reason,
  });

  function createLesson() {
    let active = null;
    let history = [];
    function requirePhase(...allowed) {
      if (!active || !allowed.includes(active.phase)) fail('ERR_STATE', 'Action rejected: follow the adjacent lesson steps without repeating them.');
    }
    function record(action, message, detail = {}) {
      active.trace.push({ sequence: active.trace.length + 1, action, message, detail: copy(detail) });
    }
    function snapshot() {
      const counted = [...history, ...(active && active.phase !== 'CHECKED' ? [active] : [])];
      const totals = counted.reduce((sum, attempt) => {
        for (const key of ['attempted', 'successful', 'interrupted', 'unknown']) sum[key] += attempt.transition[key];
        return sum;
      }, { attempts: counted.length, checkedAttempts: history.length, attempted: 0, successful: 0, interrupted: 0, unknown: 0 });
      totals.fraction = totals.attempted ? totals.successful / totals.attempted : null;
      return copy({
        phase: active ? active.phase : 'IDLE', config: active ? active.config : fixtures.DEFAULT_CONFIG,
        active, history, totals, canStart: !active && history.length < fixtures.MAX_ATTEMPTS,
        canNewAttempt: active?.phase === 'CHECKED' && history.length < fixtures.MAX_ATTEMPTS,
      });
    }
    function start(input) {
      if (history.length >= fixtures.MAX_ATTEMPTS) fail('ERR_LIMIT', 'Six checked attempts are retained. Reset all local data before another attempt.');
      if (active) fail('ERR_STATE', 'Finish this attempt and choose New attempt before starting again.');
      const config = exactRecord(input, {
        stage: fixtures.STAGES, observation: fixtures.OBSERVATIONS, rollbackEvidence: fixtures.ROLLBACK_EVIDENCE,
      });
      const count = Number(config.stage) * fixtures.CLIENT_IDS.length / 100;
      active = {
        number: history.length + 1, config, phase: 'CANARY_STARTED',
        desiredCandidatePercent: Number(config.stage), observedCandidatePercent: Number(config.stage),
        candidateAdmissionOpen: true,
        transition: summarize(fixtures.CLIENT_IDS.slice(0, count).map((id) =>
          row(id, 'candidate-v2', 'UNKNOWN', 'Awaiting the synthetic canary outcome observation.'))),
        comparison: fixtures.CLIENT_IDS.slice(count).map((id) =>
          row(id, 'old-v1', 'SUCCESS', 'Old-only comparison; no attempted migration.')),
        expansion: { status: 'NOT_REVIEWED', allowed: null },
        recovery: { verdict: 'NOT_ATTEMPTED', attempted: 0, successful: 0, interrupted: 0, unknown: 0, journeys: [] },
        prediction: { verdict: 'NOT_CHECKED' }, trace: [],
      };
      record('START_CANARY', 'One fixed synthetic cohort is exposed; started journeys are not yet successful.', {
        stagePercent: Number(config.stage), attemptedTransitions: count, oldOnlyComparisons: active.comparison.length,
      });
      return snapshot();
    }
    function observe() {
      requirePhase('CANARY_STARTED');
      active.transition = summarize(active.transition.journeys.map((original, index) => {
        const failed = index === 0 && ['failed', 'mixed'].includes(active.config.observation);
        const missing = index === (active.config.observation === 'mixed' ? 1 : 0)
          && ['missing', 'mixed'].includes(active.config.observation);
        return row(original.clientId, 'candidate-v2', failed ? 'FAILURE' : missing ? 'UNKNOWN' : 'SUCCESS',
          failed ? 'Synthetic HTTP 503 interrupted the original journey.'
            : missing ? 'Complete journey evidence is missing; success is not assumed.'
              : 'Synthetic HTTP 200, correct journey and 120 ms within the fixed 250 ms budget.');
      }));
      if (active.transition.verdict !== 'SUCCESS') {
        active.candidateAdmissionOpen = false;
        active.desiredCandidatePercent = 0;
      }
      active.phase = 'CANARY_OBSERVED';
      record('OBSERVE_CANARY', active.candidateAdmissionOpen
        ? 'The measured stage passes; another stage has not been executed.'
        : 'Stop new candidate admission and request reversal. Existing outcomes remain counted.', {
        verdict: active.transition.verdict, successful: active.transition.successful,
        interrupted: active.transition.interrupted, unknown: active.transition.unknown,
        desiredCandidatePercent: active.desiredCandidatePercent, observedCandidatePercent: active.observedCandidatePercent,
      });
      return snapshot();
    }
    function reviewExpansion() {
      requirePhase('CANARY_OBSERVED');
      const allowed = active.transition.verdict === 'SUCCESS';
      active.expansion = { status: allowed ? 'ELIGIBLE_NOT_EXECUTED' : 'REJECTED', allowed };
      active.phase = 'EXPANSION_REVIEWED';
      record('REVIEW_EXPANSION', allowed
        ? 'Next-stage gate eligible only. This bounded lesson executes no additional exposure.'
        : 'Expansion rejected: failed or unknown journeys cannot authorize a larger cohort.', {
        allowed, additionalExecutedTransitions: 0, observedCandidatePercent: active.observedCandidatePercent,
      });
      return snapshot();
    }
    function rollback() {
      requirePhase('EXPANSION_REVIEWED');
      if (active.expansion.allowed) fail('ERR_STATE', 'No rollback step applies to the healthy one-stage path.');
      const confirmed = active.config.rollbackEvidence === 'confirmed';
      active.desiredCandidatePercent = 0;
      active.observedCandidatePercent = confirmed ? 0 : null;
      active.candidateAdmissionOpen = false;
      active.recovery = summarize(fixtures.CLIENT_IDS.map((id) => {
        const recoveryRow = row(id, 'old-v1', confirmed ? 'SUCCESS' : 'UNKNOWN',
          confirmed ? 'Separate synthetic old-destination recovery check: 200 and 80 ms.'
            : 'Rollback observation missing; an action does not prove effective reversal.');
        if (!confirmed) recoveryRow.observedDestination = null;
        return recoveryRow;
      }));
      active.phase = 'RECOVERY_REHEARSED';
      record('REHEARSE_ROLLBACK', confirmed
        ? 'Observed old routing restored. Successful recovery does not rewrite the original canary journeys.'
        : 'Reversal requested, not observed. Recovery and effective routing remain UNKNOWN.', {
        recoveryVerdict: active.recovery.verdict, observedCandidatePercent: active.observedCandidatePercent,
        originalAttempted: active.transition.attempted, originalInterrupted: active.transition.interrupted,
        originalUnknown: active.transition.unknown,
      });
      return snapshot();
    }
    function checkPrediction(input) {
      requirePhase('EXPANSION_REVIEWED', 'RECOVERY_REHEARSED');
      if (active.phase === 'EXPANSION_REVIEWED' && !active.expansion.allowed) {
        fail('ERR_STATE', 'Rehearse rollback before checking a stopped canary.');
      }
      const selections = exactRecord(input, {
        transition: fixtures.TRANSITION_RESULTS, recovery: fixtures.RECOVERY_RESULTS,
      });
      const correct = selections.transition === active.transition.verdict && selections.recovery === active.recovery.verdict;
      active.prediction = { ...selections, verdict: correct ? 'PASS' : 'FAIL' };
      active.phase = 'CHECKED';
      record('CHECK_PREDICTION', correct
        ? 'Learning check PASS. User impact and recovery remain independent results.'
        : 'Learning check FAIL. A mistaken prediction cannot change recorded user impact.', active.prediction);
      history.push(copy(active));
      return snapshot();
    }
    function newAttempt() {
      if (history.length >= fixtures.MAX_ATTEMPTS) fail('ERR_LIMIT', 'History is full. No attempt is evicted; use Reset all local data.');
      requirePhase('CHECKED');
      active = null;
      return snapshot();
    }
    function reset() {
      active = null;
      history = [];
      return snapshot();
    }
    return Object.freeze({ snapshot, start, observe, reviewExpansion, rollback, checkPrediction, newAttempt, reset });
  }
  return Object.freeze({ createLesson });
});
