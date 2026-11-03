(function (root) {
  'use strict';
  const DEFAULTS = Object.freeze({
    frontendInstances: 2, apiInstances: 3, frontendPool: 10, apiPool: 20,
    connectionLimit: 120, journeyBudget: 300, observation: 'complete',
  });
  const MAX_ATTEMPTS = 6;
  const ranges = Object.freeze({
    frontendInstances: [1, 8], apiInstances: [1, 8],
    frontendPool: [1, 40], apiPool: [1, 40],
    connectionLimit: [1, 640], journeyBudget: [80, 2000],
  });
  const configKeys = [...Object.keys(ranges), 'observation'];

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function record(value, keys, label) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype
        || Reflect.ownKeys(value).length !== keys.length
        || !keys.every((key) => {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable;
        })) throw new TypeError(`Invalid ${label}: expected exactly ${keys.join(', ')}.`);
  }

  function parseConfig(input, allowStrings = true) {
    record(input, configKeys, 'configuration input');
    const config = {};
    for (const [key, [minimum, maximum]] of Object.entries(ranges)) {
      let value = input[key];
      if (allowStrings && typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) value = Number(value);
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || Object.is(value, -0)) {
        throw new TypeError(`Invalid input ${key}: use a canonical integer.`);
      }
      if (value < minimum || value > maximum) throw new RangeError(`Input ${key} range is ${minimum}..${maximum}.`);
      config[key] = value;
    }
    if (!['complete', 'withhold-scaled'].includes(input.observation)) throw new TypeError('Invalid observation preset.');
    if (config.frontendInstances === 1 && config.apiInstances === 1) {
      throw new RangeError('Scale out at least one tier beyond its one-instance baseline.');
    }
    return freeze({ ...config, observation: input.observation });
  }

  function emptySample(checkpoint) {
    return {
      checkpoint, frontendInstances: null, apiInstances: null, frontendPool: null, apiPool: null,
      frontendConnections: null, apiConnections: null, demand: null, connectionLimit: null,
      accepted: null, refused: null, headroom: null, latencyMs: null, journeyBudget: null,
      outcome: 'unknown', observed: false, pending: true, forecast: 'unconfigured', reason: 'Pending checkpoint.',
    };
  }

  function measure(config, checkpoint, pending = false) {
    const frontendInstances = checkpoint === 'baseline' ? 1 : config.frontendInstances;
    const apiInstances = checkpoint === 'baseline' ? 1 : config.apiInstances;
    const frontendConnections = frontendInstances * config.frontendPool;
    const apiConnections = apiInstances * config.apiPool;
    const demand = frontendConnections + apiConnections;
    const observed = !pending && !(checkpoint === 'scaled' && config.observation === 'withhold-scaled');
    const refused = observed ? Math.max(0, demand - config.connectionLimit) : null;
    const latencyMs = observed
      ? 80 + 2 * Math.ceil(100 * demand / config.connectionLimit) + (refused > 0 ? 200 : 0) : null;
    const failures = [];
    if (refused > 0) failures.push('connection exhaustion');
    if (observed && latencyMs > config.journeyBudget) failures.push('journey latency over budget');
    return {
      checkpoint, frontendInstances, apiInstances, frontendPool: config.frontendPool, apiPool: config.apiPool,
      frontendConnections, apiConnections, demand, connectionLimit: config.connectionLimit,
      accepted: observed ? Math.min(demand, config.connectionLimit) : null,
      refused, headroom: observed ? config.connectionLimit - demand : null,
      latencyMs, journeyBudget: config.journeyBudget,
      outcome: observed ? (failures.length ? 'failure' : 'success') : 'unknown',
      observed, pending, forecast: demand > config.connectionLimit ? 'over-limit' : 'within-limit',
      reason: pending ? 'Pending checkpoint.' : !observed ? 'Scaled telemetry deliberately withheld.'
        : failures.length ? failures.join(' + ') : 'Connections and journey latency within declared budgets.',
    };
  }

  function summarize(samples) {
    const metrics = {
      attempted: samples.filter((item) => !item.pending).length,
      success: samples.filter((item) => item.outcome === 'success').length,
      failure: samples.filter((item) => item.outcome === 'failure').length,
      unknown: samples.filter((item) => item.outcome === 'unknown').length,
      pending: samples.filter((item) => item.pending).length,
    };
    const outcome = metrics.failure ? 'failure' : metrics.success === 2 ? 'success' : 'unknown';
    return { outcome, metrics };
  }

  function replay(state) {
    record(state, ['schemaVersion', 'journal'], 'state');
    const journal = state.journal;
    if (state.schemaVersion !== 1) throw new TypeError('Invalid state schema version.');
    if (!Array.isArray(journal) || Object.getPrototypeOf(journal) !== Array.prototype
        || journal.length > 3 * MAX_ATTEMPTS - 1
        || Reflect.ownKeys(journal).length !== journal.length + 1
        || !Array.from({ length: journal.length }, (_, index) => {
          const descriptor = Object.getOwnPropertyDescriptor(journal, String(index));
          return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable;
        }).every(Boolean)) throw new TypeError('Invalid journal: expected a dense bounded action array.');
    let phase = 'draft';
    let config = null;
    let samples = ['baseline', 'scaled'].map(emptySample);
    const history = [];
    for (const event of journal) {
      record(event, event?.action === 'baseline' ? ['action', 'config'] : ['action'], 'journal event');
      if (event.action === 'baseline') {
        if (phase !== 'draft') throw new Error('Invalid phase: baseline requires a draft attempt.');
        config = parseConfig(event.config, false);
        samples = [measure(config, 'baseline'), measure(config, 'scaled', true)];
        phase = 'baseline';
      } else if (event.action === 'scale') {
        if (phase !== 'baseline') throw new Error('Invalid phase: scale requires a baseline observation.');
        samples = [samples[0], measure(config, 'scaled')];
        phase = 'complete';
        history.push({ attempt: history.length + 1, config, samples, ...summarize(samples) });
      } else if (event.action === 'again') {
        if (phase !== 'complete') throw new Error('Invalid phase: finish the current attempt first.');
        if (history.length >= MAX_ATTEMPTS) throw new RangeError('History limit is six attempts; reset explicitly, no eviction.');
        config = null;
        samples = ['baseline', 'scaled'].map(emptySample);
        phase = 'draft';
      } else throw new Error('Invalid journal action.');
    }
    return {
      phase, config, attempt: history.length + (phase === 'complete' ? 0 : 1),
      samples, history, ...summarize(samples),
    };
  }

  const createState = () => freeze({ schemaVersion: 1, journal: [] });
  const inspect = (state) => freeze(replay(state));
  function transition(state, action, input) {
    const view = replay(state);
    if (!['baseline', 'scale', 'again', 'reset'].includes(action)) throw new Error('Unknown action.');
    if (action !== 'baseline' && input !== undefined) throw new TypeError('Unexpected action payload.');
    if (action === 'reset') return createState();
    if (action === 'baseline' && view.phase !== 'draft') throw new Error('Invalid phase: baseline requires a draft attempt.');
    if (action === 'again' && view.phase === 'complete' && view.history.length >= MAX_ATTEMPTS) {
      throw new RangeError('History limit is six attempts; reset explicitly, no eviction.');
    }
    const event = action === 'baseline' ? { action, config: parseConfig(input) } : { action };
    const journal = state.journal.map((item) => item.action === 'baseline'
      ? { action: item.action, config: parseConfig(item.config, false) } : { action: item.action });
    const next = { schemaVersion: 1, journal: [...journal, event] };
    replay(next);
    return freeze(next);
  }
  const api = Object.freeze({ DEFAULTS, MAX_ATTEMPTS, parseConfig, createState, transition, inspect });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ConnectionPoolsLesson = api;
}(typeof globalThis === 'object' ? globalThis : this));
