(function (root) {
  'use strict';

  const LIMIT = 20;
  const OLD = 'fiction-old-r1';
  const CANARY = 'fiction-canary-r2';
  const PREVIEW = 'fiction-preview-r3';
  const allocations = { '80/20/0': [80, 20, 0], '0/100/0': [0, 100, 0] };
  const fixtureNames = [
    'healthy', 'probe-only', 'readiness-unknown', 'preview-leak', 'callback-broken',
    'preview-unknown', 'preview-after-promotion', 'route-unknown', 'pinned-old', 'candidate-fault',
    'journey-unknown', 'old-work', 'drain-unknown', 'rollback-incompatible', 'rollback-unknown',
  ];
  const copy = (value) => JSON.parse(JSON.stringify(value));
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  const revisions = freeze([
    { revision: OLD, software: 'v1', role: 'old', immutableTeachingRecord: true },
    { revision: CANARY, software: 'v2', role: 'canary', immutableTeachingRecord: true },
    { revision: PREVIEW, software: 'v3', role: 'authorized preview', immutableTeachingRecord: true },
  ]);
  function readinessRow(revision) {
    return {
      revision, provisioned: true, startup: [true, true], readiness: [true, true],
      dependency: 'pass', stateCompatibility: 'pass', availableReplicas: 2,
      requiredReplicas: 2, fresh: true,
    };
  }
  function previewRow(person, path, revision, status) {
    const denied = status === 403;
    return {
      person, path, expectedStatus: status, observedStatus: status,
      expectedRevision: revision, observedRevision: revision,
      expectedIdentity: denied ? 'none' : person, observedIdentity: denied ? 'none' : person,
      expectedState: denied ? 'none' : 'cart:3', observedState: denied ? 'none' : 'cart:3',
    };
  }
  function journey(id, destination, elapsedMs) {
    return {
      id, expectedRevision: destination, beforeRevision: destination === OLD ? CANARY : OLD,
      observedRevision: destination, beforeIdentity: id, observedIdentity: id,
      beforeState: 'cart:3', observedState: 'cart:3', status: 200,
      effectCount: 1, elapsedMs, originalBudgetMs: 400,
    };
  }
  const baseData = freeze({
    readiness: [readinessRow(CANARY), readinessRow(PREVIEW)],
    preview: [
      previewRow('fiction-tester', 'selected-login', PREVIEW, 200),
      previewRow('fiction-tester', 'selected-callback', PREVIEW, 200),
      previewRow('fiction-tester', 'production-navigation', OLD, 200),
      previewRow('fiction-ga', 'production-navigation', OLD, 200),
      previewRow('fiction-visitor', 'direct-preview-label', 'none', 403),
      previewRow('fiction-ga', 'direct-preview-label', 'none', 403),
      previewRow('fiction-ga', 'non-selected-callback', 'none', 403),
    ],
    canary: {
      observedWeights: [80, 20, 0],
      requests: Array.from({ length: 10 }, (_, index) => ({
        id: `fiction-canary-request-${index + 1}`, path: 'ordinary',
        expectedRevision: index < 8 ? OLD : CANARY,
        observedRevision: index < 8 ? OLD : CANARY, status: 200,
      })),
      journeys: [journey('fiction-canary-user-a', CANARY, 110), journey('fiction-canary-user-b', CANARY, 130)],
    },
    promotion: {
      observedWeights: [0, 100, 0],
      requests: Array.from({ length: 3 }, (_, index) => ({
        id: `fiction-promoted-request-${index + 1}`, path: 'ordinary',
        expectedRevision: CANARY, observedRevision: CANARY, status: 200,
      })),
      journeys: [
        journey('fiction-production-user-a', CANARY, 140),
        journey('fiction-production-user-b', CANARY, 160),
        journey('fiction-production-user-c', CANARY, 180),
      ],
    },
    oldAudit: {
      revision: OLD, ordinaryAdmissions: 0, directAdmissions: 0, labelAdmissions: 0,
      sessions: 0, inFlightRequests: 0, streams: 0, jobs: 0,
      ownership: 'settled', checkpoints: 'settled', state: 'compatible',
      oldEffectCount: 1, artifactReferences: 0, rollbackRetention: 'elapsed',
    },
    rollback: {
      readiness: [readinessRow(OLD)], stateCompatible: true, artifactsAvailable: true,
      observedWeights: [100, 0, 0],
      requests: [
        { id: 'fiction-rollback-request', path: 'ordinary', expectedRevision: OLD, observedRevision: OLD, status: 200 },
      ],
      journeys: [journey('fiction-recovered-user-a', OLD, 170), journey('fiction-recovered-user-b', OLD, 190)],
    },
  });

  function dataFor(fixture) {
    const data = copy(baseData);
    switch (fixture) {
      case 'probe-only': data.readiness[0].dependency = 'fail'; break;
      case 'readiness-unknown': data.readiness[1].readiness[1] = null; break;
      case 'preview-leak':
        Object.assign(data.preview[5], { observedStatus: 200, observedRevision: PREVIEW, observedIdentity: 'fiction-ga', observedState: 'cart:3' });
        break;
      case 'callback-broken':
        Object.assign(data.preview[1], { observedRevision: OLD, observedIdentity: 'fiction-ga', observedState: 'lost-cart' });
        break;
      case 'preview-unknown': data.preview[6].observedStatus = null; break;
      case 'route-unknown':
        data.promotion.observedWeights = null;
        data.promotion.requests[0].observedRevision = null;
        break;
      case 'pinned-old':
        data.promotion.requests[0].path = 'pinned-direct-old';
        data.promotion.requests[0].observedRevision = OLD;
        data.promotion.journeys[0].observedRevision = OLD;
        data.oldAudit.directAdmissions = 1;
        break;
      case 'candidate-fault': data.canary.journeys[0].effectCount = 2; break;
      case 'journey-unknown': data.promotion.journeys[1].observedState = null; break;
      case 'old-work':
        Object.assign(data.oldAudit, { sessions: 1, inFlightRequests: 1, streams: 1, jobs: 1, ownership: 'old-owner', checkpoints: 'pending' });
        break;
      case 'drain-unknown':
        Object.assign(data.oldAudit, { jobs: null, ownership: null, artifactReferences: null, rollbackRetention: null });
        break;
      case 'rollback-incompatible':
        data.canary.journeys[0].effectCount = 2;
        data.rollback.stateCompatible = false;
        break;
      case 'rollback-unknown':
        data.canary.journeys[0].elapsedMs = null;
        data.rollback.stateCompatible = null;
        break;
    }
    return data;
  }

  function fault(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }
  function assertJson(value, code, active = new Set(), depth = 0) {
    if (depth > 30) throw fault(code, 'Data nesting exceeds the bounded lesson contract.');
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
    if (typeof value === 'number' && Number.isSafeInteger(value)) return;
    if (!value || typeof value !== 'object' || active.has(value)) throw fault(code, 'Expected finite, acyclic typed DATA.');
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) {
      throw fault(code, 'Only plain typed records and arrays are accepted.');
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== 'string')) throw fault(code, 'Symbol fields are not accepted.');
    if (array) {
      if (value.length > 100 || keys.length !== value.length + 1
          || keys.some((key) => key !== 'length' && !/^(0|[1-9]\d*)$/.test(key))) {
        throw fault(code, 'Sparse or extended arrays are not accepted.');
      }
    } else if (keys.length > 40) throw fault(code, 'Too many record fields.');
    active.add(value);
    for (const key of keys) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw fault(code, 'Accessor or hidden fields are not accepted.');
      assertJson(descriptor.value, code, active, depth + 1);
    }
    active.delete(value);
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }
  function validateCommand(command) {
    assertJson(command, 'ERR_INPUT');
    if (!command || Array.isArray(command) || typeof command !== 'object'
        || typeof command.type !== 'string') throw fault('ERR_INPUT', 'Expected an exact typed action record.');
    let keys;
    if (command.type === 'prepare') {
      keys = ['type', 'fixture', 'token'];
      if (typeof command.fixture !== 'string' || !fixtureNames.includes(command.fixture)) {
        throw fault('ERR_INPUT', 'Choose an exact fixed fixture name; arbitrary DATA is not accepted.');
      }
      if (command.token !== 'v2') throw fault('ERR_INPUT', 'Candidate software token must be exactly v2 (no coercion or whitespace).');
    } else if (command.type === 'split') {
      keys = ['type', 'allocation'];
      if (typeof command.allocation !== 'string' || !Object.hasOwn(allocations, command.allocation)) {
        throw fault('ERR_INPUT', 'Allocation must be the exact fixed 80/20/0 or 0/100/0 token.');
      }
    } else if (['inspect', 'preview', 'measure', 'audit-old', 'retire', 'rollback'].includes(command.type)) {
      keys = ['type'];
    } else throw fault('ERR_INPUT', 'Unknown action; only this lesson\'s fixed operators are allowed.');
    if (stable(Object.keys(command).sort()) !== stable(keys.sort())) {
      throw fault('ERR_INPUT', 'Action fields must match the exact typed contract; extra or missing fields are rejected.');
    }
  }
  const match = (actual, expected) => actual === expected ? 'pass' : actual === null ? 'unknown' : 'fail';
  const verdict = (results) => results.includes('fail') ? 'fail' : results.includes('unknown') ? 'unknown' : 'pass';
  const measuredGate = (result) => result === 'pass' || result === 'fail' ? result : 'unknown';
  function readyVerdict(rows) {
    return verdict(rows.flatMap((row) => [
      match(row.provisioned, true), match(row.fresh, true), match(row.dependency, 'pass'),
      match(row.stateCompatibility, 'pass'),
      row.availableReplicas === null ? 'unknown' : row.availableReplicas >= row.requiredReplicas ? 'pass' : 'fail',
      ...row.startup.map((probe) => match(probe, true)),
      ...row.readiness.map((probe) => match(probe, true)),
    ]));
  }
  function previewVerdict(rows) {
    return verdict(rows.flatMap((row) => [
      match(row.observedStatus, row.expectedStatus), match(row.observedRevision, row.expectedRevision),
      match(row.observedIdentity, row.expectedIdentity), match(row.observedState, row.expectedState),
    ]));
  }
  function previewObservations(state, data, weights = state.desiredWeights) {
    const rows = copy(data.preview);
    if (weights[0] === 0) {
      for (const row of rows.filter((row) => row.path === 'production-navigation')) {
        row.expectedRevision = CANARY;
        row.observedRevision = state.fixture === 'pinned-old' && row.person === 'fiction-tester' ? OLD : CANARY;
      }
      if (state.fixture === 'preview-after-promotion') {
        Object.assign(rows[5], {
          observedStatus: 200, observedRevision: PREVIEW,
          observedIdentity: 'fiction-ga', observedState: 'cart:3',
        });
      }
    }
    return rows;
  }
  function routeVerdict(data, desired) {
    return verdict([
      data.observedWeights === null ? 'unknown' : match(stable(data.observedWeights), stable(desired)),
      ...data.requests.flatMap((row) => [match(row.status, 200), match(row.observedRevision, row.expectedRevision)]),
    ]);
  }
  function measureJourneys(rows) {
    const counts = { attempted: rows.length, successful: 0, interrupted: 0, unknown: 0 };
    const observations = rows.map((row) => {
      const correctness = [
        match(row.status, 200), match(row.observedIdentity, row.beforeIdentity),
        match(row.observedState, row.beforeState), match(row.effectCount, 1),
        row.elapsedMs === null ? 'unknown' : row.elapsedMs <= row.originalBudgetMs ? 'pass' : 'fail',
      ];
      let outcome;
      if (correctness.includes('fail')) outcome = 'interrupted';
      else if (correctness.includes('unknown') || row.observedRevision !== row.expectedRevision) outcome = 'unknown';
      else outcome = 'successful';
      counts[outcome]++;
      return {
        ...row, outcome,
        interpretation: outcome === 'successful' ? 'Complete declared transition observed in fixed DATA.'
          : outcome === 'interrupted' ? 'Identity/state/effect/status/latency failed within the original budget.'
            : 'Missing continuity evidence or no observed move to the intended revision; not a successful migration.',
      };
    });
    return { counts, observations, verdict: counts.interrupted > 0 ? 'fail' : counts.unknown > 0 ? 'unknown' : 'pass' };
  }
  function auditVerdict(data) {
    return verdict([
      ...['ordinaryAdmissions', 'directAdmissions', 'labelAdmissions', 'sessions', 'inFlightRequests', 'streams', 'jobs', 'artifactReferences'].map((key) => match(data[key], 0)),
      match(data.ownership, 'settled'), match(data.checkpoints, 'settled'),
      match(data.state, 'compatible'), match(data.oldEffectCount, 1), match(data.rollbackRetention, 'elapsed'),
    ]);
  }
  function initial() {
    return {
      schemaVersion: 1, fixture: null, phase: 'baseline',
      candidateRecorded: false, readinessResult: 'unobserved', previewResult: 'unobserved',
      desiredWeights: [100, 0, 0], observedWeights: [100, 0, 0], lastObservedWeights: [100, 0, 0],
      routeResult: 'unobserved', canaryResult: 'unobserved', promotionResult: 'unobserved',
      auditResult: 'unobserved', rollbackResult: 'unobserved',
      lifecycle: { old: 'active', canary: 'active', preview: 'active' },
      metrics: { attempted: 0, successful: 0, interrupted: 0, unknown: 0 },
      latestJourneys: null, safeHolds: 0, lastData: null,
      verifier: 'unverified', userImpact: 'No attempted transition; no migration evidence.',
      retirement: 'not verified', history: [],
    };
  }
  function impact(state) {
    if (state.metrics.interrupted > 0) return 'Interrupted transition (synthetic); failures before recovery remain counted.';
    if (state.metrics.unknown > 0) return 'Unverified transition (synthetic); unknown and old-only outcomes remain counted.';
    if (state.phase === 'retired') return 'Declared synthetic cohort passed; only the old teaching record is retired.';
    if (state.phase === 'rolled-back') return 'Compatible rollback observed (synthetic); earlier history remains.';
    if (state.metrics.attempted > 0) return 'Bounded synthetic sample passed; not proof that all real users migrated.';
    return 'Safe hold before exposure; no completed user migration claimed.';
  }
  function advance(state, command) {
    const next = copy(state);
    const data = state.fixture === null ? null : dataFor(state.fixture);
    let result = 'observed';
    let check = 'pass';
    let summary = '';
    let evidence = null;
    const hold = (reason, classification = 'fail', observations = null) => {
      result = 'held'; check = classification; summary = `Safe hold: ${reason}`;
      evidence = observations; next.safeHolds++;
    };
    switch (command.type) {
      case 'prepare':
        if (state.phase !== 'baseline') hold('reset before choosing another immutable fixture.');
        else {
          next.fixture = command.fixture;
          next.candidateRecorded = true;
          next.phase = 'prepared';
          evidence = { revisions, softwareToken: command.token, fixture: command.fixture, noNativeOperation: true };
          summary = 'Candidate identity DATA recorded; no readiness, effective route, capacity change or migration certified.';
        }
        break;
      case 'inspect':
        if (!['prepared', 'ready'].includes(state.phase)) hold('record the candidate before inspecting readiness.');
        else {
          check = readyVerdict(data.readiness);
          next.readinessResult = check;
          if (check === 'pass') next.phase = 'ready';
          evidence = { readiness: data.readiness, verdict: check };
          summary = `Readiness ${check}: provisioning, ALL probes, dependency, state, fresh capacity are separate checks.`;
        }
        break;
      case 'preview':
        if (state.fixture === null || state.readinessResult !== 'pass') hold('fresh candidate AND preview readiness are necessary.');
        else {
          const paths = previewObservations(state, data);
          check = previewVerdict(paths);
          next.previewResult = check;
          evidence = { labelRevision: PREVIEW, ordinaryPreviewWeight: 0, labelIsNotAuthorization: true, paths, verdict: check };
          summary = `Preview ${check}: selected login/callback, CURRENT production navigation and non-selected direct paths were measured.`;
        }
        break;
      case 'split': {
        const canary = command.allocation === '80/20/0';
        if (canary && (state.phase !== 'ready' || state.readinessResult !== 'pass' || state.previewResult !== 'pass')) {
          hold('80/20/0 needs readiness and measured preview authorization, even when preview weight is zero.');
        } else if (!canary && (state.phase !== 'canary-measured' || state.canaryResult !== 'pass')) {
          hold('0/100/0 needs a measured positive canary; probes, tokens and desired weights are insufficient.');
        } else {
          next.desiredWeights = copy(allocations[command.allocation]);
          next.observedWeights = null;
          next.routeResult = 'unobserved';
          next.previewResult = 'unobserved';
          next.phase = canary ? 'canary-unmeasured' : 'promotion-unmeasured';
          evidence = { desiredWeights: next.desiredWeights, observedWeights: null, interpretation: 'Operator selection changes desired teaching DATA ONLY.' };
          summary = 'Desired weighted allocation recorded; current effective routing and migration are still unobserved.';
        }
        break;
      }
      case 'measure': {
        if (!['canary-unmeasured', 'promotion-unmeasured'].includes(state.phase)) {
          hold('choose the next gated split first; repeated samples cannot inflate the denominator.');
          break;
        }
        const canary = state.phase === 'canary-unmeasured';
        const observations = canary ? data.canary : data.promotion;
        const journeys = measureJourneys(observations.journeys);
        const paths = previewObservations(state, data);
        next.previewResult = previewVerdict(paths);
        next.routeResult = routeVerdict(observations, state.desiredWeights);
        next.observedWeights = copy(observations.observedWeights);
        if (observations.observedWeights !== null) next.lastObservedWeights = copy(observations.observedWeights);
        check = verdict([next.routeResult, journeys.verdict, next.previewResult]);
        next[canary ? 'canaryResult' : 'promotionResult'] = check;
        next.phase = canary ? 'canary-measured' : 'promotion-measured';
        next.latestJourneys = journeys;
        for (const key of Object.keys(next.metrics)) next.metrics[key] += journeys.counts[key];
        evidence = { desiredWeights: state.desiredWeights, observedWeights: observations.observedWeights, labelRevision: PREVIEW, paths, previewVerdict: next.previewResult, requests: observations.requests, routeVerdict: next.routeResult, journeys };
        summary = `${canary ? 'Canary' : 'Promotion'} ${check}: request identities, complete journeys and CURRENT preview authorization/navigation measured independently.`;
        break;
      }
      case 'audit-old':
        if (state.phase !== 'promotion-measured') hold('measure promotion before auditing old routing/work gates.');
        else {
          check = auditVerdict(data.oldAudit);
          next.auditResult = check;
          evidence = { old: data.oldAudit, verdict: check, zeroWeightDoesNotDrainWork: true };
          summary = `Old audit ${check}: direct/label admissions, sessions, requests, streams, jobs, ownership, state, effects, artifacts and retention.`;
        }
        break;
      case 'retire': {
        const gates = [
          { name: 'measured promotion phase', result: match(state.phase, 'promotion-measured') },
          { name: 'readiness', result: measuredGate(state.readinessResult) },
          { name: 'authorized preview', result: measuredGate(state.previewResult) },
          { name: 'desired old weight zero', result: match(stable(state.desiredWeights), stable([0, 100, 0])) },
          { name: 'observed ordinary routing', result: state.observedWeights === null ? 'unknown' : match(stable(state.observedWeights), stable([0, 100, 0])) },
          { name: 'actual requests and declared cohort', result: measuredGate(state.promotionResult) },
          { name: 'old routes, clients/work, ownership and retention', result: measuredGate(state.auditResult) },
        ];
        check = verdict(gates.map((gate) => gate.result));
        if (check !== 'pass') {
          hold('retirement requires EVERY measured routing, preview, migration, work/state and retention gate.', check, { gates });
          next.retirement = 'held; never inferred from zero weight';
        } else {
          next.phase = 'retired';
          next.lifecycle.old = 'retired';
          next.retirement = 'allowed for old teaching record only';
          evidence = { gates, retiredRevision: OLD, remainingActiveRevisions: [CANARY, PREVIEW], nativeOperation: false };
          summary = 'Only fiction-old-r1 is retired in DATA; r2 and independently authorized r3 remain active.';
        }
        break;
      }
      case 'rollback': {
        const permitted = ['canary-unmeasured', 'canary-measured', 'promotion-unmeasured', 'promotion-measured'].includes(state.phase);
        if (!permitted || state.lifecycle.old !== 'active') {
          hold('rollback needs a retained old revision; retired DATA cannot be silently resurrected.');
          break;
        }
        const rollback = data.rollback;
        const paths = previewObservations(state, data, [100, 0, 0]);
        const previewCheck = previewVerdict(paths);
        const gates = [
          { name: 'fresh old readiness/capacity', result: readyVerdict(rollback.readiness) },
          { name: 'old state read/write compatibility', result: match(rollback.stateCompatible, true) },
          { name: 'retained artifacts', result: match(rollback.artifactsAvailable, true) },
          { name: 'authorized rollback preview/navigation paths', result: previewCheck },
        ];
        check = verdict(gates.map((gate) => gate.result));
        evidence = { gates, readiness: rollback.readiness, stateCompatible: rollback.stateCompatible, artifactsAvailable: rollback.artifactsAvailable, labelRevision: PREVIEW, paths, previewVerdict: previewCheck };
        next.rollbackResult = check;
        next.previewResult = previewCheck;
        if (check !== 'pass') {
          hold('rollback requires fresh old readiness, capacity, artifacts AND compatible state; consider forward recovery.', check, evidence);
        } else {
          const journeys = measureJourneys(rollback.journeys);
          next.routeResult = routeVerdict(rollback, [100, 0, 0]);
          check = verdict([next.routeResult, journeys.verdict]);
          next.rollbackResult = check;
          next.desiredWeights = [100, 0, 0];
          next.observedWeights = copy(rollback.observedWeights);
          if (rollback.observedWeights !== null) next.lastObservedWeights = copy(rollback.observedWeights);
          next.latestJourneys = journeys;
          for (const key of Object.keys(next.metrics)) next.metrics[key] += journeys.counts[key];
          next.phase = 'rolled-back';
          evidence = { ...evidence, requests: rollback.requests, observedWeights: rollback.observedWeights, journeys };
          summary = 'Compatible rollback and old routing/journeys observed in fixed DATA; all previous failures and unknowns retained.';
        }
        break;
      }
    }
    next.lastData = evidence;
    next.verifier = check;
    next.userImpact = impact(next);
    next.history.push({
      sequence: state.history.length + 1, command: copy(command), phaseBefore: state.phase,
      phaseAfter: next.phase, result, verifier: check, userImpact: next.userImpact,
      retirement: next.retirement, summary, data: copy(evidence),
    });
    return next;
  }
  function validateState(state) {
    assertJson(state, 'ERR_STATE');
    if (!state || !Array.isArray(state.history) || state.history.length > LIMIT) {
      throw fault('ERR_STATE', 'Expected a bounded replayable lesson state.');
    }
    let replay = initial();
    for (const entry of state.history) {
      try { validateCommand(entry.command); }
      catch { throw fault('ERR_STATE', 'History contains an invalid typed action.'); }
      replay = advance(replay, entry.command);
    }
    if (stable(state) !== stable(replay)) {
      throw fault('ERR_STATE', 'State/metrics/observations must equal deterministic retained-history replay; forgery is rejected.');
    }
  }
  function createState() {
    return freeze(initial());
  }
  function execute(state, command) {
    validateState(state);
    validateCommand(command);
    if (state.history.length === LIMIT) {
      throw fault('ERR_LIMIT', 'All 20 actions are retained. Reset this rehearsal before starting another; no history is pruned.');
    }
    return freeze(advance(state, command));
  }
  const api = freeze({ createState, execute, fixtureNames, revisions, allocations, limit: LIMIT });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S126Lesson = api;
}(globalThis));
