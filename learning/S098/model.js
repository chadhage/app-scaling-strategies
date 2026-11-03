(function (scope) {
  'use strict';

  const fixture = typeof module !== 'undefined' && module.exports
    ? require('.\\fixtures.js') : scope.S098Fixture;

  const states = new WeakSet();
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function state(value) {
    freeze(value);
    states.add(value);
    return value;
  }
  function reject(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    throw error;
  }
  function requireState(value) {
    if (!value || !states.has(value)) reject('ERR_STATE', 'Use an intact state created by this workbook.');
  }
  function requireRun(value, expectedRunId) {
    if (!Number.isSafeInteger(expectedRunId) || expectedRunId < 1) reject('ERR_INPUT', 'Run token must be a positive safe integer.');
    if (value.runId !== expectedRunId) reject('ERR_STALE', 'This command belongs to an earlier rehearsal. Reset and use the current run.');
  }
  function requireInput(input, keys) {
    if (!input || Object.getPrototypeOf(input) !== Object.prototype
        || Object.keys(input).length !== keys.length || keys.some((key) => !Object.hasOwn(input, key))) {
      reject('ERR_INPUT', 'Use exactly the declared choices and current run token.');
    }
  }
  function requireChoice(value, choices, label) {
    if (typeof value !== 'string' || !choices.includes(value)) reject('ERR_INPUT', `Unknown ${label}.`);
  }
  function requireCapacity(value) {
    if (value.history.length >= fixture.maxDecisions) reject('ERR_CAPACITY', 'The 12-decision workbook is full. Reset cannot erase its history.');
  }

  function create() {
    return state({
      runId: 1, phase: 'BASELINE', servingVersion: 'v1', ledger: fixture.baseline,
      history: [], trace: [], decision: null, learningVerdict: 'NOT_CHECKED',
    });
  }
  function applyNewWrites(value, expectedRunId) {
    requireState(value);
    requireRun(value, expectedRunId);
    if (value.phase !== 'BASELINE') reject('ERR_STATE', 'The fixed v2 writes can be applied only once per rehearsal.');
    requireCapacity(value);
    return state({
      ...value, phase: 'WRITES_COMMITTED', servingVersion: 'v2', ledger: fixture.committed,
      trace: ['4 ms synthetic: L002 reserves 3; L003 releases 1. All three committed effects total 8 units.'],
    });
  }

  function interpret(ledger, observation) {
    if (observation === 'unknown') return [];
    return ledger.filter((entry) => observation !== 'missing' || entry.id !== 'L003').map((entry) => {
      let delta = entry.writtenBy === 'v1' ? entry.payload.units
        : entry.payload.quantity * (entry.payload.direction === 'release' ? -1 : 1);
      if (observation === 'corrupt' && entry.id === 'L003') delta = Math.abs(delta);
      return { id: entry.id, delta };
    });
  }

  function recover(value, input) {
    requireState(value);
    requireInput(input, ['expectedRunId', 'plan', 'observation']);
    requireRun(value, input.expectedRunId);
    requireChoice(input.plan, Object.keys(fixture.plans), 'recovery plan');
    requireChoice(input.observation, fixture.observations, 'read observation');
    if (value.phase !== 'WRITES_COMMITTED') reject('ERR_STATE', 'Apply the fixed v2 writes before one recovery decision.');
    requireCapacity(value);
    const plan = fixture.plans[input.plan];
    const effects = plan.supported ? interpret(value.ledger, input.observation) : [];
    const observed = plan.supported && input.observation !== 'unknown';
    const total = observed ? effects.reduce((sum, effect) => sum + effect.delta, 0) : null;
    const exactEffects = effects.length === fixture.expectedEffects.length
      && effects.every((effect, index) => effect.id === fixture.expectedEffects[index].id
        && effect.delta === fixture.expectedEffects[index].delta);
    let outcome;
    let explanation;
    if (!plan.supported) {
      outcome = 'REJECTED';
      explanation = input.plan === 'discard-new-writes'
        ? 'Safe abort: restoring the old 6-unit snapshot would discard L002 and L003. The complete 8-unit ledger stays with v2.'
        : 'Safe abort: baseline-only v1 interprets just L001 as 6 units, not all three effects as 8. Choose compatible rollback or explicit forward recovery.';
    } else if (!observed) {
      outcome = 'UNKNOWN';
      explanation = 'Read evidence is unavailable. Retained writes alone cannot qualify interpretation or effective recovery; v2 remains selected.';
    } else {
      outcome = exactEffects && total === fixture.expectedTotal && fixture.observedReadMs <= fixture.readBudgetMs
        ? 'SUCCESS' : 'FAILURE';
      explanation = outcome === 'SUCCESS'
        ? `All three IDs and signed effects read correctly as 8 units in 7 synthetic ms. ${plan.target} is the verified teaching destination.`
        : `Read verification failed: ${effects.length}/3 effects total ${total}, expected 8. Stored writes remain intact; the unverified destination is not exposed.`;
    }
    const effectiveVersion = outcome === 'SUCCESS' ? plan.target : value.servingVersion;
    const decision = {
      number: value.history.length + 1, runId: value.runId, plan: input.plan, observation: input.observation,
      outcome, retainedEffects: value.ledger.length, interpretedEffects: effects,
      expectedTotal: fixture.expectedTotal, observedTotal: total, oldSnapshotTotal: fixture.oldSnapshotTotal,
      observedReadMs: observed ? fixture.observedReadMs : null, readBudgetMs: fixture.readBudgetMs,
      desiredVersion: plan.target, effectiveVersion, explanation,
      prediction: null, learningVerdict: 'NOT_CHECKED',
    };
    return state({
      ...value, phase: 'DECIDED', servingVersion: effectiveVersion, decision,
      history: [...value.history, decision],
      trace: [...value.trace, `${observed ? '11' : '4'} ms synthetic: ${outcome}. ${explanation}`],
    });
  }

  function checkPrediction(value, input) {
    requireState(value);
    requireInput(input, ['expectedRunId', 'prediction']);
    requireRun(value, input.expectedRunId);
    requireChoice(input.prediction, fixture.predictions, 'prediction');
    if (value.phase !== 'DECIDED') reject('ERR_STATE', 'Make one recovery decision before checking its interpretation.');
    const learningVerdict = input.prediction === value.decision.outcome ? 'PASS' : 'FAIL';
    const decision = { ...value.decision, prediction: input.prediction, learningVerdict };
    return state({
      ...value, phase: 'CHECKED', decision, learningVerdict,
      history: [...value.history.slice(0, -1), decision],
      trace: [...value.trace, `Learner ${learningVerdict}; recovery remains ${decision.outcome}.`],
    });
  }

  function reset(value) {
    requireState(value);
    if (value.runId >= Number.MAX_SAFE_INTEGER) reject('ERR_CAPACITY', 'Run token capacity reached.');
    return state({
      runId: value.runId + 1, phase: 'BASELINE', servingVersion: 'v1', ledger: fixture.baseline,
      history: value.history, trace: [], decision: null, learningVerdict: 'NOT_CHECKED',
    });
  }
  function summary(value) {
    requireState(value);
    const count = (outcome) => value.history.filter((entry) => entry.outcome === outcome).length;
    const rejected = count('REJECTED');
    return {
      decisions: value.history.length, attempted: value.history.length - rejected,
      success: count('SUCCESS'), failure: count('FAILURE'), unknown: count('UNKNOWN'), rejected,
      remaining: fixture.maxDecisions - value.history.length,
    };
  }
  const api = Object.freeze({ create, applyNewWrites, recover, checkPrediction, reset, summary });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.S098Lesson = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
