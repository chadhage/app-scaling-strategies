(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.S109Model = factory();
})(globalThis, function () {
  'use strict';
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const MAX_ATTEMPTS = 6;
  const BUDGET = { maxFailures: 0, p95Ms: 150 };
  const NATIVE_SNAT = {
    status: 'unverified', signal: null,
    reason: 'No native Azure SNAT evidence supplied. App counts, model ports and fictional SNAT data are not proof.',
  };
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function observation(capacity, modelPorts, completed, failed, p95Ms, snatUsed) {
    return {
      capacity, modelPorts, journeys: 20, completed, failed, p95Ms,
      syntheticSnat: snatUsed === null ? null
        : { used: snatUsed, capacity: 64, label: 'Fictional SNAT data only' },
    };
  }
  const FIXTURES = freeze({
    baseline: {
      label: 'One-instance baseline', instances: 1, demand: 12,
      direct: { connections: 12, observation: observation(64, 12, 20, 0, 60, 12) },
      pooled: { connections: 6, observation: observation(64, 6, 20, 0, 55, 6) },
    },
    raised: {
      label: 'Four-instance raised demand', instances: 4, demand: 96,
      direct: { connections: 96, observation: observation(64, 96, 12, 8, 240, 64) },
      pooled: { connections: 24, observation: observation(64, 24, 20, 0, 90, 24) },
    },
    ceiling: {
      label: 'Six-instance journey-budget failure', instances: 6, demand: 180,
      direct: { connections: 180, observation: observation(64, 180, 4, 16, 450, 64) },
      pooled: { connections: 48, observation: observation(64, 48, 16, 4, 175, 48) },
    },
    missing: {
      label: 'Four-instance missing observations', instances: 4, demand: 96,
      direct: { connections: 96, observation: observation(null, 96, null, null, null, null) },
      pooled: { connections: 24, observation: observation(null, 24, null, null, null, null) },
    },
  });
  freeze(BUDGET);
  freeze(NATIVE_SNAT);
  function fail(code, message) {
    const error = new Error(message);
    error.name = 'LessonError';
    error.code = code;
    throw error;
  }
  function record(value, keys, code) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      fail(code, 'Expected an exact plain data record.');
    }
    const actual = Reflect.ownKeys(value);
    if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
      fail(code, 'Unexpected or missing data fields.');
    }
    for (const key of keys) {
      if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')) {
        fail(code, 'Accessors are not lesson data.');
      }
    }
  }
  function command(value, code) {
    if (!value || typeof value !== 'object') fail(code, 'Choose an exact lesson action.');
    const type = Object.getOwnPropertyDescriptor(value, 'type');
    if (!type || !Object.hasOwn(type, 'value')) fail(code, 'Choose an exact lesson action.');
    if (type.value === 'inspect') {
      record(value, ['type'], code);
      return { type: 'inspect' };
    }
    if (type.value !== 'rehearse') fail(code, 'Only rehearse and inspect actions are supported.');
    record(value, ['type', 'level', 'strategy'], code);
    if (typeof value.level !== 'string' || !Object.hasOwn(FIXTURES, value.level)) {
      fail(code, 'Choose a listed fixed fictional fixture.');
    }
    if (typeof value.strategy !== 'string' || !['direct', 'pooled'].includes(value.strategy)) {
      fail(code, 'Choose direct or pooled fictional connections.');
    }
    return { type: 'rehearse', level: value.level, strategy: value.strategy };
  }
  const clone = (value) => value === null ? null : JSON.parse(JSON.stringify(value));
  function apply(runtime, action) {
    if (action.type === 'rehearse') {
      if (runtime.phase === 'pending') fail('ORDER', 'Inspect the pending attempt before another rehearsal.');
      if (runtime.attempts >= MAX_ATTEMPTS) fail('LIMIT', 'Six-attempt limit reached. Reset explicitly to begin again.');
      const fixture = FIXTURES[action.level];
      runtime.attempts++;
      runtime.current = {
        attempt: runtime.attempts, level: action.level, label: fixture.label, strategy: action.strategy,
        instances: fixture.instances, demand: fixture.demand, connections: fixture[action.strategy].connections,
        result: 'pending', observation: null, capacityResult: 'unknown', journeyResult: 'unknown',
        budget: clone(BUDGET),
      };
      runtime.runs.push(runtime.current);
      runtime.phase = 'pending';
    } else {
      if (runtime.phase !== 'pending') fail('ORDER', 'Rehearse first; each attempt may be inspected once.');
      const current = runtime.current;
      const measured = clone(FIXTURES[current.level][current.strategy].observation);
      const capacityResult = measured.capacity === null ? 'unknown'
        : measured.modelPorts <= measured.capacity ? 'positive' : 'negative';
      const journeyResult = measured.completed === null || measured.failed === null || measured.p95Ms === null
        ? 'unknown'
        : measured.completed === measured.journeys && measured.failed === BUDGET.maxFailures
          && measured.p95Ms <= BUDGET.p95Ms ? 'positive' : 'negative';
      const gates = [capacityResult, journeyResult];
      const result = gates.includes('negative') ? 'negative' : gates.includes('unknown') ? 'unknown' : 'positive';
      runtime.current = { ...current, observation: measured, capacityResult, journeyResult, result };
      runtime.runs[runtime.runs.length - 1] = runtime.current;
      runtime.phase = 'complete';
    }
    runtime.commands.push(action);
    runtime.events.push({ sequence: runtime.events.length + 1, type: action.type, ...clone(runtime.current) });
  }
  function validate(state) {
    try {
      record(state, ['schemaVersion', 'history'], 'STATE');
      if (state.schemaVersion !== 1 || !Array.isArray(state.history)
          || Object.getPrototypeOf(state.history) !== Array.prototype || state.history.length > MAX_ATTEMPTS * 2) {
        fail('STATE', 'Unsupported or over-limit lesson history.');
      }
      const keys = Reflect.ownKeys(state.history);
      const expected = ['length', ...Array.from({ length: state.history.length }, (_, index) => String(index))];
      if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
        fail('STATE', 'History must be a dense array without extra fields.');
      }
      const runtime = { phase: 'ready', attempts: 0, current: null, runs: [], events: [], commands: [] };
      for (let index = 0; index < state.history.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(state.history, String(index));
        if (!Object.hasOwn(descriptor, 'value')) fail('STATE', 'History accessors are unsupported.');
        apply(runtime, command(descriptor.value, 'STATE'));
      }
      return runtime;
    } catch (error) {
      if (error.code === 'STATE') throw error;
      fail('STATE', 'History contains an invalid or impossible transition.');
    }
  }
  function initial() { return freeze({ schemaVersion: 1, history: [] }); }
  function transition(state, input) {
    const runtime = validate(state);
    apply(runtime, command(input, 'INPUT'));
    return freeze({ schemaVersion: 1, history: runtime.commands });
  }
  function summarize(state) {
    const runtime = validate(state);
    const counts = { positive: 0, negative: 0, unknown: 0, pending: 0 };
    for (const run of runtime.runs) counts[run.result]++;
    return {
      phase: runtime.phase, attempts: runtime.attempts, maxAttempts: MAX_ATTEMPTS,
      current: clone(runtime.current), history: runtime.events, counts, nativeSnat: clone(NATIVE_SNAT),
    };
  }
  return Object.freeze({ BANNER, MAX_ATTEMPTS, initial, transition, summarize });
});
