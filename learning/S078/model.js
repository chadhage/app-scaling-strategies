(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SchedulerLesson = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const LIMIT = 6;
  const states = new WeakSet();
  const freeze = (value) => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const mark = (state) => {
    states.add(state);
    return freeze(state);
  };
  const fail = (code, message) => {
    const error = new Error(message);
    error.code = code;
    throw error;
  };
  const guard = (state, phase) => {
    if (!states.has(state) || (phase && state.phase !== phase)) {
      fail('ERR_S078_STATE', `Action requires an authentic ${phase || 'lesson'} state.`);
    }
  };
  const exactEnums = (input, fields) => {
    if (!input || Object.getPrototypeOf(input) !== Object.prototype
        || Reflect.ownKeys(input).length !== Object.keys(fields).length) {
      fail('ERR_S078_INPUT', 'Choose exactly the declared fields; additional inputs are unsupported.');
    }
    const values = {};
    for (const [field, allowed] of Object.entries(fields)) {
      const descriptor = Object.getOwnPropertyDescriptor(input, field);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !allowed.includes(descriptor.value)) {
        fail('ERR_S078_INPUT', `Choose a listed ${field} value.`);
      }
      values[field] = descriptor.value;
    }
    return values;
  };
  const metrics = () => ({
    scheduledCandidates: 0, duplicateSchedules: 0, knownEffects: 0,
    duplicateEffects: 0, invalidExecutorEffects: 0, unresolvedEffects: 0,
  });
  const readyState = (attempt = 1, history = []) => mark({
    phase: 'ready', attempt, config: null, tick: null, lease: null,
    previousLease: null, fence: null, validExecutor: null, schedulers: [], effects: [],
    metrics: metrics(), verdict: 'NOT_EVALUATED', trace: ['No attempt started.'],
    history, interpretation: null,
  });
  const createState = () => readyState();
  const start = (state, input) => {
    guard(state, 'ready');
    const config = exactEnums(input, {
      protection: ['fenced', 'lease-only'], receipt: ['observed', 'missing'],
    });
    const schedulers = [
      { version: 'v1', occurrence: 'JOB-078@6', token: 7, checkedAt: 4, checkedExpiry: 5, status: 'queued' },
      { version: 'v2', occurrence: 'JOB-078@6', token: null, checkedAt: null, checkedExpiry: null, status: 'waiting-lease' },
    ];
    return mark({
      ...state, phase: 'started', config, tick: 4, validExecutor: 'v1',
      lease: { owner: 'v1', epoch: 7, validFrom: 0, expiresAt: 5 },
      fence: config.protection === 'fenced' ? 7 : null, schedulers,
      metrics: { ...metrics(), scheduledCandidates: schedulers.length,
        duplicateSchedules: schedulers.length - new Set(schedulers.map((entry) => entry.occurrence)).size },
      trace: [
        'tick 4: v1 and v2 start; both propose the same JOB-078@6 occurrence.',
        'Duplicate scheduling detected: 2 proposals, 1 occurrence, 1 duplicate proposal.',
        'v1 checks lease epoch 7 at tick 4, before expiry at 5, then pauses before its effect.',
        'v2 is running but cannot acquire the still-held lease; no effects have occurred.',
      ],
    });
  };
  const advanceLease = (state) => {
    guard(state, 'started');
    return mark({
      ...state, phase: 'handoff', tick: 6, previousLease: state.lease,
      lease: { owner: 'v2', epoch: 8, validFrom: 6, expiresAt: 10 },
      validExecutor: 'v2', fence: state.config.protection === 'fenced' ? 8 : null,
      schedulers: [
        { ...state.schedulers[0], status: 'stale-precheck' },
        { ...state.schedulers[1], token: 8, checkedAt: 6, checkedExpiry: 10, status: 'current-owner' },
      ],
      trace: [...state.trace,
        'tick 6: epoch 7 has expired; the synthetic lease authority grants v2 epoch 8 until tick 10.',
        'Only v2 is currently authorized. v1 still holds its old token and cached tick-4 precheck.',
        state.config.protection === 'fenced'
          ? 'The synthetic effect boundary now requires current owner v2 and fencing epoch 8.'
          : 'No effect-boundary fencing: the deliberately unsafe callbacks trust their cached lease prechecks.',
      ],
    });
  };
  const execute = (state) => {
    guard(state, 'handoff');
    const effects = [];
    const trace = [...state.trace];
    const schedulers = state.schedulers.map((scheduler) => {
      const validOwner = scheduler.version === state.lease.owner && scheduler.token === state.lease.epoch
        && state.tick >= state.lease.validFrom && state.tick < state.lease.expiresAt;
      // The comparison deliberately models the old callback trusting an earlier lease check.
      const allowed = state.config.protection === 'fenced'
        ? validOwner && scheduler.token === state.fence
        : scheduler.checkedAt < scheduler.checkedExpiry;
      if (!allowed) {
        trace.push(`${scheduler.version}: stale epoch ${scheduler.token} rejected at the effect boundary; no effect applied.`);
        return { ...scheduler, status: 'rejected-stale' };
      }
      const receipt = scheduler.version === 'v2' ? state.config.receipt : 'observed';
      effects.push({
        occurrence: scheduler.occurrence, executor: scheduler.version, token: scheduler.token,
        receipt, effectUnits: receipt === 'observed' ? 1 : null, validOwner,
      });
      trace.push(receipt === 'observed'
        ? `${scheduler.version}: 1 effect observed with epoch ${scheduler.token}; executor is ${validOwner ? 'valid' : 'INVALID'}.`
        : 'v2: effect receipt missing; effect may or may not have occurred. Do not invent a successful effect.');
      return { ...scheduler, status: receipt === 'observed' ? 'effect-observed' : 'receipt-missing' };
    });
    const known = effects.filter((effect) => effect.receipt === 'observed');
    const measured = {
      ...state.metrics, knownEffects: known.length, duplicateEffects: Math.max(0, known.length - 1),
      invalidExecutorEffects: known.filter((effect) => !effect.validOwner).length,
      unresolvedEffects: effects.filter((effect) => effect.receipt === 'missing').length,
    };
    const verdict = measured.invalidExecutorEffects || measured.duplicateEffects ? 'FAIL'
      : measured.unresolvedEffects ? 'UNKNOWN'
        : measured.knownEffects === 1 ? 'PASS' : 'FAIL';
    trace.push(`${verdict}: ${measured.knownEffects} known effect(s), ${measured.duplicateEffects} known duplicate(s), `
      + `${measured.invalidExecutorEffects} invalid-executor effect(s), ${measured.unresolvedEffects} unresolved effect(s).`);
    const snapshot = {
      attempt: state.attempt, config: state.config, tick: state.tick, lease: state.lease,
      previousLease: state.previousLease, fence: state.fence, validExecutor: state.validExecutor,
      schedulers, effects, metrics: measured, verdict, trace,
    };
    return mark({
      ...state, phase: 'evaluated', schedulers, effects, metrics: measured, verdict, trace,
      history: [...state.history, snapshot],
    });
  };
  const interpret = (state, input) => {
    guard(state, 'evaluated');
    const answer = exactEnums(input, {
      owner: ['v1', 'v2', 'unknown'], outcome: ['PASS', 'FAIL', 'UNKNOWN'],
    });
    const correct = answer.owner === state.validExecutor && answer.outcome === state.verdict;
    return mark({
      ...state, interpretation: {
        ...answer, correct,
        message: correct
          ? 'Correct interpretation. The synthetic result and retained evidence are unchanged.'
          : `Incorrect. Current lease owner is ${state.validExecutor}; evidence result is ${state.verdict}. Evidence is unchanged.`,
      },
    });
  };
  const nextAttempt = (state) => {
    guard(state, 'evaluated');
    if (state.history.length >= LIMIT) fail('ERR_S078_STATE', 'Six attempts retained. Reset all history to start again.');
    return readyState(state.attempt + 1, state.history);
  };
  const resetState = (state) => {
    guard(state);
    return createState();
  };
  return Object.freeze({
    BANNER, LIMIT, createState, start, advanceLease, execute, interpret, nextAttempt, resetState,
  });
}));
