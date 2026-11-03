(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DnsCacheLesson = factory();
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const LIMITS = Object.freeze({ comparisons: 12, runId: 65535 });
  const FIXTURE = Object.freeze({
    hostname: 'service.training.invalid',
    oldAnswer: '192.0.2.10',
    newAnswer: '192.0.2.20',
    switchAtSeconds: 30,
    cacheAExpirySeconds: 120,
    cacheBExpirySeconds: 180,
    requiredOverlapEndSeconds: 180,
    latencyBudgetMs: 10
  });
  const samples = Object.freeze({ immediate: 30, 'first-expiry': 120, 'overlap-end': 180 });
  const policies = ['retain', 'retire-now'];
  const coverages = ['complete', 'missing-b'];
  const outcomes = ['success', 'failure', 'unknown'];
  const reasons = ['retain-overlap-not-universal', 'fresh-proves-all', 'ttl-proves-all'];

  function exactObject(value, keys, label) {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype
        || Reflect.ownKeys(value).length !== keys.length
        || keys.some((key) => {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          return !descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value');
        })) throw new TypeError(`Invalid ${label}: expected exact plain data fields`);
  }
  function choice(value, values, label) {
    if (typeof value !== 'string' || !values.includes(value)) throw new TypeError(`Invalid ${label}`);
  }
  function sameData(actual, expected) {
    if (expected === null || typeof expected !== 'object') return Object.is(actual, expected);
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual) || Object.getPrototypeOf(actual) !== Array.prototype
          || actual.length !== expected.length || Reflect.ownKeys(actual).length !== expected.length + 1) return false;
      return expected.every((item, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(actual, String(index));
        return descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value') && sameData(descriptor.value, item);
      });
    }
    try { exactObject(actual, Object.keys(expected), 'state'); } catch { return false; }
    return Object.keys(expected).every((key) => sameData(actual[key], expected[key]));
  }
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function observation(resolver, atSeconds, policy, coverage) {
    if (resolver === 'cached-b' && coverage === 'missing-b') {
      return {
        resolver, source: 'missing-observation', answer: null, destination: null,
        expiresAtSeconds: null, remainingSeconds: null, usable: null, latencyMs: null, outcome: 'unknown'
      };
    }
    const expiry = resolver === 'cached-a' ? FIXTURE.cacheAExpirySeconds : FIXTURE.cacheBExpirySeconds;
    const old = resolver !== 'fresh' && atSeconds < expiry;
    const usable = !old || policy === 'retain';
    return {
      resolver,
      source: resolver === 'fresh' ? 'fresh-fixed' : old ? 'cached-before-switch' : 'refreshed-fixed',
      answer: old ? FIXTURE.oldAnswer : FIXTURE.newAnswer,
      destination: old ? 'blue' : 'green',
      expiresAtSeconds: resolver === 'fresh' ? null : expiry,
      remainingSeconds: old ? expiry - atSeconds : 0,
      usable,
      latencyMs: usable ? { fresh: 7, 'cached-a': 8, 'cached-b': 9 }[resolver] : 4,
      outcome: usable ? 'success' : 'failure'
    };
  }
  function recordFor(id, policy, sample, coverage, explanation = null) {
    const atSeconds = samples[sample];
    const rows = ['fresh', 'cached-a', 'cached-b'].map((resolver) => observation(resolver, atSeconds, policy, coverage));
    const totals = {
      attempted: rows.length,
      successful: rows.filter((row) => row.outcome === 'success').length,
      interruptions: rows.filter((row) => row.outcome === 'failure').length,
      unknown: rows.filter((row) => row.outcome === 'unknown').length
    };
    const outcome = totals.interruptions ? 'failure' : totals.unknown ? 'unknown' : 'success';
    return {
      id, policy, sample, coverage, atSeconds, rows, totals, outcome,
      answersAgree: totals.unknown ? null : rows.every((row) => row.answer === rows[0].answer),
      convergence: 'not-established',
      explanation: explanation ? {
        outcome: explanation.outcome, reason: explanation.reason,
        verdict: explanation.outcome === outcome && explanation.reason === 'retain-overlap-not-universal' ? 'pass' : 'fail'
      } : null
    };
  }
  function validateState(state) {
    const invalid = () => { throw new TypeError('Invalid state: inconsistent typed fixture or history'); };
    exactObject(state, ['schema', 'runId', 'phase', 'policy', 'current', 'history'], 'state');
    if (state.schema !== 1 || !Number.isSafeInteger(state.runId) || state.runId < 1 || state.runId > LIMITS.runId
        || !['ready', 'switched', 'compared', 'checked'].includes(state.phase)
        || !Array.isArray(state.history) || Object.getPrototypeOf(state.history) !== Array.prototype
        || state.history.length > LIMITS.comparisons
        || Reflect.ownKeys(state.history).length !== state.history.length + 1) invalid();
    let previous = 0;
    for (let index = 0; index < state.history.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(state.history, String(index));
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
      const item = descriptor.value;
      exactObject(item, ['id', 'policy', 'sample', 'coverage', 'atSeconds', 'rows', 'totals',
        'outcome', 'answersAgree', 'convergence', 'explanation'], 'state');
      if (!Number.isSafeInteger(item.id) || item.id <= previous || item.id > state.runId
          || !policies.includes(item.policy) || typeof item.sample !== 'string' || !Object.hasOwn(samples, item.sample)
          || !coverages.includes(item.coverage)) invalid();
      if (item.explanation !== null) {
        exactObject(item.explanation, ['outcome', 'reason', 'verdict'], 'state');
        if (!outcomes.includes(item.explanation.outcome) || !reasons.includes(item.explanation.reason)) invalid();
      }
      if (!sameData(item, recordFor(item.id, item.policy, item.sample, item.coverage, item.explanation))) invalid();
      previous = item.id;
    }
    if (state.phase === 'ready') {
      if (state.policy !== null || state.current !== null || previous >= state.runId) invalid();
    } else {
      if (!policies.includes(state.policy)) invalid();
      if (state.phase === 'switched') {
        if (state.current !== null || previous >= state.runId || state.history.length === LIMITS.comparisons) invalid();
      } else {
        const last = state.history[state.history.length - 1];
        if (!last || last.id !== state.runId || last.policy !== state.policy
            || !sameData(state.current, last)
            || (state.phase === 'compared') !== (last.explanation === null)) invalid();
      }
    }
  }
  function createState() {
    return freeze({ schema: 1, runId: 1, phase: 'ready', policy: null, current: null, history: [] });
  }
  function transition(state, command) {
    validateState(state);
    if (!command || typeof command !== 'object') throw new TypeError('Invalid command');
    const descriptor = Object.getOwnPropertyDescriptor(command, 'type');
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new TypeError('Invalid command type');
    const fields = {
      switch: ['type', 'runId', 'policy'],
      compare: ['type', 'runId', 'sample', 'coverage'],
      explain: ['type', 'runId', 'outcome', 'reason'],
      reset: ['type', 'runId']
    };
    if (typeof descriptor.value !== 'string' || !Object.hasOwn(fields, descriptor.value)) throw new TypeError('Invalid command type');
    exactObject(command, fields[descriptor.value], 'command');
    if (!Number.isSafeInteger(command.runId) || command.runId < 1 || command.runId > LIMITS.runId) throw new TypeError('Invalid run token');
    if (command.runId !== state.runId) throw new Error('Stale run token; reset controls and use the current rehearsal');
    const history = state.history.map((item) => recordFor(item.id, item.policy, item.sample, item.coverage, item.explanation));
    const next = { ...state, history, current: state.current ? history[history.length - 1] : null };
    if (command.type === 'reset') {
      if (state.runId === LIMITS.runId) throw new RangeError('Reset token limit reached; reload deliberately to clear memory');
      return freeze({ ...next, runId: state.runId + 1, phase: 'ready', policy: null, current: null });
    }
    const required = { switch: 'ready', compare: 'switched', explain: 'compared' };
    if (state.phase !== required[command.type]) throw new Error(`Invalid phase: ${command.type} requires ${required[command.type]}`);
    if (command.type === 'switch') {
      choice(command.policy, policies, 'retention policy');
      if (history.length >= LIMITS.comparisons) throw new RangeError('Comparison limit reached; history is retained');
      next.phase = 'switched';
      next.policy = command.policy;
    } else if (command.type === 'compare') {
      choice(command.sample, Object.keys(samples), 'sample time');
      choice(command.coverage, coverages, 'observation coverage');
      const record = recordFor(state.runId, state.policy, command.sample, command.coverage);
      next.history.push(record);
      next.current = record;
      next.phase = 'compared';
    } else {
      choice(command.outcome, outcomes, 'predicted outcome');
      choice(command.reason, reasons, 'convergence explanation');
      const record = recordFor(state.runId, state.policy, state.current.sample, state.current.coverage, command);
      next.history[next.history.length - 1] = record;
      next.current = record;
      next.phase = 'checked';
    }
    return freeze(next);
  }
  function summary(state) {
    validateState(state);
    return freeze(state.history.reduce((total, item) => ({
      runs: total.runs + 1,
      attempted: total.attempted + item.totals.attempted,
      successful: total.successful + item.totals.successful,
      interruptions: total.interruptions + item.totals.interruptions,
      unknown: total.unknown + item.totals.unknown
    }), { runs: 0, attempted: 0, successful: 0, interruptions: 0, unknown: 0 }));
  }
  return Object.freeze({ BANNER, LIMITS, FIXTURE, createState, transition, summary });
}));
