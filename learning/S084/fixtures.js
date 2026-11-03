(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.S084Fixtures = factory();
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  const operations = [
    { operation: 'provision', operationKey: 'S084:provision:v2', payload: 'fixture: candidate-v2 record' },
    { operation: 'routing', operationKey: 'S084:routing:handoff', payload: 'fixture: swap blue/green labels' },
    { operation: 'cleanup', operationKey: 'S084:cleanup:v1', payload: 'fixture: remove retained-v1 record' },
  ];
  const audit = (index, retry, status, effects, receipt) => ({
    ...operations[index], deliveryId: `delivery-0${index + (retry ? 4 : 1)}`,
    actor: 'synthetic-worker-084', delivery: retry ? 'same-key retry' : 'original',
    status, effects, receipt,
  });
  const originals = [
    audit(0, false, 'APPLIED', 1, 'candidate-v2 recorded once'),
    audit(1, false, 'APPLIED', 1, 'swap 1: candidate-v2 becomes the route'),
    audit(2, false, 'APPLIED', 1, 'retained-v1 removed once'),
  ];
  const first = {
    resources: ['candidate-v2'], duplicateResources: 0, route: 'candidate-v2', routeTargetPresent: true,
    swaps: 1, extraSwaps: 0, removals: 1, cleanupErrors: 0, knownEffects: 3, replayed: 0,
    finalEvidenceComplete: false, audit: originals,
    observationPoint: 'After three originals; retry outcomes have not been inspected.',
  };
  const remembered = [
    audit(0, true, 'REPLAYED', 0, 'remembered provision result; no additional resource'),
    audit(1, true, 'REPLAYED', 0, 'remembered routing result; no second swap'),
    audit(2, true, 'REPLAYED', 0, 'remembered cleanup result; no second removal'),
  ];
  const blind = [
    audit(0, true, 'APPLIED', 1, 'candidate-v2-copy recorded: duplicate resource'),
    audit(1, true, 'APPLIED', 1, 'swap 2: route returns to removed retained-v1'),
    audit(2, true, 'FAILED', 0, 'already-absent target error; no additional removal'),
  ];
  const unknownCleanup = audit(2, true, 'UNKNOWN', null, 'cleanup retry receipt unavailable; final state unverified');
  const fixture = (retryPolicy, evidence) => {
    const guarded = retryPolicy === 'remembered';
    const complete = evidence === 'complete';
    const retries = (guarded ? remembered : blind).slice();
    if (!complete) retries[2] = unknownCleanup;
    return {
      resources: guarded ? ['candidate-v2'] : ['candidate-v2', 'candidate-v2-copy'],
      duplicateResources: guarded ? 0 : 1,
      route: guarded ? 'candidate-v2' : 'retained-v1', routeTargetPresent: guarded,
      swaps: guarded ? 1 : 2, extraSwaps: guarded ? 0 : 1, removals: 1,
      cleanupErrors: complete ? (guarded ? 0 : 1) : null,
      knownEffects: guarded ? 3 : 5, replayed: guarded ? (complete ? 3 : 2) : 0,
      finalEvidenceComplete: complete, audit: [...originals, ...retries],
      observationPoint: complete
        ? 'After all six observed deliveries; fixed synthetic final inventory.'
        : 'Last inventory after routing retry only; cleanup retry outcome and final state are unverified.',
    };
  };
  return freeze({
    sourceId: 'S084', logicalOperations: 3, deliveries: 6, first,
    cases: {
      remembered: {
        complete: fixture('remembered', 'complete'),
        'cleanup-unobserved': fixture('remembered', 'cleanup-unobserved'),
      },
      blind: {
        complete: fixture('blind', 'complete'),
        'cleanup-unobserved': fixture('blind', 'cleanup-unobserved'),
      },
    },
  });
}));
