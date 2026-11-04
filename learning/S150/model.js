(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S150Model = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const LIMITS = Object.freeze({ rehearsals: 4, attempts: 5, events: 12, retentionTicks: 2 });
  const ENVELOPE = Object.freeze({
    host: 'fictional independently controlled v1/v2 deployments', format: 'offline teaching data',
    oldEpoch: 17, candidateEpoch: 18, journeyBudgetMs: 2500, drainBudgetTicks: 2,
    maxJobDurationTicks: 2, rollbackRetentionUntilTick: 2, readinessFreshnessTicks: 1,
    productionLoad: 'not measured', supportedFailureModel: 'named fixed snapshots only',
  });
  const ROW_IDS = Object.freeze(['routing-v1', 'session-v1', 'job-v1', 'artifact-v1',
    'lease-v1', 'retained-capacity-v1']);
  const GUARDS = Object.freeze([
    ['routing-exhaustion', 'routing-v1', 'Effective old routes', 'No old destination remains.', 'A client can still reach v1.'],
    ['session-handoff', 'session-v1', 'Sessions and state', 'Every required old session has completed or transferred.', 'An original session or form still needs v1.'],
    ['work-drain', 'job-v1', 'Jobs and in-flight work', 'Old jobs and in-flight work are observed finished or continued.', 'Required work can be abandoned.'],
    ['asset-contracts', 'artifact-v1', 'Artifacts and assets', 'No required artifact needs v1 and assets remain compatible.', 'An already-open page or required artifact can break.'],
    ['ownership-release', 'lease-v1', 'Ownership leases', 'Old ownership is observed released with fencing proof.', 'An owner can be orphaned or a business effect duplicated.'],
    ['rollback-retention', 'retained-capacity-v1', 'Retained capacity', 'The observed rollback window has ended and no required capacity remains.', 'A promised compatible rollback destination is still required.'],
    ['declared-drain', 'declared-drain-proof', 'Declared drain proof', 'The declared drain proof passes, including zero in-flight work.', 'Zero job counts alone do not prove safe drain.'],
    ['declared-contracts', 'declared-contract-proof', 'Declared contracts', 'Required cross-version contracts are observed compatible.', 'A required n-tier contract can fail after retirement.'],
    ['candidate-readiness', 'candidate-v2', 'Fresh candidate readiness', 'Health, capacity, compatibility and freshness all pass.', 'A green health check can conceal stale or incompatible capacity.'],
    ['effect-correctness', 'effect-order-17', 'Business effect', 'The original journey has exactly one observed required effect.', 'Missing or duplicate effects violate the original journey.'],
    ['journey-completion', 'journey-order-17', 'Original journey continuation', 'Required original state and connections survive and final tier identities are observed.', 'A unfinished or unobserved original journey still requires continuation.'],
  ].map(([id, dependencyId, label, expected, userImpact]) =>
    Object.freeze({ id, dependencyId, label, expected, userImpact })));
  const SUMMARY = Object.freeze({
    id: 'no-v1-dependencies', dependencyId: 'all-required-inventory',
    label: 'All required checks pass',
  });
  const DECISIONS = Object.freeze(['REJECTED', 'HELD_UNVERIFIED', 'SIMULATED_RETIRED']);
  const FIXTURE_IDS = Object.freeze(['outstanding', 'routing-remains', 'session-remains',
    'job-remains', 'artifact-remains', 'lease-remains', 'retention-open', 'drain-unproven',
    'contract-unproven', 'readiness-stale', 'duplicate-effect', 'unobserved', 'mixed-unknown', 'clear']);
  const copy = (value) => JSON.parse(JSON.stringify(value));
  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
  function requireState(condition, message) {
    if (!condition) fail('ERR_STATE', message);
  }
  function exact(value, keys, label, code = 'ERR_EVIDENCE') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)
        || Object.getPrototypeOf(value) !== Object.prototype
        || Object.keys(value).length !== keys.length
        || !keys.every((key) => Object.hasOwn(value, key))) {
      fail(code, `${label} must have the exact declared fields.`);
    }
  }
  function integer(value, max, label, nullable = true) {
    if (nullable && value === null) return;
    if (!Number.isSafeInteger(value) || value < 0 || value > max) {
      fail('ERR_EVIDENCE', `${label} must be a bounded integer, never a coerced count.`);
    }
  }
  function boolean(value, label, nullable = true) {
    if ((nullable && value === null) || typeof value === 'boolean') return;
    fail('ERR_EVIDENCE', `${label} must be a typed boolean or an explicit unknown.`);
  }
  function tiers(value) {
    exact(value, ['frontend', 'api', 'worker'], 'Tier identities');
    for (const version of Object.values(value)) {
      if (version !== null && version !== 'v1' && version !== 'v2') {
        fail('ERR_EVIDENCE', 'Tier identities must be v1, v2 or explicitly unobserved.');
      }
    }
  }
  function fixture(id) {
    if (typeof id !== 'string' || !FIXTURE_IDS.includes(id)) {
      fail('ERR_INPUT', 'Choose one of the fourteen named fictional snapshots.');
    }
    const evidence = {
      epoch: 17, candidateEpoch: 18, tick: 2, observedAtTick: 2,
      signals: { desiredV2Percent: 100, healthyV2: true, greenRequests: 200 },
      inventory: ROW_IDS.map((dependencyId) => ({
        id: dependencyId, version: 'v1', required: true, observed: true, count: 0,
      })),
      proofs: {
        drain: true, assets: true, leases: true, contracts: true, inflight: 0,
        candidateFresh: true, candidateCapacity: true, candidateCompatible: true,
      },
      rollback: {
        untilTick: 2, clockObserved: true, readyV1: true, compatibleV1: true, assetsRetained: true,
      },
      journey: {
        id: 'journey-order-17', observed: true, completed: true, budgetMs: 2500,
        elapsedMs: 1200, authenticated: true, sessionStable: true, formPreserved: true,
        navigationIntact: true, connectionIntact: true, dataCorrect: true, effectCount: 1,
        initialTiers: { frontend: 'v1', api: 'v1', worker: 'v1' },
        finalTiers: { frontend: 'v2', api: 'v2', worker: 'v2' }, interruptions: [],
        events: [
          { phase: 'crossing', elapsedMs: 400, status: 'IN_PROGRESS', tiers: { frontend: 'v1', api: 'v2', worker: 'v1' } },
          { phase: 'completed', elapsedMs: 1200, status: 'COMPLETE', tiers: { frontend: 'v2', api: 'v2', worker: 'v2' } },
        ],
      },
    };
    const count = (dependencyId, value) => {
      evidence.inventory.find((row) => row.id === dependencyId).count = value;
    };
    if (id === 'outstanding') {
      for (const dependencyId of ROW_IDS.slice(1)) count(dependencyId, 1);
      evidence.tick = 0;
      evidence.observedAtTick = 0;
      Object.assign(evidence.proofs, { drain: false, assets: false, leases: false, inflight: 1 });
      Object.assign(evidence.journey, {
        completed: false, elapsedMs: 2601,
        finalTiers: { frontend: 'v1', api: 'v2', worker: 'v1' },
        interruptions: ['latency_budget'],
        events: [{ phase: 'crossing', elapsedMs: 2601, status: 'ERROR',
          tiers: { frontend: 'v1', api: 'v2', worker: 'v1' } }],
      });
    } else if (['routing-remains', 'session-remains', 'job-remains', 'artifact-remains',
      'lease-remains'].includes(id)) {
      count(ROW_IDS[['routing-remains', 'session-remains', 'job-remains',
        'artifact-remains', 'lease-remains'].indexOf(id)], 1);
      if (id === 'job-remains') Object.assign(evidence.proofs, { drain: false, inflight: 1 });
      if (id === 'artifact-remains') evidence.proofs.assets = false;
      if (id === 'lease-remains') evidence.proofs.leases = false;
    } else if (id === 'retention-open') {
      count('retained-capacity-v1', 1);
      evidence.tick = 0;
      evidence.observedAtTick = 0;
    } else if (id === 'drain-unproven') evidence.proofs.drain = false;
    else if (id === 'contract-unproven') evidence.proofs.contracts = false;
    else if (id === 'readiness-stale') evidence.proofs.candidateFresh = false;
    else if (id === 'duplicate-effect') {
      evidence.journey.effectCount = 2;
      evidence.journey.interruptions = ['duplicate_effect'];
    } else if (id === 'unobserved') {
      for (const row of evidence.inventory) Object.assign(row, { observed: false, count: null });
      for (const key of Object.keys(evidence.proofs)) evidence.proofs[key] = null;
      evidence.observedAtTick = null;
      Object.assign(evidence.rollback, {
        untilTick: null, clockObserved: false, readyV1: null, compatibleV1: null, assetsRetained: null,
      });
      for (const key of ['observed', 'completed', 'authenticated', 'sessionStable',
        'formPreserved', 'navigationIntact', 'connectionIntact', 'dataCorrect']) {
        evidence.journey[key] = key === 'observed' ? false : null;
      }
      evidence.journey.elapsedMs = null;
      evidence.journey.effectCount = null;
      evidence.journey.finalTiers = { frontend: null, api: null, worker: null };
      evidence.journey.events = [{ phase: 'crossing', elapsedMs: null, status: 'UNKNOWN',
        tiers: { frontend: null, api: null, worker: null } }];
    } else if (id === 'mixed-unknown') {
      count('job-v1', 1);
      Object.assign(evidence.proofs, { drain: false, inflight: 1, assets: null });
      Object.assign(evidence.inventory.find((row) => row.id === 'artifact-v1'), {
        observed: false, count: null,
      });
    }
    return evidence;
  }
  function validateEvidence(evidence) {
    exact(evidence, ['epoch', 'candidateEpoch', 'tick', 'observedAtTick', 'signals',
      'inventory', 'proofs', 'rollback', 'journey'], 'Evidence');
    if (evidence.epoch !== 17 || evidence.candidateEpoch !== 18) {
      fail('ERR_EVIDENCE', 'The exact original and candidate epochs are required.');
    }
    integer(evidence.tick, 2, 'Tick', false);
    integer(evidence.observedAtTick, 2, 'Observation tick');
    if (evidence.observedAtTick !== null && evidence.observedAtTick > evidence.tick) {
      fail('ERR_EVIDENCE', 'A future observation cannot establish freshness.');
    }
    exact(evidence.signals, ['desiredV2Percent', 'healthyV2', 'greenRequests'], 'Routing signals');
    integer(evidence.signals.desiredV2Percent, 100, 'Routing percentage', false);
    integer(evidence.signals.greenRequests, 1000, 'Green requests', false);
    boolean(evidence.signals.healthyV2, 'Candidate health');
    if (!Array.isArray(evidence.inventory) || evidence.inventory.length !== ROW_IDS.length) {
      fail('ERR_EVIDENCE', 'Every exact required inventory dependency must be present.');
    }
    evidence.inventory.forEach((row, index) => {
      exact(row, ['id', 'version', 'required', 'observed', 'count'], 'Inventory row');
      if (row.id !== ROW_IDS[index] || row.version !== 'v1' || row.required !== true) {
        fail('ERR_EVIDENCE', 'Required dependency identities, order and typed required=true are immutable.');
      }
      boolean(row.observed, 'Observation flag', false);
      integer(row.count, 3, 'Required dependency count');
    });
    exact(evidence.proofs, ['drain', 'assets', 'leases', 'contracts', 'inflight',
      'candidateFresh', 'candidateCapacity', 'candidateCompatible'], 'Declared proofs');
    for (const [key, value] of Object.entries(evidence.proofs)) {
      if (key === 'inflight') integer(value, 3, 'In-flight work');
      else boolean(value, key);
    }
    exact(evidence.rollback, ['untilTick', 'clockObserved', 'readyV1',
      'compatibleV1', 'assetsRetained'], 'Rollback retention');
    integer(evidence.rollback.untilTick, 2, 'Rollback deadline');
    for (const key of ['clockObserved', 'readyV1', 'compatibleV1', 'assetsRetained']) {
      boolean(evidence.rollback[key], key, key !== 'clockObserved');
    }
    const journey = evidence.journey;
    exact(journey, ['id', 'observed', 'completed', 'budgetMs', 'elapsedMs', 'authenticated',
      'sessionStable', 'formPreserved', 'navigationIntact', 'connectionIntact', 'dataCorrect',
      'effectCount', 'initialTiers', 'finalTiers', 'interruptions', 'events'], 'Original journey');
    if (journey.id !== 'journey-order-17' || journey.budgetMs !== 2500) {
      fail('ERR_EVIDENCE', 'The original journey identity and original budget cannot be replaced.');
    }
    for (const key of ['observed', 'completed', 'authenticated', 'sessionStable',
      'formPreserved', 'navigationIntact', 'connectionIntact', 'dataCorrect']) {
      boolean(journey[key], key, key !== 'observed');
    }
    integer(journey.elapsedMs, 10000, 'Original journey elapsed time');
    integer(journey.effectCount, 3, 'Original business effect count');
    tiers(journey.initialTiers);
    tiers(journey.finalTiers);
    if (!Object.values(journey.initialTiers).every((version) => version === 'v1')) {
      fail('ERR_EVIDENCE', 'The original journey starts on the original v1 tiers.');
    }
    if (!Array.isArray(journey.interruptions) || journey.interruptions.length > 4
        || !journey.interruptions.every((value) => ['latency_budget', 'duplicate_effect',
          'missing_effect', 'state_or_connection'].includes(value))
        || new Set(journey.interruptions).size !== journey.interruptions.length) {
      fail('ERR_EVIDENCE', 'Interruption records must use the exact bounded teaching codes.');
    }
    if (!Array.isArray(journey.events) || journey.events.length < 1 || journey.events.length > 4) {
      fail('ERR_EVIDENCE', 'The original journey event history must be bounded and retained.');
    }
    for (const event of journey.events) {
      exact(event, ['phase', 'elapsedMs', 'status', 'tiers'], 'Journey event');
      if (!['crossing', 'completed'].includes(event.phase)
          || !['IN_PROGRESS', 'COMPLETE', 'ERROR', 'UNKNOWN'].includes(event.status)) {
        fail('ERR_EVIDENCE', 'Choose declared journey event states only.');
      }
      integer(event.elapsedMs, 10000, 'Journey event elapsed time');
      tiers(event.tiers);
    }
  }
  const boolStatus = (value) => value === null ? 'UNKNOWN' : value === true ? 'PASS' : 'BLOCKED';
  const zeroStatus = (count, observed = true) =>
    !observed || count === null ? 'UNKNOWN' : count === 0 ? 'PASS' : 'BLOCKED';
  const merge = (values) => values.includes('BLOCKED') ? 'BLOCKED'
    : values.includes('UNKNOWN') ? 'UNKNOWN' : 'PASS';
  function userImpact(journey) {
    const interruptions = [...journey.interruptions];
    if (journey.elapsedMs !== null && journey.elapsedMs > journey.budgetMs
        && !interruptions.includes('latency_budget')) interruptions.push('latency_budget');
    if (journey.effectCount !== null && journey.effectCount !== 1) {
      const code = journey.effectCount === 0 ? 'missing_effect' : 'duplicate_effect';
      if (!interruptions.includes(code)) interruptions.push(code);
    }
    if (['authenticated', 'sessionStable', 'formPreserved', 'navigationIntact',
      'connectionIntact', 'dataCorrect'].some((key) => journey[key] === false)
        && !interruptions.includes('state_or_connection')) interruptions.push('state_or_connection');
    const complete = journey.observed === true && journey.completed === true
      && ['authenticated', 'sessionStable', 'formPreserved', 'navigationIntact',
        'connectionIntact', 'dataCorrect'].every((key) => journey[key] === true)
      && Object.values(journey.finalTiers).every((version) => version === 'v2')
      && journey.elapsedMs !== null && journey.effectCount === 1;
    return {
      originalJourneyId: journey.id, originalBudgetMs: journey.budgetMs,
      elapsedMs: journey.elapsedMs, effectId: 'effect-order-17', effectCount: journey.effectCount,
      initialTiers: copy(journey.initialTiers), finalTiers: copy(journey.finalTiers),
      authenticated: journey.authenticated, sessionStable: journey.sessionStable,
      formPreserved: journey.formPreserved, navigationIntact: journey.navigationIntact,
      connectionIntact: journey.connectionIntact, dataCorrect: journey.dataCorrect,
      completed: journey.completed, interruptions, events: copy(journey.events),
      classification: interruptions.length ? 'INTERRUPTED_TRANSITION'
        : complete ? 'SYNTHETIC_UNINTERRUPTED_TRANSITION' : 'UNVERIFIED',
      migrationCertified: false, nativeJourneyObserved: false,
    };
  }
  function verifyEvidence(evidence) {
    validateEvidence(evidence);
    const rows = Object.fromEntries(evidence.inventory.map((row) => [row.id, row]));
    const rowStatus = (id) => zeroStatus(rows[id].count, rows[id].observed);
    const proof = evidence.proofs;
    const rollback = evidence.rollback;
    const journey = evidence.journey;
    const timeStatus = !rollback.clockObserved || rollback.untilTick === null ? 'UNKNOWN'
      : evidence.tick >= rollback.untilTick ? 'PASS' : 'BLOCKED';
    const rollbackStillRequired = timeStatus !== 'PASS';
    const requiredFacts = [
      [rowStatus('routing-v1')],
      [rowStatus('session-v1')],
      [rowStatus('job-v1'), zeroStatus(proof.inflight), boolStatus(proof.drain)],
      [rowStatus('artifact-v1'), boolStatus(proof.assets)],
      [rowStatus('lease-v1'), boolStatus(proof.leases)],
      [rowStatus('retained-capacity-v1'), timeStatus,
        ...['readyV1', 'compatibleV1', 'assetsRetained'].map((key) =>
          rollbackStillRequired ? boolStatus(rollback[key]) : 'PASS')],
      [boolStatus(proof.drain), zeroStatus(proof.inflight)],
      [boolStatus(proof.contracts)],
      [boolStatus(evidence.signals.healthyV2), boolStatus(proof.candidateFresh),
        boolStatus(proof.candidateCapacity), boolStatus(proof.candidateCompatible),
        evidence.observedAtTick === null ? 'UNKNOWN'
          : evidence.tick - evidence.observedAtTick <= ENVELOPE.readinessFreshnessTicks ? 'PASS' : 'BLOCKED'],
      [!journey.observed || journey.effectCount === null ? 'UNKNOWN'
        : journey.effectCount === 1 ? 'PASS' : 'BLOCKED'],
      [journey.observed ? 'PASS' : 'UNKNOWN', boolStatus(journey.completed),
        journey.elapsedMs === null ? 'UNKNOWN' : 'PASS',
        ...['authenticated', 'sessionStable', 'formPreserved', 'navigationIntact',
          'connectionIntact', 'dataCorrect'].map((key) => boolStatus(journey[key])),
        ...Object.values(journey.finalTiers).map((version) =>
          version === null ? 'UNKNOWN' : version === 'v2' ? 'PASS' : 'BLOCKED')],
    ];
    const status = requiredFacts.map(merge);
    const facts = [
      rows['routing-v1'], rows['session-v1'],
      { row: rows['job-v1'], inflight: proof.inflight, declaredDrain: proof.drain },
      { row: rows['artifact-v1'], assetProof: proof.assets },
      { row: rows['lease-v1'], fencingProof: proof.leases },
      { row: rows['retained-capacity-v1'], tick: evidence.tick, ...rollback },
      { declaredDrain: proof.drain, inflight: proof.inflight },
      { compatible: proof.contracts },
      { health: evidence.signals.healthyV2, fresh: proof.candidateFresh,
        capacity: proof.candidateCapacity, compatible: proof.candidateCompatible,
        observedAtTick: evidence.observedAtTick, currentTick: evidence.tick },
      { originalJourneyId: journey.id, observed: journey.observed, effectCount: journey.effectCount },
      copy(journey),
    ];
    const guards = GUARDS.map((guard, index) => ({
      ...guard, required: true, status: status[index],
      hasUnknownRequiredFact: requiredFacts[index].includes('UNKNOWN'), actual: copy(facts[index]),
      reason: status[index] === 'PASS' ? 'Declared fictional proof passes.'
        : status[index] === 'BLOCKED' ? 'Known required dependency or proof prevents deletion.'
          : 'Required observation is missing; deletion must remain held.',
    }));
    const blocked = guards.filter((guard) => guard.status === 'BLOCKED').map((guard) => guard.id);
    const unknown = guards.filter((guard) => guard.hasUnknownRequiredFact).map((guard) => guard.id);
    const decision = blocked.length ? 'REJECTED' : unknown.length ? 'HELD_UNVERIFIED' : 'SIMULATED_RETIRED';
    return {
      id: 'no-v1-dependency', decision, blocked, unknown, guards,
      inventoryVerifier: {
        id: 'all-required-inventory', status: blocked.length ? 'FAIL' : unknown.length ? 'UNKNOWN' : 'PASS',
      },
      controlVerifier: {
        id: 'must-prevent-deletion', status: 'PASS',
        result: decision === 'SIMULATED_RETIRED' ? 'Only retirement teaching data may change.' : 'Retirement and deletion held.',
      },
      userImpact: userImpact(journey),
      cleanupOutcome: decision === 'REJECTED' ? 'HELD_WITH_REQUIRED_DEPENDENCIES'
        : decision === 'HELD_UNVERIFIED' ? 'HELD_UNVERIFIED' : 'SIMULATED_RETIRED_NO_DELETION',
      remainingResourceStatus: evidence.inventory.map((row) => ({
        dependencyId: row.id, version: row.version, required: row.required,
        observed: row.observed, count: row.count, status: rowStatus(row.id),
      })),
      deletionPerformed: false, migrationCertified: false, retirementDataOnly: true,
    };
  }
  const TYPES = Object.freeze(['begin', 'verify', 'record-proofs', 'observe-retention-end',
    'check', 'archive', 'reset']);
  function createLesson() {
    let revision = 0;
    let serial = 0;
    let current = null;
    let history = [];
    function snapshot() {
      const totals = { rehearsals: 0, attempts: 0, rejected: 0, unknown: 0, simulatedRetired: 0,
        learnerPassed: 0, learnerFailed: 0, attemptedJourneys: 0, interruptedJourneys: 0, unverifiedJourneys: 0 };
      for (const run of current ? [...history, current] : history) {
        totals.rehearsals++;
        if (run.attempts.length) {
          totals.attemptedJourneys++;
          const impact = userImpact(run.evidence.journey);
          if (impact.classification === 'INTERRUPTED_TRANSITION') totals.interruptedJourneys++;
          if (impact.classification === 'UNVERIFIED') totals.unverifiedJourneys++;
        }
        for (const attempt of run.attempts) {
          totals.attempts++;
          totals[attempt.decision === 'REJECTED' ? 'rejected'
            : attempt.decision === 'HELD_UNVERIFIED' ? 'unknown' : 'simulatedRetired']++;
        }
        for (const check of run.checks) totals[check.status === 'PASS' ? 'learnerPassed' : 'learnerFailed']++;
      }
      return copy({ revision, phase: current ? 'active' : 'idle', current, history, totals, limits: LIMITS });
    }
    function record(type) {
      current.trace.push({
        sequence: current.trace.length + 1, type, revision: revision + 1, epoch: current.evidence.epoch,
        lifecycle: current.lifecycle, tick: current.evidence.tick,
        inventory: copy(current.evidence.inventory),
        originalJourney: copy(current.evidence.journey),
        latestDecision: current.latest ? current.latest.decision : 'NOT_CHECKED',
        deletionPerformed: false,
      });
    }
    function dispatch(command) {
      exact(command, ['type', 'revision', 'runId', 'value'], 'Command', 'ERR_INPUT');
      if (typeof command.type !== 'string' || !TYPES.includes(command.type)) {
        fail('ERR_INPUT', 'Choose a named lesson action; no retirement or deletion operation exists.');
      }
      if (!Number.isSafeInteger(command.revision) || command.revision !== revision
          || command.runId !== (current ? current.id : null)) {
        fail('ERR_REPLAY', 'The exact current run and revision are required; stale or replayed commands reject.');
      }
      if (command.type === 'begin') fixture(command.value);
      else if (command.type === 'check') {
        exact(command.value, ['guardId', 'dependencyId', 'decision'], 'Answer', 'ERR_INPUT');
        if (typeof command.value.guardId !== 'string'
            || ![...GUARDS, SUMMARY].some((guard) => guard.id === command.value.guardId)
            || typeof command.value.dependencyId !== 'string'
            || ![...GUARDS, SUMMARY].some((guard) => guard.dependencyId === command.value.dependencyId)
            || typeof command.value.decision !== 'string' || !DECISIONS.includes(command.value.decision)) {
          fail('ERR_INPUT', 'Select exact named guard, dependency and retirement decision tokens.');
        }
      } else if (command.value !== null) fail('ERR_INPUT', 'This action requires value=null, not truthy input.');
      if (command.type === 'reset') {
        current = null;
        history = [];
        revision++;
        return snapshot();
      }
      if (command.type === 'begin') {
        requireState(current === null, 'Archive the current attempted rehearsal or reset before beginning another.');
        if (history.length >= LIMITS.rehearsals) fail('ERR_LIMIT', 'Four rehearsals are retained. Reset explicitly to begin again.');
        const evidence = fixture(command.value);
        current = {
          id: `run-${++serial}`, fixture: command.value, evidence,
          lifecycle: evidence.inventory.slice(0, 5).every((row) => row.observed && row.count === 0)
            && evidence.proofs.drain === true ? 'RETAINED' : 'DRAINING',
          attempts: [], latest: null, checks: [], trace: [], proofStep: 0,
          oldCapacity: 'RETAINED_IN_TEACHING_DATA', deletionPerformed: false, migrationCertified: false,
        };
      } else {
        requireState(current !== null, 'Begin a named fictional snapshot first.');
        if (command.type !== 'archive') {
          requireState(current.lifecycle !== 'SIMULATED_RETIRED' || command.type === 'check',
            'This teaching run is simulated retired. Archive or reset; repeated retirement rejects.');
          if (current.trace.length >= LIMITS.events - 1) {
            fail('ERR_LIMIT', 'Eleven action events are retained; the final event is reserved for archive or reset.');
          }
        }
        if (command.type === 'verify') {
          if (current.attempts.length >= LIMITS.attempts) fail('ERR_LIMIT', 'Five verification attempts are retained. Archive or reset.');
          const result = verifyEvidence(current.evidence);
          const attempt = {
            attemptId: current.attempts.length + 1, runId: current.id,
            trigger: 'verify-retirement-teaching-data-only', epoch: current.evidence.epoch,
            candidateEpoch: current.evidence.candidateEpoch, revision: revision + 1,
            evidence: copy(current.evidence), ...result, learnerCheck: null,
          };
          if (result.decision === 'SIMULATED_RETIRED') {
            current.lifecycle = 'SIMULATED_RETIRED';
            current.oldCapacity = 'RETIRED_LABEL_IN_TEACHING_DATA';
          }
          current.attempts.push(attempt);
          current.latest = attempt;
        } else if (command.type === 'record-proofs') {
          requireState(current.latest !== null && current.proofStep === 0,
            'Verify the held snapshot first; the named handoff proof observation is available once.');
          const previous = current.evidence;
          const next = fixture('clear');
          next.tick = previous.tick;
          next.observedAtTick = previous.tick;
          next.rollback.untilTick = previous.rollback.untilTick === null ? 2 : previous.rollback.untilTick;
          next.inventory.find((row) => row.id === 'retained-capacity-v1').count =
            next.tick < next.rollback.untilTick ? 1 : 0;
          next.journey = {
            ...next.journey,
            elapsedMs: previous.journey.elapsedMs === null ? 1200
              : Math.max(1200, previous.journey.elapsedMs + 100),
            effectCount: previous.journey.effectCount !== null && previous.journey.effectCount > 1
              ? previous.journey.effectCount : 1,
            interruptions: userImpact(previous.journey).interruptions,
            events: copy(previous.journey.events),
          };
          next.journey.events.push({ phase: 'completed', elapsedMs: next.journey.elapsedMs,
            status: 'COMPLETE', tiers: copy(next.journey.finalTiers) });
          validateEvidence(next);
          current.evidence = next;
          current.proofStep = 1;
          current.lifecycle = 'RETAINED';
        } else if (command.type === 'observe-retention-end') {
          const result = verifyEvidence(current.evidence);
          requireState(current.latest !== null && current.evidence.rollback.clockObserved === true
            && current.evidence.rollback.untilTick !== null
            && current.evidence.tick < current.evidence.rollback.untilTick
            && result.guards.filter((guard) => guard.id !== 'rollback-retention')
              .every((guard) => guard.status === 'PASS'),
          'Only the named observed retention-end snapshot is available, after every other required proof passes.');
          current.evidence.tick = current.evidence.rollback.untilTick;
          current.evidence.observedAtTick = current.evidence.tick;
          Object.assign(current.evidence.inventory.find((row) => row.id === 'retained-capacity-v1'),
            { count: 0, observed: true });
          current.proofStep = 2;
        } else if (command.type === 'check') {
          requireState(current.latest !== null && current.latest.learnerCheck === null,
            'Verify retirement first; each recorded attempt has one answer check.');
          const answer = command.value;
          const guard = [...current.latest.guards, SUMMARY].find((item) => item.id === answer.guardId);
          const isSummary = guard.id === SUMMARY.id;
          const matches = guard.dependencyId === answer.dependencyId
            && answer.decision === current.latest.decision
            && (current.latest.decision === 'SIMULATED_RETIRED' ? isSummary : !isSummary && guard.status !== 'PASS');
          const check = {
            id: 'learner-answer', attemptId: current.latest.attemptId, ...answer,
            status: matches ? 'PASS' : 'FAIL', actualDecision: current.latest.decision,
            explanation: matches ? 'The exact required guard/dependency and decision match the recorded proof.'
              : 'Use a displayed BLOCKED or UNKNOWN required guard, its exact dependency and the recorded decision; only all-pass uses the summary.',
            retirementDecisionUnchanged: true, deletionPerformed: false, migrationCertified: false,
          };
          current.latest.learnerCheck = check;
          current.checks.push(check);
        } else if (command.type === 'archive') {
          requireState(current.latest !== null, 'Conduct at least one verification before archiving.');
          record('archive');
          history.push(current);
          current = null;
          revision++;
          return snapshot();
        }
      }
      record(command.type);
      revision++;
      return snapshot();
    }
    return {
      snapshot, dispatch,
      exportReport() {
        return {
          schemaVersion: 1, cardId: 'A-S150', sourceId: 'S150', parentId: 'D-S150',
          packet: 'SC-S150', kanoUnit: 'A-S150', mode: 'FIXED_FICTIONAL_TEACHING_DATA',
          banner: BANNER, envelope: copy(ENVELOPE), ...snapshot(),
          deletionPerformed: false, nativeMigrationObserved: false, sourceParentComplete: false,
          productionNode24Validated: false, reliabilityGuarantee: false,
        };
      },
    };
  }
  return { BANNER, LIMITS, ENVELOPE, FIXTURE_IDS, GUARDS, SUMMARY, DECISIONS,
    fixture, verifyEvidence, createLesson };
}));
