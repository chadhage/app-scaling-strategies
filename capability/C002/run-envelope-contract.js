(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    Object.defineProperty(root, 'C002RunEnvelopeContract', { value: factory() });
  }
}(globalThis, function () {
  'use strict';

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function record(properties) {
    return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
  }

  function integer(extra = {}) {
    return { type: 'integer', minimum: -Number.MAX_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER, ...extra };
  }

  function range(minimum) {
    return record({ min: integer({ minimum }), max: integer({ minimum }) });
  }

  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'C002: explicit local run-envelope validation request',
    description: 'Comparison only. Never executes a run or grants Azure authority. No implicit limits.',
    ...record({
      envelope: record({
        schemaVersion: integer({ const: 1 }),
        action: { type: 'string', const: 'local.probe' },
        scope: record({
          mode: { type: 'string', const: 'local-implementation-only' },
          liveAzureRuns: integer({ const: 0 })
        }),
        load: record({ requestsPerSecond: integer(), concurrentUsers: integer() }),
        durationSeconds: integer(),
        capacity: record({ units: integer() }),
        budget: record({ cloudSpend: integer() })
      }),
      limits: record({
        kind: { type: 'string', const: 'local-comparison-only' },
        label: { type: 'string', minLength: 1, maxLength: 120, pattern: '\\S' },
        load: record({ requestsPerSecond: range(1), concurrentUsers: range(1) }),
        durationSeconds: range(1),
        capacity: record({ units: range(1) }),
        budget: record({
          cloudSpend: record({
            min: integer({ minimum: 0, const: 0 }),
            max: integer({ minimum: 0, const: 0 })
          })
        })
      })
    })
  };

  return freeze({
    schema,
    metrics: [
      'load.requestsPerSecond', 'load.concurrentUsers', 'durationSeconds',
      'capacity.units', 'budget.cloudSpend'
    ],
    numericPolicy: 'Finite safe-integer JSON numbers only; no coercion, fractions, boxed values, BigInt, or negative zero. Text parsing rejects duplicate fields and precision-losing number literals.',
    rangePolicy: 'Every min/max is required, inclusive, and ordered. Cloud comparison bounds must both be zero.',
    authorityPolicy: 'C001 guard is mandatory. Supplied local-comparison-only limits cannot authorize an operation.'
  });
}));
