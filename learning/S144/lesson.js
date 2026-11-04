'use strict';

(function expose(root) {
  const data = typeof module === 'object' && module.exports
    ? require('.\\fixtures.js') : root.S144Data;
  const { profiles, TIERS, LIMITS, DATA_MODE } = data;
  const states = new WeakSet();
  const initialProfiles = ['boundary', 'overload', 'gap', 'unknown'];
  const choices = ['database-connections', 'worker-queue', 'within-observed-budgets', 'unobserved'];

  function reject(message, code = 'ERR_S144_INPUT') {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function shape(value, names, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
        || Object.keys(value).sort().join('|') !== [...names].sort().join('|')) {
      reject(`${label}: unexpected or missing fields.`);
    }
  }

  function integer(value, label, maximum = 10000, nullable = false) {
    if (nullable && value === null) return;
    if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
      reject(`${label}: expected a bounded integer${nullable ? ' or null' : ''}.`);
    }
  }

  function identifier(value, label) {
    if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value)) {
      reject(`${label}: expected a fixed record identifier.`);
    }
  }

  function boolean(value, label, nullable = false) {
    if (typeof value !== 'boolean' && !(nullable && value === null)) {
      reject(`${label}: expected a boolean${nullable ? ' or null' : ''}.`);
    }
  }

  function list(value, count, label) {
    if (!Array.isArray(value) || value.length !== count) reject(`${label}: wrong record count.`);
  }

  function validateWindow(input) {
    shape(input, ['schemaVersion', 'dataMode', 'id', 'windowId', 'windowMs', 'simultaneous',
      'limits', 'isolated', 'tiers', 'contributors', 'queue', 'diagnostics', 'journeys'], 'Window');
    if (input.schemaVersion !== 1 || input.dataMode !== DATA_MODE
        || !Object.hasOwn(profiles, input.id) || input.windowMs !== 10000 || input.simultaneous !== true) {
      reject('Only the declared fixed-fictional concurrent window is supported.');
    }
    identifier(input.windowId, 'Window ID');
    shape(input.limits, Object.keys(LIMITS), 'Limits');
    for (const [key, value] of Object.entries(LIMITS)) {
      if (input.limits[key] !== value) reject(`The original ${key} budget is fixed.`);
    }
    list(input.isolated, 5, 'Isolated tiers');
    list(input.tiers, 5, 'Coupled tiers');
    input.isolated.forEach((row, index) => {
      shape(row, ['tier', 'latencyMs', 'budgetMs', 'http', 'ready'], 'Isolated tier');
      if (row.tier !== TIERS[index]) reject('Isolated tier identities must be unique and ordered.');
      integer(row.latencyMs, 'Isolated latency', 10000, true);
      integer(row.budgetMs, 'Isolated budget');
      integer(row.http, 'Isolated HTTP diagnostic', 599, true);
      boolean(row.ready, 'Isolated readiness', true);
    });
    input.tiers.forEach((row, index) => {
      shape(row, ['tier', 'windowId', 'concurrency', 'latencyMs', 'requestsPerSecond'], 'Coupled tier');
      if (row.tier !== TIERS[index] || row.windowId !== input.windowId) {
        reject('All five coupled tier records must join the exact same window.');
      }
      integer(row.concurrency, 'Tier concurrency', 100, true);
      integer(row.latencyMs, 'Tier latency', 10000, true);
      integer(row.requestsPerSecond, 'Tier request throughput', 10000, true);
    });
    list(input.contributors, 3, 'Unique resource contributors');
    input.contributors.forEach((row, index) => {
      shape(row, ['id', 'tier', 'windowId', 'connections'], 'Resource contributor');
      if (row.id !== ['api-foreground', 'cache-refill', 'worker-processing'][index]
          || row.tier !== ['api', 'cache', 'worker'][index] || row.windowId !== input.windowId) {
        reject('Resource contributors must be unique, not double-counted, and window-correlated.');
      }
      integer(row.connections, 'Shared connection demand', 100, true);
    });
    shape(input.queue, ['windowId', 'depth', 'workerWaitMs'], 'Queue');
    if (input.queue.windowId !== input.windowId) reject('Queue record belongs to another window.');
    integer(input.queue.depth, 'Queue depth', 100, true);
    integer(input.queue.workerWaitMs, 'Worker wait', 10000, true);
    shape(input.diagnostics, ['http', 'ready', 'averageMs', 'requestCount'], 'Diagnostics');
    integer(input.diagnostics.http, 'HTTP diagnostic', 599, true);
    boolean(input.diagnostics.ready, 'Readiness diagnostic', true);
    integer(input.diagnostics.averageMs, 'Average diagnostic', 10000, true);
    integer(input.diagnostics.requestCount, 'Request count diagnostic', 100000, true);
    list(input.journeys, 3, 'Affected journeys');
    const ids = new Set();
    input.journeys.forEach((row, index) => {
      shape(row, ['id', 'requiredTiers', 'elapsedMs', 'completedMs', 'http', 'clientResult',
        'stateCorrect', 'effectCount', 'expectedEffects', 'versions', 'waitResource'], 'Journey');
      identifier(row.id, 'Journey ID');
      if (ids.has(row.id)) reject('Duplicate affected journey ID.');
      ids.add(row.id);
      const expected = index === 0 ? TIERS.slice(0, 4) : TIERS;
      if (!Array.isArray(row.requiredTiers) || row.requiredTiers.join('|') !== expected.join('|')) {
        reject('Required journey tier paths cannot be shortened.');
      }
      integer(row.elapsedMs, 'Client elapsed observation', 10000, true);
      integer(row.completedMs, 'Client completion observation', 10000, true);
      if (row.completedMs !== null && (row.elapsedMs === null || row.completedMs > row.elapsedMs)) {
        reject('Completion cannot precede an absent or shorter client observation.');
      }
      integer(row.http, 'Client HTTP diagnostic', 599, true);
      if (![null, 'complete', 'error'].includes(row.clientResult)) reject('Unknown client result type.');
      boolean(row.stateCorrect, 'Client state correctness', true);
      integer(row.effectCount, 'Observed effect count', 5, true);
      if (row.expectedEffects !== 1) reject('Exactly one intended effect is the fixed journey contract.');
      shape(row.versions, expected, 'Journey tier/version observations');
      if (Object.values(row.versions).some((value) => ![null, 'v1', 'v2'].includes(value))) {
        reject('Unsupported tier/version observation.');
      }
      if (![null, 'database-connections', 'worker-queue'].includes(row.waitResource)) {
        reject('Unknown observed wait resource.');
      }
    });
    return input;
  }

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function budget(observed, maximum) {
    return { observed, budget: maximum, status: observed === null ? 'unknown' : observed <= maximum ? 'pass' : 'fail' };
  }

  function classify(row) {
    const failures = [];
    const missing = [];
    const observedElapsed = row.completedMs === null ? row.elapsedMs : row.completedMs;
    if (observedElapsed !== null && observedElapsed > LIMITS.journeyMs) failures.push('original-latency-budget');
    if (row.clientResult === 'error') failures.push('client-visible-error');
    if (row.stateCorrect === false) failures.push('lost-client-state');
    if (row.effectCount !== null && row.effectCount !== row.expectedEffects) failures.push('missing-or-duplicate-effect');
    if (Object.values(row.versions).some((version) => version === 'v1')) failures.push('required-tier-version');
    if (row.completedMs === null || row.clientResult === null) missing.push('client-completion');
    if (row.stateCorrect === null) missing.push('client-state');
    if (row.effectCount === null) missing.push('effect-count');
    if (Object.values(row.versions).some((version) => version === null)) missing.push('tier-versions');
    return {
      ...row, budgetMs: LIMITS.journeyMs,
      outcome: failures.length ? 'interrupted' : missing.length ? 'unknown' : 'success',
      failures, missing,
    };
  }

  function measureWindow(input) {
    validateWindow(input);
    const complete = input.contributors.every((row) => row.connections !== null);
    const knownLowerBound = input.contributors.reduce((sum, row) => sum + (row.connections ?? 0), 0);
    const shared = {
      resourceId: 'database-connections', windowId: input.windowId,
      contributors: input.contributors, observedConnections: complete ? knownLowerBound : null,
      knownLowerBound, budget: LIMITS.connections,
      status: knownLowerBound > LIMITS.connections ? 'fail' : complete ? 'pass' : 'unknown',
    };
    const journeys = input.journeys.map(classify);
    const counts = {
      attempted: journeys.length,
      successful: journeys.filter((row) => row.outcome === 'success').length,
      interrupted: journeys.filter((row) => row.outcome === 'interrupted').length,
      unknown: journeys.filter((row) => row.outcome === 'unknown').length,
    };
    const downstream = {
      queueDepth: budget(input.queue.depth, LIMITS.queueDepth),
      workerWaitMs: budget(input.queue.workerWaitMs, LIMITS.workerWaitMs),
    };
    const possibleSuccessfulJourneys = counts.successful + counts.unknown;
    const throughput = {
      windowMs: input.windowMs, successfulJourneys: counts.successful, unknownJourneys: counts.unknown,
      knownLowerBoundPerSecond: counts.successful / (input.windowMs / 1000),
      possibleSuccessfulJourneys, minimumPerWindow: LIMITS.successfulJourneysPerWindow,
      status: counts.successful >= LIMITS.successfulJourneysPerWindow ? 'pass'
        : possibleSuccessfulJourneys < LIMITS.successfulJourneysPerWindow ? 'fail' : 'unknown',
    };
    const statuses = [shared.status, downstream.queueDepth.status, downstream.workerWaitMs.status, throughput.status];
    const verdict = counts.interrupted || statuses.includes('fail') ? 'fail'
      : counts.unknown || statuses.includes('unknown') ? 'unknown' : 'pass';
    return freeze({
      schemaVersion: 1, sourceId: 'S144', dataMode: DATA_MODE, profileId: input.id,
      windowId: input.windowId,
      isolated: {
        passingTierIds: input.isolated.filter((row) => row.latencyMs !== null
          && row.latencyMs <= row.budgetMs && row.http === 200 && row.ready === true).map((row) => row.tier),
        measuredTierCount: input.isolated.length, certifiesCombined: false,
      },
      load: {
        simultaneous: input.simultaneous, windowMs: input.windowMs, tierIds: input.tiers.map((row) => row.tier),
        requestCount: input.diagnostics.requestCount, requestCountIsJourneyDenominator: false,
      },
      shared, downstream,
      diagnostics: { ...input.diagnostics, certifiesContinuity: false },
      journeys, throughput, counts, verdict,
      bottleneck: {
        observedResource: shared.status === 'fail' ? 'database-connections'
          : downstream.queueDepth.status === 'fail' || downstream.workerWaitMs.status === 'fail' ? 'worker-queue' : null,
        sharedBudgetStatus: shared.status,
        observedWaitJourneyIds: journeys.filter((row) => row.waitResource === 'database-connections').map((row) => row.id),
        unresolvedJourneyIds: journeys.filter((row) => row.outcome === 'unknown').map((row) => row.id),
        rootCause: 'unobserved', isolatedSuccessIsCausalProof: false,
      },
    });
  }

  function summarizeHistory(history) {
    const counts = { attempted: 0, successful: 0, interrupted: 0, unknown: 0 };
    for (const entry of history) {
      for (const key of Object.keys(counts)) counts[key] += entry.report.counts[key];
    }
    return freeze({
      windows: history.length, ...counts,
      verdict: history.some((entry) => entry.report.verdict === 'fail') ? 'fail'
        : !history.length || history.some((entry) => entry.report.verdict === 'unknown') ? 'unknown' : 'pass',
      retainedInterruptedIds: history.flatMap((entry) => entry.report.journeys
        .filter((row) => row.outcome === 'interrupted').map((row) => `${entry.runId}/${row.id}`)),
      retainedUnknownIds: history.flatMap((entry) => entry.report.journeys
        .filter((row) => row.outcome === 'unknown').map((row) => `${entry.runId}/${row.id}`)),
      failedRunIds: history.filter((entry) => entry.report.verdict === 'fail').map((entry) => entry.runId),
    });
  }

  function mint(value) {
    freeze(value);
    states.add(value);
    return value;
  }

  function createState() {
    return mint({ revision: 0, nextRun: 1, phase: 'idle', run: null, history: [], probe: null, feedback: null });
  }

  function transition(state, command) {
    if (!states.has(state)) reject('State was not issued by this rehearsal.');
    const schemas = {
      conduct: ['type', 'expectedRevision', 'profile'],
      inspect: ['type', 'expectedRevision', 'runId'],
      measure: ['type', 'expectedRevision', 'runId'],
      probe: ['type', 'expectedRevision', 'runId'],
      mitigate: ['type', 'expectedRevision', 'runId'],
      identify: ['type', 'expectedRevision', 'runId', 'choice'],
      reset: ['type', 'expectedRevision'],
    };
    if (!command || typeof command.type !== 'string' || !Object.hasOwn(schemas, command.type)) {
      reject('Choose a supported rehearsal action.');
    }
    shape(command, schemas[command.type], 'Command');
    integer(command.expectedRevision, 'Command revision', Number.MAX_SAFE_INTEGER);
    if (command.expectedRevision !== state.revision) reject('Stale or replayed command revision.', 'ERR_S144_ORDER');
    const next = { ...state, revision: state.revision + 1 };
    if (command.type === 'reset') {
      return mint({ ...next, phase: 'idle', run: null, history: [], probe: null, feedback: null });
    }
    if (command.type === 'conduct') {
      if (!initialProfiles.includes(command.profile)) reject('Choose one of the four fixed teaching profiles.');
      if (state.phase !== 'idle') reject('Reset before conducting another initial window.', 'ERR_S144_ORDER');
      return mint({
        ...next, phase: 'conducted', nextRun: state.nextRun + 1,
        run: { id: `run-${state.nextRun}`, profile: command.profile },
      });
    }
    if (!state.run || typeof command.runId !== 'string' || command.runId !== state.run.id) {
      reject('Action does not own the current run.', 'ERR_S144_ORDER');
    }
    if (command.type === 'inspect') {
      if (state.phase !== 'conducted') reject('Inspect exactly once after conduct.', 'ERR_S144_ORDER');
      return mint({ ...next, phase: 'inspected' });
    }
    if (command.type === 'measure') {
      if (state.phase !== 'inspected') reject('Inspect the joined records before measuring.', 'ERR_S144_ORDER');
      if (state.history.length >= 2) reject('The two-window rehearsal limit was reached.', 'ERR_S144_ORDER');
      return mint({
        ...next, phase: 'measured',
        history: [...state.history, { runId: state.run.id, report: measureWindow(profiles[state.run.profile]) }],
      });
    }
    if (state.phase !== 'measured') reject('Measure the current window first.', 'ERR_S144_ORDER');
    if (command.type === 'probe') {
      if (state.probe) reject('This unrelated probe was already inspected.', 'ERR_S144_ORDER');
      return mint({
        ...next,
        probe: {
          windowId: 'unrelated-probe', http: 200, ready: true,
          certifiesCombined: false, resolvesOriginalCompletion: false, establishesCause: false,
        },
      });
    }
    const current = state.history[state.history.length - 1].report;
    if (command.type === 'mitigate') {
      if (state.history.length !== 1 || current.verdict === 'pass') {
        reject('Only one failed or unknown initial window has a mitigation follow-up.', 'ERR_S144_ORDER');
      }
      return mint({
        ...next, phase: 'conducted', nextRun: state.nextRun + 1,
        run: { id: `run-${state.nextRun}`, profile: 'mitigated' }, probe: null, feedback: null,
      });
    }
    if (!choices.includes(command.choice)) reject('Choose a typed bottleneck conclusion.');
    const expected = current.bottleneck.observedResource || (current.verdict === 'pass'
      ? 'within-observed-budgets' : 'unobserved');
    return mint({
      ...next, feedback: {
        choice: command.choice, expected, correct: command.choice === expected,
        explanation: expected === 'database-connections'
          ? 'The same-window shared database connection budget is breached. Recorded waits correlate affected journeys; the physical root cause is still unobserved.'
          : expected === 'worker-queue'
            ? 'The same-window worker queue/wait budget is breached; this does not prove a physical root cause.'
            : expected === 'within-observed-budgets'
              ? 'This complete fictional combined window is within all declared budgets. It certifies no other window or native system.'
              : 'A client interruption can be known while the shared bottleneck, cause, or completion is unobserved.',
      },
    });
  }

  const exported = Object.freeze({ validateWindow, measureWindow, summarizeHistory, createState, transition });
  if (typeof module === 'object' && module.exports) module.exports = exported;
  else root.S144Lesson = exported;
}(typeof globalThis === 'object' ? globalThis : this));
