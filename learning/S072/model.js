(function (root) {
  'use strict';

  const DEFAULTS = Object.freeze({
    strategy: 'unbounded',
    requests: 8,
    keys: 1,
    dbCapacity: 2,
    refillMs: 40,
    budgetMs: 100,
    refillLimit: 2,
    observation: 'complete',
  });
  const MAX_RUNS = 12;
  const sessions = new WeakSet();
  const bounds = {
    requests: [1, 24],
    keys: [1, 6],
    dbCapacity: [1, 8],
    refillMs: [1, 200],
    budgetMs: [1, 1000],
    refillLimit: [1, 8],
  };

  function invalid(field, message) {
    const error = new TypeError(`Invalid ${field || 'configuration'}: ${message}`);
    error.field = field;
    throw error;
  }

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function validateConfig(input) {
    const fields = Object.keys(DEFAULTS);
    if (!input || Object.getPrototypeOf(input) !== Object.prototype
        || Reflect.ownKeys(input).length !== fields.length
        || !fields.every((field) => Object.hasOwn(input, field))) {
      invalid(null, 'provide exactly the declared lesson fields');
    }
    if (!['unbounded', 'coalesced', 'bounded'].includes(input.strategy)) invalid('strategy', 'choose a declared refill strategy');
    if (!['complete', 'missing-one'].includes(input.observation)) invalid('observation', 'choose a declared observation mode');
    for (const [field, [min, max]] of Object.entries(bounds)) {
      if (!Number.isSafeInteger(input[field]) || input[field] < min || input[field] > max) {
        invalid(field, `use a whole number from ${min} to ${max}`);
      }
    }
    if (input.keys > input.requests) invalid('keys', 'cold keys cannot exceed requests');
    if (input.strategy === 'bounded' && input.refillLimit > input.dbCapacity) {
      invalid('refillLimit', 'refillLimit must not exceed dbCapacity in the bounded queue');
    }
    return freeze(Object.fromEntries(fields.map((field) => [field, input[field]])));
  }

  function simulate(input) {
    const config = validateConfig(input);
    const { strategy, requests, keys, dbCapacity, refillMs, budgetMs, refillLimit, observation } = config;
    const count = strategy === 'unbounded' ? requests : keys;
    const width = strategy === 'bounded' ? refillLimit : count;
    const refills = Array.from({ length: count }, (_, index) => {
      const startMs = strategy === 'bounded' ? Math.floor(index / width) * refillMs : 0;
      const accepted = index % width < dbCapacity;
      return {
        id: index + 1, key: index % keys + 1, startMs,
        endMs: accepted ? startMs + refillMs : startMs,
        status: accepted ? 'completed' : 'overload',
      };
    });
    const journeys = Array.from({ length: requests }, (_, index) => {
      const key = index % keys + 1;
      const refill = refills[strategy === 'unbounded' ? index : key - 1];
      const overload = refill.status === 'overload';
      const late = refill.endMs > budgetMs;
      return {
        id: index + 1, key, refillId: refill.id, refillStartMs: refill.startMs,
        latencyMs: refill.endMs,
        outcome: overload || late ? 'failure' : 'success',
        reason: overload ? 'database-overload' : late ? 'latency-budget' : 'within-budget',
        value: overload ? null : `synthetic-profile-${key}-v1`,
      };
    });
    if (observation === 'missing-one') {
      // Missing evidence never overwrites an already-known interruption.
      const missing = journeys.findLast((journey) => journey.outcome === 'success');
      if (missing) {
        missing.latencyMs = null;
        missing.outcome = 'unknown';
        missing.reason = 'missing-latency';
      }
    }
    const counts = { attempted: requests, success: 0, failure: 0, unknown: 0 };
    journeys.forEach((journey) => { counts[journey.outcome] += 1; });
    const measured = journeys.map((journey) => journey.latencyMs).filter((value) => value !== null);
    const rejected = refills.filter((refill) => refill.status === 'overload').length;
    return freeze({
      config, refills, journeys, counts,
      data: { attempted: count, accepted: count - rejected, rejected, peakActive: Math.min(width, count, dbCapacity) },
      maxObservedLatencyMs: measured.length ? Math.max(...measured) : null,
      stampede: rejected > 0,
      verdict: counts.failure ? 'failure' : counts.unknown ? 'unknown' : 'success',
    });
  }

  function makeSession(history) {
    const totals = { attempted: 0, success: 0, failure: 0, unknown: 0 };
    history.forEach(({ result }) => {
      Object.keys(totals).forEach((key) => { totals[key] += result.counts[key]; });
    });
    const session = freeze({ history, totals });
    sessions.add(session);
    return session;
  }

  function assertSession(session) {
    if (!session || !sessions.has(session)) throw new TypeError('Invalid lesson session; use Reset to start a new session.');
  }

  function createSession() {
    return makeSession([]);
  }

  function runBurst(session, input) {
    assertSession(session);
    if (session.history.length >= MAX_RUNS) throw new RangeError('12 runs retained. Reset explicitly before another burst.');
    const result = simulate(input);
    const next = makeSession([...session.history, { id: session.history.length + 1, result }]);
    sessions.delete(session);
    return next;
  }

  function resetSession(session) {
    assertSession(session);
    const next = createSession();
    sessions.delete(session);
    return next;
  }

  const api = Object.freeze({ DEFAULTS, MAX_RUNS, validateConfig, simulate, createSession, runBurst, resetSession });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S072 = api;
}(typeof globalThis === 'object' ? globalThis : this));
