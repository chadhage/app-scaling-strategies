'use strict';

(function expose(root) {
  const LIMITS = Object.freeze({
    perInstanceRps: 50, utilizationPercent: 80, poolPerInstance: 20,
    journeyBudgetMs: 800, readinessTtlSeconds: 30, sampleSize: 20
  });
  const CONDITIONS = Object.freeze([
    'healthy', 'unready', 'provisioning-failure', 'capacity-unknown',
    'slow-journey', 'broken-connection', 'journey-unknown'
  ]);
  const copy = (value) => structuredClone(value);
  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function integer(value, minimum, maximum) {
    if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) value = Number(value);
    return typeof value === 'number' && Number.isSafeInteger(value)
      && value >= minimum && value <= maximum ? value : null;
  }

  function baselineInstances() {
    return [1, 2].map((number) => ({
      id: `instance-${number}`, baseline: true, deployed: true,
      readiness: 'ready', observedAtSeconds: 0
    }));
  }

  function cumulative(totals) {
    const verdict = totals.interruptedTransitions > 0 ? 'FAIL'
      : totals.unknownTransitions > 0 ? 'UNVERIFIED'
        : totals.attemptedTransitions > 0 ? 'PASS' : 'NOT_RUN';
    return {
      verdict,
      userOutcome: verdict === 'FAIL' ? 'interrupted-transition'
        : verdict === 'UNVERIFIED' ? 'unverified-transition'
          : verdict === 'PASS' ? 'synthetic-uninterrupted-transition' : 'not-run',
      successRate: totals.attemptedTransitions === 0 ? null
        : totals.successfulTransitions / totals.attemptedTransitions,
      denominator: totals.attemptedTransitions,
      cleanup: 'N/A: memory-only rehearsal; zero cloud resources or external effects.',
      scope: 'synthetic-only', nativeProof: false, parentComplete: false,
      reliabilityLimit: 'Small deterministic samples are not independent native trials or five-nines proof.'
    };
  }

  function derive(state) {
    const confirmedDeployed = state.instances.filter((instance) => instance.deployed === true).length;
    const confirmedReady = state.instances.filter((instance) =>
      instance.deployed === true && instance.readiness === 'ready').length;
    const deployedUnknown = state.instances.some((instance) => instance.deployed === null);
    const readyUnknown = deployedUnknown || state.instances.some((instance) => instance.readiness === 'unknown');
    state.capacity = {
      requested: state.configuration?.targetInstances ?? 2,
      deployed: deployedUnknown ? null : confirmedDeployed,
      ready: readyUnknown ? null : confirmedReady,
      eligible: state.eligibleIds.length,
      confirmedDeployed, confirmedReady
    };
    const observed = deployedUnknown ? null : confirmedDeployed * LIMITS.poolPerInstance;
    const limit = state.configuration?.connectionLimit ?? 100;
    state.connections = {
      poolPerInstance: LIMITS.poolPerInstance, observed,
      projected: state.capacity.requested * LIMITS.poolPerInstance,
      limit, withinLimit: observed === null ? null : observed <= limit
    };
    state.load.plannedRps = state.configuration?.demandRps ?? 160;
    state.load.eligibleCapacityRps = state.capacity.eligible * LIMITS.perInstanceRps;
    state.load.readyCapacityRps = readyUnknown ? null : confirmedReady * LIMITS.perInstanceRps;
    state.result = cumulative(state.totals);
  }

  function createRehearsal() {
    const state = {
      schemaVersion: 1,
      sourceId: 'S011',
      mode: 'synthetic-only',
      nativeProof: false,
      parentComplete: false,
      phase: 'baseline',
      clockSeconds: 0,
      sequence: 0,
      requestEpoch: 0,
      slots: 1,
      configuration: null,
      activeCondition: 'healthy',
      observationStep: 0,
      admissionRound: 0,
      verification: null,
      observations: [],
      history: [],
      clients: [],
      instances: baselineInstances(),
      eligibleIds: ['instance-1', 'instance-2'],
      capacity: {
        requested: 2, deployed: 2, ready: 2, eligible: 2,
        confirmedDeployed: 2, confirmedReady: 2
      },
      load: {
        baselineRps: 80, plannedRps: 160, observedRps: 80,
        perInstanceRps: 50, utilizationCeilingPercent: 80,
        eligibleCapacityRps: 100, readyCapacityRps: 100,
        requestedNewSharePercent: 0, observedNewSharePercent: null,
        oldPoolRps: 80, newPoolRps: 0
      },
      connections: { poolPerInstance: 20, observed: 40, projected: 40, limit: 100, withinLimit: true },
      totals: {
        attemptedTransitions: 0, successfulTransitions: 0, interruptedTransitions: 0,
        unknownTransitions: 0, oldOnlyJourneys: 0, oldOnlySuccessful: 0
      },
      lastResult: {
        verdict: 'NOT_RUN', reason: 'Baseline only. Request extra instances, observe twice, verify, then increase admission.',
        assertions: [], userOutcome: 'not-run', journeys: []
      },
      result: null
    };
    derive(state);
    return freeze(state);
  }

  function check(id, status, expected, observed, unit = '') {
    return { id, status, expected, observed, unit };
  }

  function record(state, action, verdict, reason, assertions = [], journeys = []) {
    derive(state);
    const event = {
      id: `event-${String(state.sequence).padStart(3, '0')}`,
      action, verdict, reason, assertions, logicalSeconds: state.clockSeconds,
      requestEpoch: state.requestEpoch, activeCondition: state.activeCondition,
      phase: state.phase, configuration: copy(state.configuration),
      capacity: copy(state.capacity), instances: copy(state.instances),
      connections: copy(state.connections), load: copy(state.load),
      verification: copy(state.verification), journeys: copy(journeys),
      cumulativeImpact: copy(state.totals), userOutcome: state.result.userOutcome,
      cleanup: state.result.cleanup, scope: 'synthetic-only', nativeProof: false, parentComplete: false
    };
    state.history.push(event);
    state.lastResult = event;
    return freeze(state);
  }

  function requestScale(state, input) {
    if (!isObject(input)) return record(state, 'request', 'INVALID', 'Expected a scale-out configuration object.');
    const targetInstances = integer(input.targetInstances, 3, 6);
    const demandRps = integer(input.demandRps, 1, 300);
    const connectionLimit = integer(input.connectionLimit, 40, 200);
    const condition = typeof input.condition === 'string' && CONDITIONS.includes(input.condition)
      ? input.condition : null;
    if (targetInstances === null || demandRps === null || connectionLimit === null || condition === null) {
      return record(state, 'request', 'INVALID',
        'Use whole-number totals: 3-6 instances, 1-300 requests/second, 40-200 connections, and a listed fixture.');
    }
    if (state.configuration) {
      return record(state, 'request', 'BLOCKED', 'One bounded scale-out request per rehearsal. Reset to change the requested envelope.');
    }
    state.configuration = { targetInstances, demandRps, connectionLimit, condition };
    state.activeCondition = condition;
    state.requestEpoch += 1;
    state.phase = 'requested';
    for (let number = 3; number <= targetInstances; number += 1) {
      state.instances.push({
        id: `instance-${number}`, baseline: false, deployed: false,
        readiness: 'pending', observedAtSeconds: null
      });
    }
    return record(state, 'request', 'PASS',
      'Extra instances requested only. Deployed, ready, and traffic-eligible capacity have not increased.',
      [check('requested-only', 'pass', 2, state.eligibleIds.length, 'eligible instances')]);
  }

  function observeCapacity(state) {
    if (!state.configuration) return record(state, 'observe', 'BLOCKED', 'Request additional instances first.');
    if (state.phase === 'admitted') {
      return record(state, 'observe', 'BLOCKED', 'This admission sample is complete. Recover the fixture for a new bounded sample or reset.');
    }
    state.observationStep = Math.min(2, state.observationStep + 1);
    state.verification = null;
    const condition = state.activeCondition;
    const lastId = `instance-${state.configuration.targetInstances}`;
    for (const instance of state.instances) {
      instance.observedAtSeconds = state.clockSeconds;
      if (instance.baseline) continue;
      if (condition === 'capacity-unknown') {
        instance.deployed = null;
        instance.readiness = 'unknown';
      } else if (condition === 'provisioning-failure') {
        instance.deployed = false;
        instance.readiness = 'failed';
      } else {
        instance.deployed = true;
        instance.readiness = state.observationStep === 1 ? 'warming'
          : condition === 'unready' && instance.id === lastId ? 'unready' : 'ready';
      }
    }
    derive(state);
    state.phase = condition === 'capacity-unknown' ? 'unknown'
      : condition === 'provisioning-failure' ? 'provision-failed'
        : state.capacity.ready === state.capacity.requested ? 'ready' : 'deployed';
    state.observations.push({
      id: `capacity-${String(state.sequence).padStart(3, '0')}`,
      epoch: state.requestEpoch, observedAtSeconds: state.clockSeconds,
      activeCondition: condition, capacity: copy(state.capacity),
      instances: copy(state.instances), connections: copy(state.connections),
      load: copy(state.load), mode: 'synthetic-only'
    });
    const verdict = condition === 'capacity-unknown' ? 'UNVERIFIED'
      : condition === 'provisioning-failure' ? 'FAIL' : 'PASS';
    return record(state, 'observe', verdict,
      condition === 'capacity-unknown' ? 'Capacity telemetry is unknown; confirmed old capacity is a lower bound, not a complete pool.'
        : condition === 'provisioning-failure' ? 'Synthetic provisioning failed. Requested capacity is not deployed or ready capacity.'
          : 'Per-instance capacity observed. An observation does not itself authorize more traffic.');
  }

  function capacityChecks(state) {
    const observation = state.observations.at(-1);
    const age = observation ? state.clockSeconds - observation.observedAtSeconds : null;
    const known = state.capacity.deployed !== null && state.capacity.ready !== null;
    const currentEpoch = Boolean(observation && observation.epoch === state.requestEpoch);
    return [
      check('observation-epoch', currentEpoch ? 'pass' : 'fail', state.requestEpoch, observation?.epoch ?? null),
      check('freshness', age === null ? 'unknown' : age <= LIMITS.readinessTtlSeconds ? 'pass' : 'fail',
        LIMITS.readinessTtlSeconds, age, 'maximum logical seconds'),
      check('complete-pool', !known ? 'unknown'
        : state.capacity.deployed === state.capacity.requested && state.capacity.ready === state.capacity.requested ? 'pass' : 'fail',
      state.capacity.requested, state.capacity.ready, 'ready instances; every required instance'),
      check('dependency-connections', state.connections.observed === null ? 'unknown'
        : state.connections.withinLimit ? 'pass' : 'fail',
      state.connections.limit, state.connections.observed, 'maximum pooled connections')
    ];
  }

  function verifyCapacity(state) {
    if (!state.configuration || state.phase === 'admitted') {
      return record(state, 'verify', 'BLOCKED', 'Verification requires a requested, not-yet-admitted capacity sample.');
    }
    const assertions = capacityChecks(state);
    const unknown = assertions.some((item) => item.status === 'unknown');
    const passed = assertions.every((item) => item.status === 'pass');
    state.verification = passed ? {
      observationId: state.observations.at(-1).id,
      observedAtSeconds: state.observations.at(-1).observedAtSeconds,
      verifiedAtSeconds: state.clockSeconds,
      requestEpoch: state.requestEpoch,
      readyIds: state.instances.filter((instance) => instance.readiness === 'ready').map((instance) => instance.id)
    } : null;
    return record(state, 'verify', passed ? 'PASS' : unknown ? 'UNVERIFIED' : 'FAIL',
      passed ? 'Fresh additional ready capacity and aggregate connections verified. Traffic eligibility is still unchanged.'
        : unknown ? 'Required observations are unknown. No admission permission is inferred.'
          : 'Capacity verification failed. Inspect complete-pool, freshness, and dependency observations.',
      assertions);
  }

  function sampleClients(state, sharePercent) {
    const newCount = Math.floor(LIMITS.sampleSize * sharePercent / 100);
    const additional = state.instances.filter((instance) => !instance.baseline);
    return Array.from({ length: LIMITS.sampleSize }, (_, index) => {
      const affected = index < newCount;
      const instance = affected ? additional[index % additional.length] : state.instances[index % 2];
      const missing = affected && state.activeCondition === 'journey-unknown';
      const broken = affected && index === 0 && state.activeCondition === 'broken-connection';
      const late = affected && state.activeCondition === 'slow-journey';
      const latencyMs = missing || broken ? null : late ? 850 + index * 10 : (affected ? 220 : 160) + index % 4 * 20;
      return {
        id: `round-${state.admissionRound}-client-${String(index + 1).padStart(2, '0')}`,
        instanceId: instance.id, fixtureVersion: 'same-version-v1',
        affected, kind: affected ? 'transition-to-added-instance' : 'old-only',
        startedAtLogicalSeconds: state.clockSeconds,
        latencyMs, budgetMs: LIMITS.journeyBudgetMs,
        connection: missing ? 'unknown' : broken ? 'broken' : 'preserved',
        stateIntact: missing ? null : true, effectCount: missing ? null : 1,
        outcome: missing ? 'unknown' : broken || late ? 'interrupted' : 'uninterrupted'
      };
    });
  }

  function admit(state, input) {
    const sharePercent = isObject(input) ? integer(input.sharePercent, 1, 100) : null;
    if (sharePercent === null) {
      return record(state, 'admit', 'INVALID', 'New-instance traffic share must be a whole-number percentage from 1 to 100.');
    }
    const observation = state.observations.at(-1);
    const token = state.verification;
    const verified = Boolean(token && observation && token.observationId === observation.id
      && token.requestEpoch === state.requestEpoch && state.phase !== 'admitted');
    const demand = state.load.plannedRps;
    const oldLimit = 2 * LIMITS.perInstanceRps * LIMITS.utilizationPercent / 100;
    const newLimit = (state.capacity.requested - 2) * LIMITS.perInstanceRps * LIMITS.utilizationPercent / 100;
    const totalLimit = state.load.readyCapacityRps === null ? null
      : state.load.readyCapacityRps * LIMITS.utilizationPercent / 100;
    const affectedCount = Math.floor(LIMITS.sampleSize * sharePercent / 100);
    const measuredShare = affectedCount / LIMITS.sampleSize;
    const assertions = [
      check('capacity-verification', verified ? 'pass' : 'fail', 'fresh verified latest complete pool', token?.observationId ?? null),
      ...capacityChecks(state),
      check('load-total', totalLimit === null ? 'unknown' : demand <= totalLimit ? 'pass' : 'fail',
        totalLimit, demand, 'maximum requests/second at 80% utilization'),
      check('load-old', demand * (1 - sharePercent / 100) <= oldLimit ? 'pass' : 'fail',
        oldLimit, demand * (1 - sharePercent / 100), 'maximum old-pool requests/second'),
      check('load-new', demand * sharePercent / 100 <= newLimit ? 'pass' : 'fail',
        newLimit, demand * sharePercent / 100, 'maximum new-pool requests/second'),
      check('sample-load-old', demand * (1 - measuredShare) <= oldLimit ? 'pass' : 'fail',
        oldLimit, demand * (1 - measuredShare), 'maximum observed old-pool requests/second'),
      check('sample-load-new', demand * measuredShare <= newLimit ? 'pass' : 'fail',
        newLimit, demand * measuredShare, 'maximum observed new-pool requests/second'),
      check('affected-sample', affectedCount > 0 ? 'pass' : 'fail', 'at least one affected client', affectedCount, 'clients')
    ];
    if (!assertions.every((item) => item.status === 'pass')) {
      return record(state, 'admit', 'BLOCKED',
        'Increased admission blocked. No new transition journeys were attempted; old eligibility and all prior outcomes are preserved.',
        assertions);
    }
    state.admissionRound += 1;
    const journeys = sampleClients(state, sharePercent);
    const affected = journeys.filter((client) => client.affected);
    const interrupted = affected.filter((client) => client.outcome === 'interrupted').length;
    const unknown = affected.filter((client) => client.outcome === 'unknown').length;
    state.clients.push(...journeys);
    state.totals.attemptedTransitions += affected.length;
    state.totals.interruptedTransitions += interrupted;
    state.totals.unknownTransitions += unknown;
    state.totals.successfulTransitions += affected.length - interrupted - unknown;
    state.totals.oldOnlyJourneys += journeys.length - affected.length;
    state.totals.oldOnlySuccessful += journeys.filter((client) => !client.affected && client.outcome === 'uninterrupted').length;
    state.eligibleIds = state.instances.filter((instance) => instance.readiness === 'ready').map((instance) => instance.id);
    state.phase = 'admitted';
    state.load.observedRps = demand;
    state.load.requestedNewSharePercent = sharePercent;
    state.load.observedNewSharePercent = measuredShare * 100;
    state.load.oldPoolRps = demand * (1 - measuredShare);
    state.load.newPoolRps = demand * measuredShare;
    const knownLatencies = affected.map((client) => client.latencyMs).filter((value) => value !== null);
    const missingCompletions = affected.filter((client) => client.latencyMs === null).length;
    const overBudgetCompletions = knownLatencies.filter((latency) => latency > LIMITS.journeyBudgetMs).length;
    assertions.push(
      {
        ...check('journey-budget', interrupted > 0 ? 'fail' : unknown > 0 ? 'unknown' : 'pass',
          LIMITS.journeyBudgetMs, knownLatencies.length ? Math.max(...knownLatencies) : null,
          'maximum observed completion milliseconds; incomplete journeys cannot pass'),
        missingCompletions, overBudgetCompletions
      },
      check('journey-connections', affected.some((client) => client.connection === 'broken') ? 'fail' : unknown > 0 ? 'unknown' : 'pass',
        'preserved', interrupted && state.activeCondition === 'broken-connection' ? 'broken' : unknown ? 'unknown' : 'preserved'),
      check('journey-state-effects', unknown ? 'unknown' : 'pass', 'intact state and exactly one effect',
        unknown ? 'unknown' : 'intact state and exactly one effect'),
      check('observed-new-admissions', 'pass', '> 0', measuredShare * 100,
        `percent observed from client instance IDs; requested ${sharePercent}%`)
    );
    return record(state, 'admit', interrupted ? 'FAIL' : unknown ? 'UNVERIFIED' : 'PASS',
      interrupted ? 'Added-instance journeys were interrupted. Readiness alone did not establish the client budget or connection outcome.'
        : unknown ? 'Added-instance admissions occurred but their client outcomes are unknown. They remain in the denominator.'
          : 'Added-instance client journeys passed this synthetic sample. Old-only successes are not transition successes.',
      assertions, journeys);
  }

  function recover(state) {
    if (!state.configuration) return record(state, 'recover', 'BLOCKED', 'Request additional instances before recovering a fixture.');
    state.activeCondition = 'healthy';
    state.requestEpoch += 1;
    state.observationStep = 0;
    state.verification = null;
    state.phase = 'requested';
    state.eligibleIds = ['instance-1', 'instance-2'];
    state.instances = baselineInstances();
    for (let number = 3; number <= state.configuration.targetInstances; number += 1) {
      state.instances.push({
        id: `instance-${number}`, baseline: false, deployed: false, readiness: 'pending', observedAtSeconds: null
      });
    }
    state.load.observedRps = 80;
    state.load.oldPoolRps = 80;
    state.load.newPoolRps = 0;
    state.load.requestedNewSharePercent = 0;
    state.load.observedNewSharePercent = null;
    return record(state, 'recover', 'PASS',
      'Synthetic fixture recovery starts a new observation epoch and stops added-instance admission. Historical failures and unknowns are retained; no native rollback or recovered user is claimed.');
  }

  function transition(previous, action, input = {}) {
    if (!isObject(previous) || previous.schemaVersion !== 1 || previous.sourceId !== 'S011') {
      throw new TypeError('Expected a state created by S011ScaleOut.createRehearsal().');
    }
    if (action === 'reset') return createRehearsal();
    const state = copy(previous);
    state.sequence += 1;
    state.clockSeconds += action === 'wait' ? 31 : 10;
    if (action === 'request') return requestScale(state, input);
    if (action === 'observe') return observeCapacity(state);
    if (action === 'verify') return verifyCapacity(state);
    if (action === 'admit') return admit(state, input);
    if (action === 'recover') return recover(state);
    if (action === 'wait') return record(state, action, 'PASS', 'Advanced the logical clock by 31 seconds. Readiness age is measured at the next gate, not refreshed by waiting.');
    if (action === 'add-slot') {
      if (state.slots >= 4) return record(state, action, 'BLOCKED', 'The four-slot training limit is reached. Slots do not add compute.');
      state.slots += 1;
      return record(state, action, 'PASS', 'A synthetic slot was added, not compute capacity. The underlying instance pool and all transition outcomes are unchanged.');
    }
    return record(state, typeof action === 'string' ? action : '(invalid action)', 'INVALID', 'Unknown operator action. No capacity or client outcome changed.');
  }

  const api = freeze({ createRehearsal, transition, LIMITS, CONDITIONS });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.S011ScaleOut = api;
}(typeof globalThis === 'undefined' ? this : globalThis));
