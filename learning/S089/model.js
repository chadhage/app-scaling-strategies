'use strict';

(function publish(root, factory) {
  const fixtures = typeof module === 'object' && module.exports ? require('.\\fixtures.js') : root.S089Fixtures;
  const api = factory(fixtures);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S089Lesson = api;
})(globalThis, function model({ CONDITIONS, RECOVERY, ROUTE, BOUNDS }) {
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  const zero = () => ({ attempted: 0, success: 0, failure: 0, unknown: 0 });
  const arity = (args, expected) => {
    if (args.length !== expected) throw new Error(`Invalid input: expected ${expected} argument(s)`);
  };
  const validateConfig = (value) => {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      throw new Error('Invalid input: expected an exact plain fixture record');
    }
    const keys = Reflect.ownKeys(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (keys.length !== 2 || !keys.includes('condition') || !keys.includes('recovery')
      || !keys.every((key) => Object.hasOwn(descriptors[key], 'value'))
      || typeof descriptors.condition.value !== 'string'
      || typeof descriptors.recovery.value !== 'string'
      || !Object.hasOwn(CONDITIONS, descriptors.condition.value)
      || !Object.hasOwn(RECOVERY, descriptors.recovery.value)) {
      throw new Error('Invalid input: choose only a listed condition and recovery evidence');
    }
    return { condition: descriptors.condition.value, recovery: descriptors.recovery.value };
  };
  const fresh = () => ({
    phase: 'idle', attemptId: null, config: null, route: copy(ROUTE),
    controlAvailability: 'available', harnessAvailability: 'available', faultScope: null,
    commandCounts: { attempted: 0, rejected: 0 }, dataOutcome: 'not-sampled',
    recoveryOutcome: 'not-attempted', verification: 'PENDING', metrics: zero(),
    journeys: [], trace: [], harnessReport: null, prediction: null, predictionCorrect: null,
    userTransitionClaim: false,
  });

  function createLesson(...args) {
    arity(args, 0);
    let state = fresh();
    let history = [];
    const requirePhase = (...phases) => {
      if (!phases.includes(state.phase)) throw new Error(`Invalid state: action is not allowed in ${state.phase}`);
    };
    const capacity = () => {
      if (history.length >= BOUNDS.maxHistory) throw new Error('History full: explicitly reset to start another attempt');
    };
    const event = (kind, fields = {}) => {
      state.trace.push({ atSyntheticMs: state.trace.length * 10, kind, ...fields });
    };
    const totals = () => history.reduce((sum, entry) => {
      for (const key of Object.keys(sum)) sum[key] += entry.metrics[key];
      return sum;
    }, zero());
    const snapshot = (...parameters) => {
      arity(parameters, 0);
      return freeze(copy({ ...state, retainedMetrics: totals(), history }));
    };

    return Object.freeze({
      snapshot,
      start(...parameters) {
        arity(parameters, 1);
        const config = validateConfig(parameters[0]);
        requirePhase('idle');
        capacity();
        state = { ...fresh(), phase: 'prepared', attemptId: history.length + 1, config };
        event('prepared', { condition: config.condition, recoveryEvidence: config.recovery });
        return snapshot();
      },
      loseManagement(...parameters) {
        arity(parameters, 0);
        requirePhase('prepared');
        state.phase = 'outage';
        state.controlAvailability = 'unavailable';
        state.faultScope = 'per-run-management';
        state.commandCounts = { attempted: 1, rejected: 1 };
        event('management-lost', {
          scope: state.faultScope, command: 'synthetic-inspect-route',
          commandOutcome: 'rejected-control-unavailable', routeUnchanged: true,
        });
        return snapshot();
      },
      sampleJourneys(...parameters) {
        arity(parameters, 0);
        requirePhase('outage');
        state.journeys = copy(CONDITIONS[state.config.condition].journeys);
        state.metrics = state.journeys.reduce((sum, journey) => {
          sum.attempted++;
          sum[journey.status]++;
          return sum;
        }, zero());
        state.dataOutcome = state.metrics.failure ? 'interrupted'
          : state.metrics.unknown ? 'unverified' : 'continuing-established-service';
        state.phase = 'sampled';
        event('established-journeys-sampled', {
          control: state.controlAvailability, dataOutcome: state.dataOutcome, metrics: copy(state.metrics),
        });
        return snapshot();
      },
      reportFault(...parameters) {
        arity(parameters, 0);
        requirePhase('sampled');
        state.harnessReport = {
          reporter: 'independent-training-harness', scope: 'per-run-management',
          commandOutcome: 'rejected-control-unavailable', metrics: copy(state.metrics),
        };
        state.phase = 'reported';
        event('independent-harness-reported', { control: state.controlAvailability, scope: state.faultScope });
        return snapshot();
      },
      recoverControl(...parameters) {
        arity(parameters, 0);
        requirePhase('reported');
        const evidence = RECOVERY[state.config.recovery];
        state.controlAvailability = evidence.control;
        state.recoveryOutcome = evidence.outcome;
        state.phase = evidence.outcome === 'confirmed' ? 'recovered' : 'recovery-unknown';
        state.verification = state.metrics.failure ? 'FAIL'
          : state.metrics.unknown || evidence.outcome !== 'confirmed' ? 'UNKNOWN' : 'PASS';
        event('independent-harness-recovery', {
          evidence: state.config.recovery, control: state.controlAvailability,
          recoveryOutcome: state.recoveryOutcome, verification: state.verification, routeUnchanged: true,
        });
        return snapshot();
      },
      checkPrediction(...parameters) {
        arity(parameters, 1);
        const prediction = parameters[0];
        if (!['PASS', 'FAIL', 'UNKNOWN'].includes(prediction)) {
          throw new Error('Invalid input: choose PASS, FAIL or UNKNOWN');
        }
        requirePhase('recovered', 'recovery-unknown');
        state.phase = 'checked';
        state.prediction = prediction;
        state.predictionCorrect = prediction === state.verification;
        event('prediction-checked', {
          prediction, verification: state.verification, predictionCorrect: state.predictionCorrect,
        });
        history.push(copy(state));
        return snapshot();
      },
      newAttempt(...parameters) {
        arity(parameters, 0);
        requirePhase('checked');
        capacity();
        state = fresh();
        return snapshot();
      },
      reset(...parameters) {
        arity(parameters, 0);
        state = fresh();
        history = [];
        return snapshot();
      },
    });
  }

  return Object.freeze({ createLesson });
});
