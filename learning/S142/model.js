(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S142 = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const schema = 's142-fixed-fiction/1';
  const banner = 'Training rehearsal - synthetic data - not a live Azure result';
  const limits = freeze({
    maxRuns: 3, maxCommands: 23,
    demandRps: 120, sharedConnections: 100, sharedCpuPct: 85,
    queueDepth: 20, queueWaitMs: 300, initializationMs: 1000, journeyMs: 1500,
    observationStartMs: 0, burstEndMs: 1500, observationEndMs: 2000,
  });
  const tiers = ['frontend', 'api', 'data', 'worker'];
  const isolated = freeze([
    { tier: 'frontend', version: 'v2', demandRps: 120, cpuPct: 52, connections: 12, latencyMs: 130, ready: true, verdict: 'PASS' },
    { tier: 'api', version: 'v2', demandRps: 120, cpuPct: 55, connections: 70, latencyMs: 190, ready: true, verdict: 'PASS' },
    { tier: 'data', version: 'v2', demandRps: 120, cpuPct: 40, connections: 70, latencyMs: 100, ready: true, verdict: 'PASS' },
    { tier: 'worker', version: 'v2', demandRps: 120, cpuPct: 35, connections: 45, latencyMs: 160, ready: true, verdict: 'PASS' },
  ]);

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function copy(value) { return JSON.parse(JSON.stringify(value)); }

  function versions(moved = true) {
    return [
      { atMs: 0, frontend: 'v1', api: 'v1', data: 'v1', worker: 'v1' },
      ...(moved ? [{ atMs: 800, frontend: 'v2', api: 'v2', data: 'v2', worker: 'v2' }] : []),
    ];
  }

  function journey(id, completedAtMs, changes = {}) {
    return {
      id, cohort: 'initialization-burst', startedAtMs: 0, completedAtMs,
      lastObservedAtMs: completedAtMs === null ? 800 : completedAtMs,
      clientError: null, stateIntact: true, businessEffects: 1,
      tierVersions: versions(), interruptions: [], ...changes,
    };
  }

  function windowRecord(traceId, recovery, values = {}) {
    const initialization = {
      phase: recovery ? 'completed-or-unobserved' : 'warming-and-expanding',
      requestedInstances: 3, deployedInstances: 3, readyInstances: 3, trafficEligibleInstances: 3,
      connections: recovery ? 0 : 30, cpuPct: recovery ? 0 : 30, completedAtMs: 900,
      ...values.initialization,
    };
    const demand = {
      rps: 120, connections: recovery ? 40 : 70, cpuPct: recovery ? 40 : 55, ...values.demand,
    };
    return {
      id: `${traceId}-${recovery ? 'recovery' : 'burst'}`,
      window: recovery ? 'recovery' : 'initialization-and-burst',
      fromMs: recovery ? 1500 : 0, throughMs: recovery ? 2000 : 1500,
      sharedSampleAtMs: recovery ? 1700 : 800,
      initialization, demand,
      shared: {
        resource: 'fictional-shared-pool',
        connections: initialization.connections === null || demand.connections === null
          ? null : initialization.connections + demand.connections,
        cpuPct: initialization.cpuPct === null || demand.cpuPct === null
          ? null : initialization.cpuPct + demand.cpuPct,
      },
      queue: { depth: recovery ? 4 : 20, waitMs: recovery ? 90 : 300, ...values.queue },
      health: { ready: true, httpStatus: 200 },
      throughput: { averageRps: values.averageRps ?? (recovery ? 120 : 115), scope: 'request-diagnostic-not-journey-denominator' },
      tierVersions: { frontend: 'v1/v2', api: 'v1/v2', data: 'v2', worker: 'v2' },
    };
  }

  const interruptedConnection = { atMs: 700, code: 'broken-required-connection' };
  const queueTimeout = { atMs: 600, code: 'user-visible-queue-timeout' };
  const balancedJourneys = [
    journey('J1', 1100), journey('J2', 1500), journey('J3', 1300), journey('J4', 1400),
  ];
  const contentionJourneys = [
    journey('J1', null, { interruptions: [queueTimeout] }),
    journey('J2', 1200),
    journey('J3', 1400, { interruptions: [interruptedConnection] }),
    journey('J4', null, { stateIntact: null, businessEffects: null }),
  ];
  const unknownJourneys = [
    journey('J1', 1100), journey('J2', 1500),
    journey('J3', 1300, { tierVersions: versions(false) }),
    journey('J4', null, { stateIntact: null, businessEffects: null }),
  ];
  const traces = freeze({
    'within-envelope': {
      id: 'within-envelope', label: 'Within envelope - positive boundary fixture', expected: 'PASS',
      isolated,
      burst: windowRecord('within-envelope', false),
      recovery: windowRecord('within-envelope', true),
      burstJourneys: balancedJourneys, recoveryJourneys: copy(balancedJourneys),
    },
    contention: {
      id: 'contention', label: 'Shared contention - negative fixture', expected: 'FAIL',
      isolated,
      burst: windowRecord('contention', false, {
        initialization: { connections: 45, cpuPct: 35, completedAtMs: 1200 },
        queue: { depth: 28, waitMs: 480 }, averageRps: 118,
      }),
      recovery: windowRecord('contention', true, { initialization: { completedAtMs: 1200 } }),
      burstJourneys: contentionJourneys,
      recoveryJourneys: [
        journey('J1', 1800), journey('J2', 1200), journey('J3', 1400),
        journey('J4', null, { stateIntact: null, businessEffects: null }),
      ],
    },
    'unobserved-peak': {
      id: 'unobserved-peak', label: 'Unobserved peak - unknown fixture', expected: 'UNKNOWN',
      isolated,
      burst: windowRecord('unobserved-peak', false, {
        initialization: { connections: null, cpuPct: 25, completedAtMs: null, readyInstances: 2, trafficEligibleInstances: 2 },
        queue: { depth: 10, waitMs: null },
      }),
      recovery: windowRecord('unobserved-peak', true, { initialization: { completedAtMs: null } }),
      burstJourneys: unknownJourneys, recoveryJourneys: copy(unknownJourneys),
    },
  });

  function error(code, message) {
    const result = new Error(message);
    result.code = code;
    return result;
  }

  function exactObject(value, keys, code, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.getPrototypeOf(value) !== Object.prototype) {
      throw error(code, `${label} must be a plain typed record.`);
    }
    const own = Reflect.ownKeys(value);
    if (own.length !== keys.length || own.some((key) => !keys.includes(key))
        || keys.some((key) => !Object.hasOwn(value, key)
          || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) {
      throw error(code, `${label} has missing, extra or accessor fields.`);
    }
  }

  function boundedArray(value, maximum, code, label) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
        || value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1) {
      throw error(code, `${label} must be a bounded dense array.`);
    }
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)
          || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, index), 'value')) {
        throw error(code, `${label} cannot contain gaps or accessors.`);
      }
    }
  }

  function sameState(actual, expected) {
    if (!expected || typeof expected !== 'object') return Object.is(actual, expected);
    if (Array.isArray(expected)) {
      boundedArray(actual, expected.length, 'ERR_S142_STATE', 'Derived array');
      return actual.length === expected.length
        && expected.every((value, index) => sameState(actual[index], value));
    }
    exactObject(actual, Object.keys(expected), 'ERR_S142_STATE', 'Derived state');
    return Object.keys(expected).every((key) => sameState(actual[key], expected[key]));
  }

  function checkedCommand(command) {
    if (!command || typeof command !== 'object') throw error('ERR_S142_COMMAND', 'Choose a typed command.');
    const descriptor = Object.getOwnPropertyDescriptor(command, 'type');
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string') {
      throw error('ERR_S142_COMMAND', 'Command type must be a literal string.');
    }
    const keys = descriptor.value === 'initialize' ? ['type', 'traceId'] : ['type'];
    exactObject(command, keys, 'ERR_S142_COMMAND', 'Command');
    if (!['initialize', 'burst', 'inspect', 'measure', 'recover', 'reset'].includes(command.type)) {
      throw error('ERR_S142_COMMAND', 'Unknown command; no arbitrary operations are available.');
    }
    if (command.type === 'initialize'
        && (typeof command.traceId !== 'string' || !Object.hasOwn(traces, command.traceId))) {
      throw error('ERR_S142_COMMAND', 'Choose one of the three fixed fictional traces.');
    }
    return copy(command);
  }

  function emptyRun(id) {
    return { id, traceId: null, stage: 'idle', burstEntered: false, recoveryRecorded: false, inspection: null, measurements: [] };
  }

  function createState() {
    return freeze({ schema, revision: 0, runs: [emptyRun(1)], history: [] });
  }

  function active(state) { return state.runs[state.runs.length - 1]; }

  function available(state) {
    const run = active(state);
    const result = [];
    if (state.history.length >= limits.maxCommands) return result;
    if (run.stage === 'idle') result.push('initialize');
    if (run.stage === 'initializing') result.push('burst');
    if (run.stage === 'burst' || run.stage === 'recovered') result.push('inspect');
    if (run.stage === 'inspected') result.push('measure');
    if ((run.stage === 'inspected' || run.stage === 'measured') && !run.recoveryRecorded) result.push('recover');
    if (run.stage !== 'idle' && state.runs.length < limits.maxRuns) result.push('reset');
    return result;
  }

  function records(run) {
    if (!run.burstEntered) return { windows: [], journeySnapshots: [] };
    const trace = traces[run.traceId];
    return {
      windows: [trace.burst, ...(run.recoveryRecorded ? [trace.recovery] : [])],
      journeySnapshots: [
        ...trace.burstJourneys.map((item) => ({ observation: 'burst', ...item })),
        ...(run.recoveryRecorded ? trace.recoveryJourneys.map((item) => ({ observation: 'recovery', ...item })) : []),
      ],
    };
  }

  function classifyJourney(snapshots) {
    const latest = snapshots[snapshots.length - 1];
    const interruptions = [];
    const reasons = [];
    for (const item of snapshots) {
      for (const incident of item.interruptions) {
        if (!interruptions.some((previous) => previous.atMs === incident.atMs && previous.code === incident.code)) {
          interruptions.push(copy(incident));
        }
      }
      if (item.clientError !== null) reasons.push(`${item.observation}: client error ${item.clientError}`);
      if (item.stateIntact === false) reasons.push(`${item.observation}: lost required state`);
      if (item.businessEffects !== null && item.businessEffects !== 1) reasons.push(`${item.observation}: incorrect business effects`);
      if (item.completedAtMs !== null && item.completedAtMs - item.startedAtMs > limits.journeyMs) {
        reasons.push(`${item.observation}: original journey budget exceeded`);
      }
    }
    if (interruptions.length) reasons.push('prior user-visible interruption retained');
    const migrationObserved = tiers.every((tier) =>
      latest.tierVersions.some((item) => item[tier] === 'v1')
      && latest.tierVersions.some((item) => item[tier] === 'v2'));
    const complete = latest.completedAtMs !== null && latest.clientError === null
      && latest.stateIntact === true && latest.businessEffects === 1 && migrationObserved;
    return {
      id: latest.id, cohort: latest.cohort, startedAtMs: snapshots[0].startedAtMs,
      completedAtMs: latest.completedAtMs,
      latencyMs: latest.completedAtMs === null ? null : latest.completedAtMs - snapshots[0].startedAtMs,
      originalBudgetMs: limits.journeyMs, migrationObserved,
      outcome: reasons.length ? 'interrupted' : complete ? 'successful' : 'unknown',
      reasons: [...new Set(reasons)], interruptions,
      observations: snapshots.map((item) => item.observation),
    };
  }

  function measureRun(run) {
    const observed = records(run);
    const failedChecks = [];
    const unknownChecks = [];
    let knownChecks = 0;
    function threshold(record, metric, value, maximum, unit) {
      if (value === null) unknownChecks.push({ record: record.id, metric, reason: 'missing original observation', unit });
      else {
        knownChecks++;
        if (value > maximum) failedChecks.push({ record: record.id, metric, observed: value, maximum, unit });
      }
    }
    for (const record of observed.windows) {
      threshold(record, 'production demand', record.demand.rps, limits.demandRps, 'fictional requests/s');
      threshold(record, 'combined shared connections', record.shared.connections, limits.sharedConnections, 'connections');
      threshold(record, 'combined shared CPU', record.shared.cpuPct, limits.sharedCpuPct, 'shared percent allocation');
      threshold(record, 'queue depth', record.queue.depth, limits.queueDepth, 'entries');
      threshold(record, 'queue wait', record.queue.waitMs, limits.queueWaitMs, 'ms');
      threshold(record, 'initialization completion', record.initialization.completedAtMs, limits.initializationMs, 'ms from original start');
    }
    const ids = [...new Set(observed.journeySnapshots.map((item) => item.id))];
    const journeys = ids.map((id) => classifyJourney(observed.journeySnapshots.filter((item) => item.id === id)));
    const counts = { attempted: journeys.length, successful: 0, interrupted: 0, unknown: 0 };
    for (const item of journeys) counts[item.outcome]++;
    const completedLatencies = journeys.filter((item) => item.latencyMs !== null).map((item) => item.latencyMs);
    const verdict = failedChecks.length || counts.interrupted ? 'FAIL'
      : unknownChecks.length || counts.unknown || counts.attempted === 0 ? 'UNKNOWN' : 'PASS';
    const trace = run.traceId === null ? null : traces[run.traceId];
    return {
      schema: 's142-synthetic-measurement/1', runId: run.id, traceId: run.traceId,
      verdict, expectedVerdict: trace ? trace.expected : 'UNKNOWN',
      verifierMatched: trace !== null && verdict === trace.expected,
      counts, successFraction: counts.attempted ? counts.successful / counts.attempted : null,
      envelopeChecks: { known: knownChecks, failed: failedChecks.length, unknown: unknownChecks.length },
      failedChecks, unknownChecks, journeys,
      latency: {
        completedDenominator: completedLatencies.length,
        meanMs: completedLatencies.length ? completedLatencies.reduce((sum, value) => sum + value, 0) / completedLatencies.length : null,
        maxMs: completedLatencies.length ? Math.max(...completedLatencies) : null,
        originalBudgetMs: limits.journeyMs,
      },
      separateTierSamples: { passed: trace ? trace.isolated.filter((item) => item.verdict === 'PASS').length : 0, denominator: trace ? trace.isolated.length : 0, scope: 'isolated-only-not-coupled-certification' },
      observationRefs: observed.windows.map((record) => record.id),
      recoveryRecorded: run.recoveryRecorded,
      nativeProof: false, fiveNinesCertified: false,
    };
  }

  function applyTrusted(state, command) {
    if (!available(state).includes(command.type)) {
      throw error('ERR_S142_ORDER', 'Command is out of order, already recorded, or exceeds the three-run / 23-command bound.');
    }
    const next = copy(state);
    const run = active(next);
    if (command.type === 'initialize') { run.traceId = command.traceId; run.stage = 'initializing'; }
    if (command.type === 'burst') { run.burstEntered = true; run.stage = 'burst'; }
    if (command.type === 'inspect') { run.inspection = copy(records(run)); run.stage = 'inspected'; }
    if (command.type === 'measure') { run.measurements.push(measureRun(run)); run.stage = 'measured'; }
    if (command.type === 'recover') { run.recoveryRecorded = true; run.stage = 'recovered'; }
    if (command.type === 'reset') next.runs.push(emptyRun(next.runs.length + 1));
    next.history.push({ sequence: next.history.length + 1, runId: run.id, command: copy(command) });
    next.revision = next.history.length;
    return freeze(next);
  }

  function replay(state) {
    exactObject(state, ['schema', 'revision', 'runs', 'history'], 'ERR_S142_STATE', 'State');
    boundedArray(state.history, limits.maxCommands, 'ERR_S142_STATE', 'History');
    boundedArray(state.runs, limits.maxRuns, 'ERR_S142_STATE', 'Runs');
    if (state.schema !== schema || !Number.isSafeInteger(state.revision)
        || state.revision !== state.history.length || state.runs.length === 0) {
      throw error('ERR_S142_STATE', 'State schema, revision or run count is invalid.');
    }
    let trusted = createState();
    for (const event of state.history) {
      exactObject(event, ['sequence', 'runId', 'command'], 'ERR_S142_STATE', 'History event');
      if (event.sequence !== trusted.history.length + 1 || event.runId !== active(trusted).id) {
        throw error('ERR_S142_STATE', 'History sequence or run identity does not match replay.');
      }
      try { trusted = applyTrusted(trusted, checkedCommand(event.command)); }
      catch { throw error('ERR_S142_STATE', 'History contains an invalid typed or out-of-order command.'); }
    }
    if (!sameState(state, trusted)) throw error('ERR_S142_STATE', 'Derived state differs from its fixed-source command replay.');
    return trusted;
  }

  function dispatch(state, command) {
    return applyTrusted(replay(state), checkedCommand(command));
  }

  function read(state) {
    const trusted = replay(state);
    const current = active(trusted);
    const trace = current.traceId === null ? null : traces[current.traceId];
    const sessionCounts = { attempted: 0, successful: 0, interrupted: 0, unknown: 0 };
    for (const run of trusted.runs) {
      const counts = measureRun(run).counts;
      for (const key of Object.keys(sessionCounts)) sessionCounts[key] += counts[key];
    }
    return freeze({
      banner, limits, current: copy(current), revision: trusted.revision,
      traceLabel: trace ? trace.label : 'No trace started',
      traceOptions: Object.values(traces).map(({ id, label }) => ({ id, label })),
      separateTierSamples: trace ? copy(trace.isolated) : [],
      observations: copy(records(current).windows),
      journeySnapshots: copy(records(current).journeySnapshots),
      latestMeasurement: current.measurements.length ? copy(current.measurements[current.measurements.length - 1]) : null,
      inspectionStale: current.stage === 'recovered',
      sessionCounts,
      runSummaries: trusted.runs.map((run) => ({
        id: run.id, traceId: run.traceId, stage: run.stage, counts: measureRun(run).counts,
        measuredVerdicts: run.measurements.map((measurement) => measurement.verdict),
      })),
      runs: copy(trusted.runs), history: copy(trusted.history),
      availableCommands: available(trusted),
    });
  }

  return freeze({ schema, banner, limits, createState, dispatch, read });
}));
