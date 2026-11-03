(function (root, factory) {
  'use strict';
  const fixture = typeof module === 'object' && module.exports ? require('./fixture.js') : root.S071Fixture;
  const api = factory(fixture);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S071Model = api;
}(typeof globalThis === 'object' ? globalThis : this, function (fixture) {
  'use strict';
  const issued = new WeakSet();
  class GuardError extends Error {
    constructor(message, field = null) {
      super(message);
      this.name = 'GuardError';
      this.code = 'ERR_S071_GUARD';
      this.field = field;
    }
  }
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function issue(value) {
    freeze(value);
    issued.add(value);
    return value;
  }
  function guard(state, phase) {
    if (!state || !issued.has(state)) throw new GuardError('Use an authentic rehearsal state.');
    if (phase && state.phase !== phase) throw new GuardError(`This action requires phase ${phase}; current phase is ${state.phase}.`);
  }
  function configuration(input) {
    const keys = ['targetCapacity', 'payloadMode', 'resizeMode', 'coverage', 'budgetMs'];
    if (!input || Object.getPrototypeOf(input) !== Object.prototype
        || Reflect.ownKeys(input).length !== keys.length
        || keys.some((key) => !Object.hasOwn(input, key))) {
      throw new GuardError('Supply exactly the five declared configuration fields.');
    }
    for (const key of keys) {
      if (!Object.hasOwn(Object.getOwnPropertyDescriptor(input, key), 'value')) {
        throw new GuardError('Configuration fields must be plain data, not accessors.', key);
      }
    }
    const allowed = {
      targetCapacity: [8, 12], payloadMode: ['breaking', 'compatible'],
      resizeMode: ['continuous', 'gap', 'unsupported', 'unverified'],
      coverage: ['all', 'new-only', 'none'],
    };
    for (const [field, values] of Object.entries(allowed)) {
      if (!values.includes(input[field])) throw new GuardError(`Invalid ${field}; use a listed option.`, field);
    }
    if (!Number.isSafeInteger(input.budgetMs) || input.budgetMs < 20
        || input.budgetMs > 120 || input.budgetMs % 10 !== 0) {
      throw new GuardError('Journey budget must be an integer from 20 to 120 ms in steps of 10.', 'budgetMs');
    }
    return freeze(Object.fromEntries(keys.map((key) => [key, input[key]])));
  }
  function createRehearsal() {
    return issue({ phase: 'configuring', attempt: 1, history: [], config: null, operation: null, result: null });
  }
  function resizeCache(state, input) {
    guard(state, 'configuring');
    const config = configuration(input);
    const status = config.resizeMode === 'unsupported' ? 'REJECTED'
      : config.resizeMode === 'unverified' ? 'UNKNOWN' : 'APPLIED';
    const description = {
      continuous: 'Modeled continuous access; no native platform support is inferred.',
      gap: 'Modeled six-operation access gap during resize; later recovery cannot erase failures.',
      unsupported: 'Fixture rejects resize as unsupported. Target capacity was not applied.',
      unverified: 'Resize capability is unverified. Target capacity and later observations are unknown.',
    }[config.resizeMode];
    return issue({
      ...state, phase: 'resized', config,
      operation: {
        status, requestedCapacity: config.targetCapacity,
        appliedCapacity: status === 'APPLIED' ? config.targetCapacity : null,
        baselineCapacity: fixture.BASE_CAPACITY, description,
      },
    });
  }
  function encode(client, mode) {
    const profile = fixture.PROFILE;
    return JSON.stringify(client === 'v2' && mode === 'breaking'
      ? { schema: 2, profile: { displayName: profile.name }, cart: { count: profile.cartCount } }
      : { schema: 1, name: profile.name, cartCount: profile.cartCount });
  }
  function decode(client, raw) {
    const data = JSON.parse(raw);
    if (data.schema === 1 && typeof data.name === 'string' && Number.isInteger(data.cartCount)) {
      return { name: data.name, cartCount: data.cartCount };
    }
    if (client === 'v2' && data.schema === 2 && typeof data.profile?.displayName === 'string'
        && Number.isInteger(data.cart?.count)) {
      return { name: data.profile.displayName, cartCount: data.cart.count };
    }
    return null;
  }
  function phaseRows(phase, capacity, config) {
    const cache = new Map();
    const rows = [];
    for (const writer of ['v1', 'v2']) {
      for (const [operation, client] of [['write', writer], ['read', 'v1'], ['read', 'v2']]) {
        const reachable = !(phase === 'during' && config.resizeMode === 'gap');
        const latencyMs = fixture.BASE_MS
          + Math.max(0, fixture.DEMAND_UNITS - capacity) * fixture.QUEUE_MS_PER_UNIT;
        const reasons = [];
        let payloadStatus = reachable ? 'PASS' : 'UNKNOWN';
        let returnedProfile = null;
        let payloadJSON = null;
        if (!reachable) reasons.push('CACHE_UNAVAILABLE: resize-window access failed.');
        else if (operation === 'write') {
          payloadJSON = encode(client, config.payloadMode);
          cache.set('profile', payloadJSON);
        } else {
          payloadJSON = cache.get('profile');
          returnedProfile = decode(client, payloadJSON);
          if (!returnedProfile || returnedProfile.name !== fixture.PROFILE.name
              || returnedProfile.cartCount !== fixture.PROFILE.cartCount) {
            payloadStatus = 'FAIL';
            reasons.push(`PAYLOAD_INCOMPATIBLE: ${client} cannot preserve the required profile from schema ${JSON.parse(payloadJSON).schema}.`);
          }
        }
        const budgetStatus = latencyMs <= config.budgetMs ? 'PASS' : 'FAIL';
        if (budgetStatus === 'FAIL') reasons.push(`JOURNEY_BUDGET: ${latencyMs} ms exceeds original ${config.budgetMs} ms.`);
        rows.push({
          id: `${phase}:${rows.length + 1}`, phase, operation, client, writer, capacity,
          latencyMs, budgetMs: config.budgetMs, accessStatus: reachable ? 'PASS' : 'FAIL',
          payloadStatus, budgetStatus, payloadJSON, returnedProfile,
          outcome: reasons.length ? 'FAIL' : 'PASS', reasons,
        });
      }
    }
    return rows;
  }
  function evaluate(state) {
    const { config, operation } = state;
    const phases = operation.status === 'APPLIED' ? ['before', 'during', 'after'] : ['before'];
    const allRows = phases.flatMap((phase) =>
      phaseRows(phase, phase === 'before' ? fixture.BASE_CAPACITY : operation.appliedCapacity, config));
    const rows = allRows.filter((row) => config.coverage === 'all'
      || (config.coverage === 'new-only' && row.client === 'v2'));
    const count = (predicate) => rows.filter(predicate).length;
    const metrics = {
      expected: fixture.EXPECTED_OPERATIONS, observed: rows.length,
      succeeded: count((row) => row.outcome === 'PASS'),
      failed: count((row) => row.outcome === 'FAIL'),
      missing: fixture.EXPECTED_OPERATIONS - rows.length,
      payloadFailures: count((row) => row.payloadStatus === 'FAIL'),
      accessFailures: count((row) => row.accessStatus === 'FAIL'),
      budgetFailures: count((row) => row.budgetStatus === 'FAIL'),
    };
    const worst = (phase) => {
      const observed = rows.filter((row) => row.phase === phase);
      return observed.length ? Math.max(...observed.map((row) => row.latencyMs)) : null;
    };
    const reasons = [];
    if (operation.status === 'REJECTED') reasons.push('Resize unsupported: requested capacity was not applied.');
    if (operation.status === 'UNKNOWN') reasons.push('Resize capability unverified: no later capacity or access evidence.');
    if (metrics.payloadFailures) reasons.push(`${metrics.payloadFailures} incompatible payload read(s); capacity cannot repair schema.`);
    if (metrics.accessFailures) reasons.push(`${metrics.accessFailures} failed cache access(es), retained after recovery.`);
    if (metrics.budgetFailures) reasons.push(`${metrics.budgetFailures} operation(s) exceeded the original journey budget.`);
    if (metrics.missing) reasons.push(`${metrics.missing} of ${metrics.expected} required observations missing; no mixed-client success proof.`);
    const gate = operation.status === 'REJECTED' || metrics.failed ? 'FAIL'
      : operation.status !== 'APPLIED' || metrics.missing ? 'UNKNOWN' : 'PASS';
    if (gate === 'PASS') reasons.push('All modeled mixed-client accesses, payloads and original journey budgets passed.');
    return {
      synthetic: true, gate, metrics, rows, reasons,
      comparison: {
        baselineCapacity: fixture.BASE_CAPACITY, requestedCapacity: config.targetCapacity,
        appliedCapacity: operation.appliedCapacity,
        beforeWorstMs: worst('before'), afterWorstMs: worst('after'),
        beforePayloadFailures: count((row) => row.phase === 'before' && row.payloadStatus === 'FAIL'),
        afterPayloadFailures: count((row) => row.phase === 'after' && row.payloadStatus === 'FAIL'),
      },
      trace: [
        `Demand ${fixture.DEMAND_UNITS} units; original budget ${config.budgetMs} ms. No retry resets this budget.`,
        `Resize ${fixture.BASE_CAPACITY} -> ${config.targetCapacity} units: ${operation.status}. ${operation.description}`,
        'Each phase interleaves v1 write, v1/v2 reads, v2 write, v1/v2 reads on the same synthetic key.',
        `Coverage ${config.coverage}: ${metrics.observed}/${metrics.expected} observations, ${metrics.failed} failed.`,
        ...reasons,
      ],
    };
  }
  function probeMixedTraffic(state) {
    guard(state, 'resized');
    const result = evaluate(state);
    const record = { attempt: state.attempt, config: state.config, operation: state.operation, result };
    return issue({ ...state, phase: 'observed', result, history: [...state.history, record] });
  }
  function newAttempt(state) {
    guard(state, 'observed');
    if (state.history.length >= fixture.MAX_ATTEMPTS) throw new GuardError('Six attempts retained; reset before another attempt.');
    return issue({
      phase: 'configuring', attempt: state.attempt + 1, history: state.history,
      config: null, operation: null, result: null,
    });
  }
  function resetRehearsal(state) {
    guard(state);
    return createRehearsal();
  }
  return Object.freeze({
    GuardError, createRehearsal, resizeCache, probeMixedTraffic, newAttempt, resetRehearsal,
  });
}));
