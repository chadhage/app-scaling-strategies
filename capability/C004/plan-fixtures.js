(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../C002/synthetic-fixture.js'), require('../C003/matrix-data.js'));
  } else {
    Object.defineProperty(root, 'C004Fixtures', { value: factory(root.C002SyntheticFixture, root.C003Matrix) });
  }
}(globalThis, function (envelopeRequest, matrix) {
  'use strict';

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  if (!envelopeRequest || !matrix || !Array.isArray(matrix.rows)) return freeze({ unavailable: true });
  const firstTarget = matrix.rows.find(row => row.firstPlannedNativeTarget);
  if (!firstTarget) return freeze({ unavailable: true });
  return freeze({
    local: {
      schemaVersion: 1,
      mode: 'local-resource-free',
      configurationId: null,
      envelopeRequest,
      durationBasis: 'The explicitly loaded C002 synthetic comparison duration only. This page starts no workload and predicts no Azure elapsed time.',
      resources: {
        cloudResourceCount: 0,
        description: 'This browser holds plan data in memory only. No cloud execution, lease, reservation, resource creation, or deletion.'
      },
      pricing: {
        status: 'not-applicable',
        currency: null,
        totalMinorUnits: null,
        basis: 'No cloud execution or cloud resources. Not a free Azure estimate; local machine and electricity costs are not estimated.',
        source: null
      }
    },
    native: {
      schemaVersion: 1,
      mode: 'native-proposal',
      configurationId: firstTarget.id,
      envelopeRequest,
      durationBasis: 'C002 synthetic comparison seconds only, not an estimate of native setup, run, overlap, cleanup, or billing duration. Actual native elapsed time is unknown.',
      resources: {
        cloudResourceCount: null,
        description: 'Unknown: native OS, SKU, subscription, resource group and region are unapproved. Slot overlap, control storage, networking and cleanup are not inventoried or priced.'
      },
      pricing: {
        status: 'missing',
        currency: null,
        totalMinorUnits: null,
        basis: 'No approved SKU, region, currency, rate, billing duration or quote. No pricing was queried. Missing pricing is not zero cost or approval.',
        source: null
      }
    }
  });
}));
