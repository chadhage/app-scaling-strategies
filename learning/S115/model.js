(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StandbyLesson = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const MAX_CHECKS = 10;
  const DEMAND_UNITS = 10;
  const BUDGETS = Object.freeze([6000, 24000]);
  const DEFAULT_INPUT = Object.freeze({ fixtureId: 'warm-ready', budgetMs: 6000 });
  const issued = new WeakSet();

  class LessonError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'LessonError';
      this.code = code;
    }
  }

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }

  const ready = {
    instances: [
      { id: 'birch-1', ready: true, capacityUnits: 6 },
      { id: 'birch-2', ready: true, capacityUnits: 6 },
    ],
    cache: { canaryHit: true, payloadRevision: 7, latencyMs: 8 },
    dependency: { access: true, latencyMs: 10 },
    authentication: { sessionAccepted: true },
    state: { profileRevision: 7, sessionRevision: 3, committedEffectCount: 1 },
  };
  const cold = {
    ...ready,
    instances: [
      { id: 'birch-1', ready: false, capacityUnits: 0 },
      { id: 'birch-2', ready: false, capacityUnits: 0 },
    ],
    cache: { canaryHit: false, payloadRevision: null, latencyMs: null },
  };
  const unobserved = {
    instances: [
      { id: 'birch-1', ready: null, capacityUnits: null },
      { id: 'birch-2', ready: null, capacityUnits: null },
    ],
    cache: { canaryHit: null, payloadRevision: null, latencyMs: null },
    dependency: { access: null, latencyMs: null },
    authentication: { sessionAccepted: null },
    state: { profileRevision: null, sessionRevision: null, committedEffectCount: null },
  };
  const phases = (activationMs, cacheWarmupMs) => [
    { name: 'Activate standby compute', durationMs: activationMs },
    { name: 'Warm standby cache', durationMs: cacheWarmupMs },
    { name: 'Validate full standby path', durationMs: 2000 },
    { name: 'Route to passive destination', durationMs: 2000 },
  ];
  function fixture(id, label, initial, recovered = initial, recoveryPhases = phases(0, 0)) {
    return {
      id, label, mode: id === 'cold-ready' ? 'cold' : 'warm',
      activeRegion: 'Region Alder (fictional active)',
      passiveRegion: 'Region Birch (fictional passive)',
      shallowStatus: 200, initial, recovered, recoveryPhases,
    };
  }
  const FIXTURES = freeze([
    fixture('warm-ready', 'Warm reference — full readiness', ready),
    fixture('cold-ready', 'Cold reference — delayed activation and cache warm-up', cold, ready, phases(4000, 12000)),
    fixture('compute-short', 'Warm — insufficient ready compute', {
      ...ready,
      instances: [
        { id: 'birch-1', ready: true, capacityUnits: 4 },
        { id: 'birch-2', ready: true, capacityUnits: 4 },
      ],
    }),
    fixture('cache-incompatible', 'Warm — incompatible slow cache canary', {
      ...ready, cache: { canaryHit: true, payloadRevision: 6, latencyMs: 35 },
    }),
    fixture('dependency-denied', 'Warm — required dependency denied', {
      ...ready, dependency: { access: false, latencyMs: null },
    }),
    fixture('auth-denied', 'Warm — synthetic session rejected', {
      ...ready, authentication: { sessionAccepted: false },
    }),
    fixture('state-behind', 'Warm — required state behind', {
      ...ready, state: { profileRevision: 6, sessionRevision: 2, committedEffectCount: 1 },
    }),
    fixture('unobserved', 'Warm-labelled — required evidence missing', unobserved, unobserved, [
      { name: 'Activate standby compute', durationMs: null },
      { name: 'Warm standby cache', durationMs: null },
      { name: 'Validate full standby path', durationMs: null },
      { name: 'Route to passive destination', durationMs: null },
    ]),
  ]);
  const byId = new Map(FIXTURES.map((value) => [value.id, value]));

  function issue(state) {
    freeze(state);
    issued.add(state);
    return state;
  }

  function advance(state, next) {
    const result = issue(next);
    issued.delete(state);
    return result;
  }

  function requireState(state) {
    if (!state || typeof state !== 'object' || !issued.has(state)) {
      throw new LessonError('ERR_STATE', 'Use the current state issued by this lesson; stale, copied or forged states are rejected.');
    }
  }

  function requireInput(input) {
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype) {
      throw new LessonError('ERR_INPUT', 'Choose an exact standby fixture and original numeric budget.');
    }
    const keys = Reflect.ownKeys(input);
    if (keys.length !== 2 || !keys.includes('fixtureId') || !keys.includes('budgetMs')
        || keys.some((key) => !Object.hasOwn(Object.getOwnPropertyDescriptor(input, key), 'value'))) {
      throw new LessonError('ERR_INPUT', 'Only fixtureId and budgetMs data fields are accepted.');
    }
    if (typeof input.fixtureId !== 'string' || !byId.has(input.fixtureId)
        || typeof input.budgetMs !== 'number' || !Number.isInteger(input.budgetMs)
        || !BUDGETS.includes(input.budgetMs)) {
      throw new LessonError('ERR_INPUT', 'Choose a listed fixture and exactly 6000 or 24000 synthetic milliseconds.');
    }
  }

  function combine(verdicts) {
    if (verdicts.includes('failure')) return 'failure';
    if (verdicts.includes('unknown')) return 'unknown';
    return 'success';
  }

  function conditions(values) {
    if (values.includes(false)) return 'failure';
    if (values.includes(null)) return 'unknown';
    return 'success';
  }
  const equal = (value, expected) => value === null ? null : value === expected;
  const atMost = (value, maximum) => value === null ? null : value <= maximum;

  function measure(signals) {
    const capacityUnits = signals.instances.some((item) => item.ready === null || item.capacityUnits === null)
      ? null : signals.instances.reduce((sum, item) => sum + (item.ready ? item.capacityUnits : 0), 0);
    const readyInstances = signals.instances.some((item) => item.ready === null)
      ? null : signals.instances.filter((item) => item.ready).length;
    const checks = [
      {
        key: 'compute', label: 'Compute pool',
        expected: 'Both required instances ready; at least 10 ready capacity units',
        measured: { readyInstances, requiredInstances: 2, capacityUnits, demandUnits: DEMAND_UNITS },
        verdict: conditions([
          ...signals.instances.map((item) => equal(item.ready, true)),
          capacityUnits === null ? null : capacityUnits >= DEMAND_UNITS,
        ]),
      },
      {
        key: 'cache', label: 'Cache business canary',
        expected: 'Canary hit, payload revision 7, latency at most 20 synthetic ms',
        measured: signals.cache,
        verdict: conditions([
          equal(signals.cache.canaryHit, true), equal(signals.cache.payloadRevision, 7),
          atMost(signals.cache.latencyMs, 20),
        ]),
      },
      {
        key: 'dependency', label: 'Required profile-store access',
        expected: 'Access allowed, latency at most 20 synthetic ms',
        measured: signals.dependency,
        verdict: conditions([equal(signals.dependency.access, true), atMost(signals.dependency.latencyMs, 20)]),
      },
      {
        key: 'authentication', label: 'Synthetic authentication continuity',
        expected: 'Fixture session accepted at the passive destination',
        measured: signals.authentication,
        verdict: conditions([equal(signals.authentication.sessionAccepted, true)]),
      },
      {
        key: 'state', label: 'Required state continuity',
        expected: 'Profile revision 7, session revision 3, exactly 1 prior committed effect',
        measured: signals.state,
        verdict: conditions([
          equal(signals.state.profileRevision, 7), equal(signals.state.sessionRevision, 3),
          equal(signals.state.committedEffectCount, 1),
        ]),
      },
    ];
    return { checks, readiness: combine(checks.map((check) => check.verdict)) };
  }

  function outcomeFor(selected, budgetMs) {
    const initial = measure(selected.initial);
    const recovered = measure(selected.recovered);
    const templateTotalMs = selected.recoveryPhases.some((phase) => phase.durationMs === null)
      ? null : selected.recoveryPhases.reduce((sum, phase) => sum + phase.durationMs, 0);
    const eligible = recovered.readiness === 'unknown' ? null : recovered.readiness === 'success';
    const measuredMs = eligible === true ? templateTotalMs : null;
    const recoveryVerdict = eligible === false ? 'failure'
      : measuredMs === null ? 'unknown' : measuredMs <= budgetMs ? 'success' : 'failure';
    const journeys = [
      { id: 'profile-read', label: 'Read profile with the existing fixture session', serviceMs: 100, effectCount: null },
      { id: 'preference-write', label: 'Recover the prior committed preference effect once', serviceMs: 150, effectCount: 1 },
    ].map((journey) => {
      const elapsedMs = measuredMs === null ? null : measuredMs + journey.serviceMs;
      const verdict = eligible === false ? 'failure'
        : elapsedMs === null ? 'unknown' : elapsedMs <= budgetMs ? 'success' : 'failure';
      return {
        id: journey.id, label: journey.label, attempted: true,
        destination: eligible === true ? selected.passiveRegion : null,
        budgetMs, elapsedMs,
        sessionAccepted: selected.recovered.authentication.sessionAccepted,
        profileRevision: selected.recovered.state.profileRevision,
        sessionRevision: selected.recovered.state.sessionRevision,
        effectCount: eligible === true ? journey.effectCount : null,
        verdict,
        reason: eligible === false ? 'Alternate admission blocked by full readiness'
          : elapsedMs === null ? 'Required recovery evidence missing'
            : verdict === 'failure' ? 'Eventual completion exceeded the original client budget'
              : 'Fixed client trace recovered within its original budget',
      };
    });
    const clientOutcome = combine(journeys.map((journey) => journey.verdict));
    return {
      initial, recovered,
      recovery: {
        phases: selected.recoveryPhases, templateTotalMs, measuredMs, eligible,
        verdict: recoveryVerdict,
        reason: eligible === false ? 'Routing blocked; the phase template is not completed recovery'
          : eligible === null ? 'Routing and recovery are unobserved'
            : 'Full-path validation precedes fictional alternate routing',
      },
      journeys, clientOutcome,
      outcome: combine([initial.readiness, recovered.readiness, recoveryVerdict, clientOutcome]),
    };
  }

  function createState() { return issue({ phase: 'idle', current: null, history: [] }); }

  function inspect(state, input) {
    requireState(state);
    if (state.history.length >= MAX_CHECKS) {
      throw new LessonError('ERR_LIMIT', 'The ten-check session limit is reached; reset cannot renew it.');
    }
    if (state.phase !== 'idle') {
      throw new LessonError('ERR_PHASE', 'Reset the current rehearsal before measuring another standby.');
    }
    requireInput(input);
    const selected = byId.get(input.fixtureId);
    const initial = measure(selected.initial);
    return advance(state, {
      ...state, phase: 'measured',
      current: {
        number: state.history.length + 1, fixtureId: selected.id, label: selected.label,
        mode: selected.mode, activeRegion: selected.activeRegion, passiveRegion: selected.passiveRegion,
        budgetMs: input.budgetMs, shallowStatus: selected.shallowStatus, shallowHealth: 'success',
        readiness: initial.readiness, initial,
        comparison: ['warm-ready', 'cold-ready'].map((id) => {
          const reference = byId.get(id);
          return { fixtureId: id, label: reference.label, ...outcomeFor(reference, input.budgetMs) };
        }),
        recovered: null, recovery: null, journeys: [], clientOutcome: 'unknown', outcome: 'unknown',
      },
    });
  }

  function rehearse(state) {
    requireState(state);
    if (state.phase !== 'measured') {
      throw new LessonError('ERR_PHASE', 'Measure full standby readiness before rehearsing recovery; each check runs once.');
    }
    const result = freeze({
      ...state.current, ...outcomeFor(byId.get(state.current.fixtureId), state.current.budgetMs),
      status: 'completed',
    });
    return advance(state, { phase: 'complete', current: result, history: [...state.history, result] });
  }

  function reset(state) {
    requireState(state);
    let history = state.history;
    if (state.phase === 'measured') {
      const unfinished = freeze({
        ...state.current, status: 'reset-before-recovery', outcome: 'unknown',
        clientOutcome: 'not-attempted', note: 'Reset after measurement; no synthetic client journeys attempted.',
      });
      history = [...history, unfinished];
    }
    return advance(state, { phase: 'idle', current: null, history });
  }

  function totals(state) {
    requireState(state);
    const result = {
      checks: state.history.length, success: 0, failure: 0, unknown: 0,
      clientAttempts: 0, clientSuccess: 0, clientFailure: 0, clientUnknown: 0,
    };
    for (const record of state.history) {
      result[record.outcome]++;
      for (const journey of record.journeys) {
        result.clientAttempts++;
        result[`client${journey.verdict[0].toUpperCase()}${journey.verdict.slice(1)}`]++;
      }
    }
    return freeze(result);
  }

  return Object.freeze({
    BANNER, MAX_CHECKS, DEMAND_UNITS, BUDGETS, DEFAULT_INPUT, FIXTURES, LessonError,
    createState, inspect, rehearse, reset, totals,
  });
}));
