(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HotPartitionLesson = factory();
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const LABEL = 'Training rehearsal - synthetic data - not a live Azure result';
  const OPTIONS = freeze({
    routing: ['coordinated', 'gap', 'stale'],
    ownership: ['exclusive', 'overlap'],
    data: ['current', 'behind'],
    coverage: ['complete', 'partial', 'none'],
  });
  const PHASES = Object.freeze(['before', 'cutover', 'after']);
  const LIMITS = Object.freeze({ attempts: 6, phases: 3, operationsPerPhase: 4, configurations: 36 });

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function validateConfig(input) {
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype) {
      throw new TypeError('Choose an exact lesson configuration, not an endpoint or arbitrary object.');
    }
    const keys = Reflect.ownKeys(input);
    if (keys.length !== Object.keys(OPTIONS).length
        || keys.some((key) => typeof key !== 'string' || !Object.hasOwn(OPTIONS, key))) {
      throw new TypeError('Configuration must contain only routing, ownership, data and coverage.');
    }
    const config = {};
    for (const [key, choices] of Object.entries(OPTIONS)) {
      const field = Object.getOwnPropertyDescriptor(input, key);
      if (!field || !Object.hasOwn(field, 'value') || !field.enumerable
          || typeof field.value !== 'string' || !choices.includes(field.value)) {
        throw new TypeError(`Invalid ${key}; choose one of: ${choices.join(', ')}.`);
      }
      config[key] = field.value;
    }
    return freeze(config);
  }

  function simulate(input) {
    const config = validateConfig(input);
    const stores = { 'shard-old': ['H0'], 'shard-new': ['H0'], 'shard-cold': ['C0'] };
    const acknowledged = { HOT: ['H0'], COLD: ['C0'] };
    const trace = [];

    for (const [index, phase] of PHASES.entries()) {
      if (index === 1) {
        stores['shard-new'] = config.data === 'current' ? [...acknowledged.HOT] : ['H0'];
      }
      const activeOwners = index === 0 ? ['shard-old']
        : index === 1 && config.ownership === 'overlap' ? ['shard-old', 'shard-new'] : ['shard-new'];
      const hotRoute = index === 0 ? 'shard-old'
        : config.routing === 'stale' ? 'shard-old'
          : index === 1 && config.routing === 'gap' ? null : 'shard-new';
      const operations = [];

      for (const partition of ['HOT', 'COLD']) {
        const prefix = partition === 'HOT' ? 'H' : 'C';
        const destination = partition === 'HOT' ? hotRoute : 'shard-cold';
        const owners = partition === 'HOT' ? activeOwners : ['shard-cold'];
        for (const kind of ['write', 'read']) {
          const operation = {
            id: `${prefix}-${kind === 'write' ? 'W' : 'R'}${index + 1}`,
            partition, kind, destination,
            required: [...acknowledged[partition]],
            received: null, missing: [], outcome: 'failure', reason: null,
          };
          if (!destination) operation.reason = 'routing-gap';
          else if (!owners.includes(destination)) operation.reason = 'fenced-former-owner';
          else if (kind === 'write') {
            const effect = `${prefix}${index + 1}`;
            stores[destination].push(effect);
            acknowledged[partition].push(effect);
            operation.effect = effect;
            operation.outcome = 'success';
            operation.reason = 'acknowledged';
          } else {
            operation.received = [...stores[destination]];
            operation.missing = operation.required.filter((effect) => !operation.received.includes(effect));
            operation.outcome = operation.missing.length ? 'failure' : 'success';
            operation.reason = operation.missing.length ? 'missing-committed-effects' : 'read-preserved';
          }
          operations.push(operation);
        }
      }
      const observed = config.coverage === 'complete' || (config.coverage === 'partial' && index !== 1);
      trace.push(observed ? {
        phase, observed: true, attemptedOperations: 4, hotRoute, coldRoute: 'shard-cold',
        expectedHotOwner: index === 0 ? 'shard-old' : 'shard-new',
        activeOwners, ownerEpochs: activeOwners.map((owner) => ({ owner, epoch: owner === 'shard-old' ? 7 : 8 })),
        acknowledgedHotEffects: [...acknowledged.HOT], operations,
      } : {
        phase, observed: false, attemptedOperations: 4, hotRoute: null, coldRoute: null,
        expectedHotOwner: null, activeOwners: null, ownerEpochs: null,
        acknowledgedHotEffects: null, operations: [],
      });
    }

    const observed = trace.filter((phase) => phase.observed);
    const operations = observed.flatMap((phase) => phase.operations);
    const metrics = {
      attemptedOperations: 12,
      observedOperations: operations.length,
      successfulOperations: operations.filter((operation) => operation.outcome === 'success').length,
      failedOperations: operations.filter((operation) => operation.outcome === 'failure').length,
      unknownOperations: 12 - operations.length,
      observedPhases: observed.length,
      routingGapPhases: observed.filter((phase) => phase.hotRoute === null).length,
      staleRoutePhases: observed.filter((phase) => phase.hotRoute !== null
        && phase.hotRoute !== phase.expectedHotOwner).length,
      dualOwnerPhases: observed.filter((phase) => phase.activeOwners.length > 1).length,
      missingCommittedEffects: [...new Set(operations.flatMap((operation) => operation.missing))].sort(),
      movedHotOperations: operations.filter((operation) => operation.partition === 'HOT'
        && operation.destination === 'shard-new' && operation.outcome === 'success').length,
      coldSuccessfulOperations: operations.filter((operation) => operation.partition === 'COLD'
        && operation.outcome === 'success').length,
    };
    const reasons = [];
    if (metrics.routingGapPhases) reasons.push('Observed hot routing gap.');
    if (metrics.staleRoutePhases) reasons.push('Observed stale hot route after ownership transfer.');
    if (metrics.dualOwnerPhases) reasons.push('Observed simultaneous active hot owners.');
    if (metrics.missingCommittedEffects.length) {
      reasons.push(`Missing acknowledged effects: ${metrics.missingCommittedEffects.join(', ')}.`);
    }
    if (metrics.failedOperations) reasons.push(`${metrics.failedOperations} observed operations failed.`);
    if (!metrics.unknownOperations && !metrics.movedHotOperations) reasons.push('No successful hot target exposure.');
    const verdict = reasons.length ? 'failure' : metrics.unknownOperations ? 'unknown' : 'success';
    if (metrics.unknownOperations) reasons.push(`${metrics.unknownOperations} operations lack observations.`);
    if (verdict === 'success') reasons.push('Complete synthetic observations preserve hot effects, routing and one owner.');
    return freeze({
      sourceId: 'S065', mode: 'synthetic', nativeQualified: false, config, trace, verdict, metrics, reasons,
      userImpact: verdict === 'success' ? 'Uninterrupted in this synthetic trace'
        : verdict === 'failure' ? 'Interrupted or unsafe in this synthetic trace' : 'Unverified synthetic transition',
      cleanup: 'No resources created; attempt evidence remains in memory until reset or reload.',
    });
  }

  function createSession() {
    let status = 'ready';
    let current = null;
    let pending = null;
    let history = [];

    function guard(condition, message) {
      if (!condition) {
        const error = new Error(message);
        error.code = 'ERR_LESSON_STATE';
        throw error;
      }
    }

    function snapshot() {
      return freeze(copy({ status, current, history, completedAttempts: history.length, limit: LIMITS.attempts }));
    }

    return Object.freeze({
      snapshot,
      start(input) {
        guard(status === 'ready', 'Start requires a new, ready attempt.');
        guard(history.length < LIMITS.attempts, 'Six attempts retained; explicitly reset to start again.');
        const result = simulate(input);
        pending = result;
        current = { id: history.length + 1, config: result.config, trace: [], result: null };
        status = 'running';
        return snapshot();
      },
      step() {
        guard(status === 'running', 'Observe requires a running attempt with an unobserved phase.');
        current.trace.push(pending.trace[current.trace.length]);
        if (current.trace.length === LIMITS.phases) {
          const { trace, config, ...result } = pending;
          current.result = result;
          history.push(freeze(copy(current)));
          pending = null;
          status = 'complete';
        }
        return snapshot();
      },
      newAttempt() {
        guard(status === 'complete', 'Finish the current attempt before starting another.');
        guard(history.length < LIMITS.attempts, 'Six attempts retained; explicitly reset to start again.');
        current = null;
        status = 'ready';
        return snapshot();
      },
      reset() {
        current = null;
        pending = null;
        history = [];
        status = 'ready';
        return snapshot();
      },
    });
  }

  return Object.freeze({ LABEL, OPTIONS, PHASES, LIMITS, validateConfig, simulate, createSession });
}));
