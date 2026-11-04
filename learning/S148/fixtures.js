'use strict';

(function expose(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S148Fixtures = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function packet(number, label, note) {
    const suffix = String(number).padStart(2, '0');
    const identity = {
      userId: `S148-user-${suffix}`,
      journeyId: `S148-journey-${suffix}`,
      attemptId: `S148-original-${suffix}`,
      correlationId: `S148-correlation-${suffix}`,
      transitionId: 'S148-transition-01',
    };
    const original = {
      ...identity,
      startedAtMs: 0,
      budgetMs: 2000,
      transition: { id: 'S148-transition-01', startedAtMs: 1000, endedAtMs: 1100 },
      tiers: ['frontend', 'api', 'data'].map((tier) => ({
        tier,
        movementRequired: tier !== 'data',
        origin: { deployment: tier === 'data' ? 'shared-data' : 'blue', version: 'v1' },
        target: { deployment: tier === 'data' ? 'shared-data' : 'green', version: tier === 'data' ? 'v1' : 'v2' },
      })),
      expectedState: { authenticated: true, stateToken: `S148-profile-${suffix}`, businessEffects: 1, uiReady: true },
    };
    const traces = original.tiers.flatMap(({ tier, origin, target }) => [
      { id: `S148-${suffix}-${tier}-before`, ...identity, tier, phase: 'before', observedAtMs: 900, ...origin, healthy: true },
      { id: `S148-${suffix}-${tier}-after`, ...identity, tier, phase: 'after', observedAtMs: 1200, ...target, healthy: true },
    ]);
    return {
      id: `case-${suffix}`,
      label,
      note,
      original,
      traces,
      requests: [900, 1300].map((observedAtMs, index) => ({
        id: `S148-request-${suffix}-${index + 1}`, ...identity, observedAtMs,
        httpStatus: 200, version: index === 0 ? 'v1' : 'v2',
      })),
      observations: [
        { id: `S148-observation-${suffix}-baseline`, ...identity, observedAtMs: 900, kind: 'correct' },
      ],
      completion: { ...identity, observedAtMs: 1500, completed: true, ...original.expectedState },
    };
  }

  const packets = [
    packet(1, 'Observed intended movement', 'The same original frontend and API move; unchanged shared data is irrelevant to the declared movement.'),
    packet(2, 'Entirely unchanged blue', 'Correct HTTP 200 completions and healthy tiers do not prove anyone moved.'),
    packet(3, 'New version only', 'Target stamps exist, but the required original stamps are missing.'),
    packet(4, 'Successful new attempt', 'The same user starts another journey and attempt; that cannot prove movement or completion of the original.'),
    packet(5, 'Missing required API target', 'Frontend movement cannot substitute for the declared API movement.'),
    packet(6, 'Wrong correlation', 'An API target from another correlation cannot be attributed to this original journey.'),
    packet(7, 'Wrong intended target', 'API reaches green v3, not the declared green v2. Completion is not migration proof.'),
    packet(8, 'Moved but lost state', 'Both versions move, yet a 200 response loses the original authenticated profile state.'),
    packet(9, 'Recovery retains interruption', 'Later correct recovery cannot erase the original interruption.'),
    packet(10, 'Recovery exceeds original budget', '2600 ms elapsed exceeds the original 2000 ms budget; recovery does not restart it.'),
    packet(11, 'Missing target timing', 'An API target without a typed timestamp cannot prove when it moved.'),
    packet(12, 'Recovery retains unknown', 'A later correct completion cannot replace an earlier unknown original observation.'),
  ];

  packets[1].traces.forEach((trace) => {
    if (trace.tier !== 'data') Object.assign(trace, { deployment: 'blue', version: 'v1' });
  });
  packets[1].requests.forEach((request) => { request.version = 'v1'; });
  packets[2].traces = packets[2].traces.filter((trace) => trace.tier === 'data' || trace.phase === 'after');
  const retryIdentity = {
    journeyId: 'S148-new-journey-04',
    attemptId: 'S148-new-attempt-04',
    correlationId: 'S148-new-correlation-04',
  };
  packets[3].traces.filter((trace) => trace.phase === 'after').forEach((trace) => Object.assign(trace, retryIdentity));
  Object.assign(packets[3].completion, retryIdentity);
  Object.assign(packets[3].requests[1], retryIdentity);
  packets[4].traces = packets[4].traces.filter((trace) => !(trace.tier === 'api' && trace.phase === 'after'));
  packets[5].traces.find((trace) => trace.tier === 'api' && trace.phase === 'after').correlationId = 'S148-foreign-correlation-06';
  packets[6].traces.find((trace) => trace.tier === 'api' && trace.phase === 'after').version = 'v3';
  Object.assign(packets[7].completion, { authenticated: false, stateToken: 'S148-lost-state' });
  function observation(index, kind, observedAtMs) {
    const { userId, journeyId, attemptId, correlationId, transitionId } = packets[index].original;
    return { id: `S148-observation-${index + 1}-${kind}`, userId, journeyId, attemptId, correlationId, transitionId, kind, observedAtMs };
  }
  packets[8].observations.push(observation(8, 'interruption', 1050), observation(8, 'recovery', 1450));
  packets[9].completion.observedAtMs = 2600;
  packets[9].observations.push(observation(9, 'recovery', 2600));
  delete packets[10].traces.find((trace) => trace.tier === 'api' && trace.phase === 'after').observedAtMs;
  packets[11].observations.push(observation(11, 'unknown', 1050), observation(11, 'recovery', 1450));

  return freeze({ packets, synthetic: true, limits: { maxTimeMs: 6000, maxInspections: 48, maxMeasurements: 24, maxHistory: 8 } });
}));
