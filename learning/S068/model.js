(function (root, factory) {
  'use strict';
  const fixture = typeof module === 'object' && module.exports
    ? require('./fixture.js') : root.IndexBuildFixture;
  const api = factory(fixture);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IndexBuildLesson = api;
}(typeof globalThis === 'object' ? globalThis : this, function (fixture) {
  'use strict';
  const states = new WeakSet();
  const predictions = Object.freeze(['PASS', 'FAIL', 'UNKNOWN', 'REJECTED']);
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function save(value) {
    freeze(value);
    states.add(value);
    return value;
  }
  function requirePhase(state, phases) {
    if (!states.has(state)) throw new Error('Untrusted lesson state.');
    if (!phases.includes(state.phase)) throw new Error(`Action is unavailable in phase ${state.phase}.`);
  }
  function invalidConfiguration(message, field) {
    const error = new Error(`Invalid configuration: ${message}`);
    error.field = field;
    return error;
  }
  function validateConfiguration(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
      throw invalidConfiguration('use the five declared finite choices.');
    }
    const keys = Object.keys(fixture.choices);
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Reflect.ownKeys(input).length !== keys.length
        || Reflect.ownKeys(input).some((key) => !keys.includes(key))) {
      throw invalidConfiguration('unexpected or missing fields.');
    }
    const values = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !Object.hasOwn(descriptor, 'value')
          || typeof descriptor.value !== 'string'
          || !fixture.choices[key].includes(descriptor.value)) {
        throw invalidConfiguration(`choose an exact listed ${key} value.`, key);
      }
      values[key] = descriptor.value;
    }
    return freeze(values);
  }
  function emptyMetrics() {
    return { attempted: 0, observed: 0, failed: 0, unknown: 0,
      maxLatencyMs: null, maxLockWaitMs: null };
  }
  function createState() {
    return save({
      phase: 'configure', config: null, plan: null, result: null,
      feedback: null, history: [], attempt: 1,
    });
  }
  function assessBuild(state, input) {
    requirePhase(state, ['configure']);
    if (state.history.length >= fixture.historyLimit) {
      throw new Error('History is limited to six attempts. Reset the rehearsal to clear it.');
    }
    const config = validateConfiguration(input);
    let disposition = 'READY';
    let predictedMaxLatencyMs = null;
    let reason;
    let lockScheduleMs = [];
    if (config.operation === 'online' && config.capability === 'unsupported') {
      disposition = 'REJECTED';
      reason = 'The synthetic capability card does not permit online operation. No blocking fallback and no requests.';
    } else if (config.operation === 'online' && config.capability === 'unknown') {
      disposition = 'UNKNOWN';
      reason = 'Online capability is unverified in this synthetic card. No build or requests can establish success.';
    } else {
      lockScheduleMs = [...(config.operation === 'online'
        ? fixture.onlineLockWaitsMs : fixture.blockingLockWaitsMs)];
      predictedMaxLatencyMs = Math.max(...lockScheduleMs) + fixture.baseServiceMs;
      if (config.guard === 'enforce' && predictedMaxLatencyMs > Number(config.budgetMs)) {
        disposition = 'REJECTED';
        reason = `Predicted latency ${predictedMaxLatencyMs} exceeds budget ${config.budgetMs} synthetic ms. Guard rejected the build before load.`;
      } else {
        reason = config.operation === 'online'
          ? 'This invented capability card permits the online schedule, including nonzero boundary locks. Run requests to obtain synthetic receipts.'
          : config.guard === 'observe'
            ? 'Blocking schedule selected explicitly. Observe-only is a synthetic failure comparison, not permission to run a real database change.'
            : 'The blocking schedule fits the predicted declared budget. Only returned synthetic receipts can establish the observed result.';
      }
    }
    const plan = { disposition, predictedMaxLatencyMs, lockScheduleMs, reason };
    const result = disposition === 'READY' ? null : {
      verdict: disposition, impact: disposition === 'REJECTED' ? 'NOT_EXERCISED' : 'UNVERIFIED',
      reason, metrics: emptyMetrics(), receipts: [],
    };
    return save({ ...state, phase: result ? 'terminal' : 'ready', config, plan, result });
  }
  function runLoad(state) {
    requirePhase(state, ['ready']);
    const budget = Number(state.config.budgetMs);
    const receipts = fixture.requestIds.map((id, index) => {
      const missing = state.config.coverage === 'missing' && index === fixture.missingReceiptIndex;
      const lockWaitMs = missing ? null : state.plan.lockScheduleMs[index];
      const latencyMs = missing ? null : lockWaitMs + fixture.baseServiceMs;
      return { id, lockWaitMs, latencyMs, withinBudget: missing ? null : latencyMs <= budget };
    });
    const observed = receipts.filter((receipt) => receipt.latencyMs !== null);
    const failed = observed.filter((receipt) => !receipt.withinBudget).length;
    const unknown = receipts.length - observed.length;
    const verdict = failed > 0 ? 'FAIL' : unknown > 0 ? 'UNKNOWN' : 'PASS';
    const impact = verdict === 'FAIL' ? 'INTERRUPTED' : verdict === 'UNKNOWN' ? 'UNVERIFIED' : 'BUDGET_MET';
    const metrics = {
      attempted: receipts.length, observed: observed.length, failed, unknown,
      maxLatencyMs: Math.max(...observed.map((receipt) => receipt.latencyMs)),
      maxLockWaitMs: Math.max(...observed.map((receipt) => receipt.lockWaitMs)),
    };
    const reason = verdict === 'FAIL'
      ? `${failed} of ${receipts.length} synthetic requests exceeded the budget; ${unknown} receipts unknown. Learning success cannot erase interrupted users.`
      : verdict === 'UNKNOWN'
        ? `${observed.length} of ${receipts.length} receipts observed. Missing outcomes cannot pass as successful.`
        : 'All four synthetic receipts meet the declared budget. This is not a real index, lock, load or native capability observation.';
    return save({ ...state, phase: 'observed', result: { verdict, impact, reason, metrics, receipts } });
  }
  function checkPrediction(state, prediction) {
    requirePhase(state, ['observed', 'terminal']);
    if (typeof prediction !== 'string' || !predictions.includes(prediction)) {
      const error = new Error('Choose an exact listed prediction before checking.');
      error.field = 'prediction';
      throw error;
    }
    const feedback = { prediction, actual: state.result.verdict, matches: prediction === state.result.verdict };
    const record = {
      attempt: state.attempt, config: state.config, plan: state.plan,
      result: state.result, prediction, matches: feedback.matches,
    };
    return save({ ...state, phase: 'checked', feedback, history: [...state.history, record] });
  }
  function newAttempt(state) {
    requirePhase(state, ['checked']);
    return save({
      phase: 'configure', config: null, plan: null, result: null, feedback: null,
      history: state.history, attempt: state.attempt + 1,
    });
  }
  return Object.freeze({ createState, assessBuild, runLoad, checkPrediction, newAttempt });
}));
