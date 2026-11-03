'use strict';

(function publish(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S089Fixtures = api;
})(globalThis, function fixtures() {
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  const journey = (id, status, latencyMs, reason) => ({
    id: `training-user-${id}`, route: 'blue-v1', status, latencyMs, reason,
  });
  const complete = [
    journey(1, 'success', 32, 'established-route-served'),
    journey(2, 'success', 48, 'established-route-served'),
    journey(3, 'success', 61, 'established-route-served'),
  ];
  return freeze({
    ROUTE: { deployment: 'blue-v1', epoch: 7, established: true },
    BOUNDS: { journeysPerAttempt: 3, journeyBudgetMs: 100, maxHistory: 6, maxTraceEvents: 6 },
    CONDITIONS: {
      independent: {
        label: 'Independent established routes — complete samples',
        policy: 'established-route', journeys: complete,
      },
      'controller-dependent': {
        label: 'Bad policy — controller required on every request',
        policy: 'controller-per-request',
        journeys: [1, 2, 3].map((id) => journey(id, 'failure', 2, 'controller-required-but-unavailable')),
      },
      'service-error': {
        label: 'Independent route — one service error',
        policy: 'established-route',
        journeys: [complete[0], journey(2, 'failure', 65, 'service-error'), complete[2]],
      },
      'missing-sample': {
        label: 'Independent route — one missing completion observation',
        policy: 'established-route',
        journeys: [complete[0], complete[1], journey(3, 'unknown', null, 'completion-evidence-missing')],
      },
    },
    RECOVERY: {
      confirmed: { label: 'Confirmed synthetic control acknowledgement', control: 'available', outcome: 'confirmed' },
      missing: { label: 'Missing acknowledgement — do not claim recovery', control: 'unknown', outcome: 'unverified' },
    },
  });
});
