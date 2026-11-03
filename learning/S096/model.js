(function (root) {
  'use strict';

  const MAX_RUNS = 6;
  const states = new WeakSet();

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  const limits = freeze({
    productionWorkers: [1, 3],
    candidateWorkers: [1, 3],
    slots: [1, 4],
    productionDemand: [1, 250],
    warmDemand: [1, 80],
    dependencyCapacity: [1, 300],
    journeyBudgetMs: [1, 500],
    warmupBudgetMs: [1, 500],
  });
  const defaults = freeze({
    topology: 'shared',
    productionWorkers: 1,
    candidateWorkers: 1,
    slots: 2,
    productionDemand: 70,
    warmDemand: 40,
    dependencyCapacity: 100,
    journeyBudgetMs: 120,
    warmupBudgetMs: 160,
    coverage: 'complete',
  });

  function reject(code, message, field = null) {
    const error = new Error(message);
    error.code = code;
    error.field = field;
    throw error;
  }

  function owned(state) {
    if (!states.has(state)) reject('ERR_STATE', 'Only an immutable state created by this lesson is accepted.');
  }

  function stateOf(phase, history, current) {
    const state = freeze({ phase, history, current });
    states.add(state);
    return state;
  }

  function createState() {
    return stateOf('ready', [], null);
  }

  function validate(input) {
    if (!input || Object.getPrototypeOf(input) !== Object.prototype) {
      reject('ERR_INPUT', 'Expected a plain, complete configuration.');
    }
    const keys = Reflect.ownKeys(input);
    const expected = Object.keys(defaults);
    if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
      reject('ERR_INPUT', 'Missing or unknown configuration fields.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    for (const key of expected) {
      if (!descriptors[key] || !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable) {
        reject('ERR_INPUT', 'Configuration fields must be ordinary data values.', key);
      }
    }
    for (const [key, [minimum, maximum]] of Object.entries(limits)) {
      if (!Number.isSafeInteger(input[key]) || input[key] < minimum || input[key] > maximum) {
        reject('ERR_INPUT', `${key} must be an integer from ${minimum} to ${maximum}.`, key);
      }
    }
    if (!['shared', 'separate'].includes(input.topology)) reject('ERR_INPUT', 'Unknown plan placement.', 'topology');
    if (!['complete', 'missing-capacity', 'missing-journeys', 'missing-warmup'].includes(input.coverage)) {
      reject('ERR_INPUT', 'Unknown observation coverage.', 'coverage');
    }
    return Object.fromEntries(expected.map((key) => [key, input[key]]));
  }

  function gate(outcomes, success) {
    if (outcomes.some((outcome) => outcome !== success && outcome !== 'unknown')) return 'fail';
    return outcomes.includes('unknown') ? 'unknown' : 'pass';
  }

  function measure(config, sequence) {
    const separate = config.topology === 'separate';
    const capacityObserved = config.coverage !== 'missing-capacity';
    const productionCapacity = config.productionWorkers * 100;
    const candidateCapacity = separate ? config.candidateWorkers * 100 : 0;
    const warmingDemand = config.slots * config.warmDemand;
    const productionPlanDemand = config.productionDemand + (separate ? 0 : warmingDemand);
    const productionHeadroom = productionCapacity - productionPlanDemand;
    const candidateHeadroom = separate ? candidateCapacity - warmingDemand : null;
    const dependencyDemand = 40 + config.slots * 20;
    const dependencyHeadroom = config.dependencyCapacity - dependencyDemand;
    const productionPressure = Math.max(0, -productionHeadroom);
    const warmingPressure = separate ? Math.max(0, -candidateHeadroom) : productionPressure;
    const dependencyPressure = Math.max(0, -dependencyHeadroom);
    const computeGate = capacityObserved
      ? (productionHeadroom >= 0 && (!separate || candidateHeadroom >= 0) ? 'pass' : 'fail')
      : 'unknown';
    const dependencyGate = capacityObserved ? (dependencyHeadroom >= 0 ? 'pass' : 'fail') : 'unknown';
    const productionTrace = [0, 4, 8, 12].map((offset, index) => {
      const observed = config.coverage !== 'missing-journeys';
      const latencyMs = observed ? 80 + 2 * (productionPressure + dependencyPressure) + offset : null;
      return {
        journey: `production-${index + 1}`,
        httpStatus: observed ? 200 : null,
        version: observed ? 'production-v1' : null,
        retainedState: observed ? true : null,
        effectCount: observed ? 1 : null,
        enteredCandidate: false,
        latencyMs,
        budgetMs: config.journeyBudgetMs,
        outcome: !observed ? 'unknown' : latencyMs <= config.journeyBudgetMs ? 'successful' : 'interrupted',
      };
    });
    const warmTrace = Array.from({ length: config.slots }, (_, index) => {
      const observed = config.coverage !== 'missing-warmup';
      const latencyMs = observed ? 100 + 2 * (warmingPressure + dependencyPressure) + index * 3 : null;
      let readiness = 'unknown';
      if (observed) {
        if (latencyMs > config.warmupBudgetMs || computeGate === 'fail' || dependencyGate === 'fail') readiness = 'not-ready';
        else if (computeGate === 'pass' && dependencyGate === 'pass') readiness = 'ready';
      }
      return { slot: `candidate-${index + 1}`, latencyMs, budgetMs: config.warmupBudgetMs, readiness };
    });
    const production = {
      attempted: productionTrace.length,
      successful: productionTrace.filter((row) => row.outcome === 'successful').length,
      interrupted: productionTrace.filter((row) => row.outcome === 'interrupted').length,
      unknown: productionTrace.filter((row) => row.outcome === 'unknown').length,
    };
    const warming = {
      attempted: warmTrace.length,
      ready: warmTrace.filter((row) => row.readiness === 'ready').length,
      notReady: warmTrace.filter((row) => row.readiness === 'not-ready').length,
      unknown: warmTrace.filter((row) => row.readiness === 'unknown').length,
    };
    const gates = {
      compute: computeGate,
      dependency: dependencyGate,
      warmup: gate(warmTrace.map((row) => row.readiness), 'ready'),
      journeys: gate(productionTrace.map((row) => row.outcome), 'successful'),
    };
    const values = Object.values(gates);
    const verdict = values.includes('fail') ? 'failure' : values.includes('unknown') ? 'unknown' : 'success';
    const impact = production.interrupted ? 'interrupted-production'
      : verdict === 'unknown' || production.unknown ? 'unverified'
        : verdict === 'failure' ? 'safe-abort-before-exposure' : 'production-preserved-no-transition';
    const gaps = [];
    if (!capacityObserved) gaps.push('Compute and dependency capacity observations are missing; configuration is not evidence.');
    if (config.coverage === 'missing-journeys') gaps.push('Four production journey observations are missing and remain unknown.');
    if (config.coverage === 'missing-warmup') gaps.push('All candidate warm-up observations are missing and remain unknown.');
    return freeze({
      sequence,
      config,
      verdict,
      verification: verdict === 'success' ? 'pass' : verdict === 'failure' ? 'fail' : 'unverified',
      impact,
      admission: verdict === 'success' ? 'warm-up-gates-passed-no-exposure' : 'blocked-before-exposure',
      gates,
      metrics: {
        configuredTotalComputeUnits: productionCapacity + candidateCapacity,
        totalComputeUnits: capacityObserved ? productionCapacity + candidateCapacity : null,
        addedComputeUnits: capacityObserved ? productionCapacity + candidateCapacity - 100 : null,
        slotAddedComputeUnits: 0,
        productionCapacityUnits: capacityObserved ? productionCapacity : null,
        candidateCapacityUnits: capacityObserved ? candidateCapacity : null,
        productionPlanDemand,
        warmingDemand,
        productionHeadroom: capacityObserved ? productionHeadroom : null,
        candidateHeadroom: capacityObserved ? candidateHeadroom : null,
        dependencyDemand,
        dependencyCapacityUnits: capacityObserved ? config.dependencyCapacity : null,
        dependencyHeadroom: capacityObserved ? dependencyHeadroom : null,
      },
      production,
      warming,
      transitions: { attempted: 0, successful: 0, interrupted: 0, unknown: 0, rate: null },
      productionTrace,
      warmTrace,
      gaps,
      phaseTrace: [
        { phase: 'declare', detail: `Configured ${config.productionWorkers} production worker(s), ${separate ? config.candidateWorkers : 0} separate candidate worker(s), ${config.slots} warming slots; budgets ${config.journeyBudgetMs}/${config.warmupBudgetMs} ms.` },
        { phase: 'warm', detail: `Production-plan demand ${productionPlanDemand}; warming demand ${warmingDemand}; shared dependency demand ${dependencyDemand} units in the same synthetic tick.` },
        { phase: 'observe', detail: `Production successful/interrupted/unknown: ${production.successful}/${production.interrupted}/${production.unknown}; warming ready/not-ready/unknown: ${warming.ready}/${warming.notReady}/${warming.unknown}.` },
        { phase: 'verify', detail: `${verdict}; candidate exposure remains zero. No successful user transition is claimed.` },
      ],
    });
  }

  function warm(state, input) {
    owned(state);
    if (state.phase !== 'ready') reject('ERR_STATE', 'Reset the current rehearsal before warming again.');
    if (state.history.length >= MAX_RUNS) reject('ERR_LIMIT', 'The six-run session limit is reached; retained evidence was not changed.');
    const result = measure(validate(input), state.history.length + 1);
    return stateOf('measured', [...state.history, result], result);
  }

  function reset(state) {
    owned(state);
    return stateOf('ready', state.history, null);
  }

  function totals(state) {
    owned(state);
    return freeze(state.history.reduce((sum, run) => ({
      runs: sum.runs + 1,
      attempted: sum.attempted + run.production.attempted,
      successful: sum.successful + run.production.successful,
      interrupted: sum.interrupted + run.production.interrupted,
      unknown: sum.unknown + run.production.unknown,
      successfulTransitions: 0,
    }), { runs: 0, attempted: 0, successful: 0, interrupted: 0, unknown: 0, successfulTransitions: 0 }));
  }

  const api = Object.freeze({ createState, warm, reset, totals, defaults, limits, MAX_RUNS });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S096Model = api;
}(typeof globalThis === 'object' ? globalThis : this));
