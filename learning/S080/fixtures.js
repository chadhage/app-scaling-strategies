(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PartitionFixture = factory();
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  return Object.freeze({
    partition: 'P0',
    oldConsumer: 'consumer-a',
    oldEpoch: 7,
    newConsumer: 'consumer-b',
    newEpoch: 8,
    requiredCheckpoint: 3,
    events: Object.freeze(Array.from({ length: 6 }, (_, index) => Object.freeze({
      id: `E0${index + 1}`, offset: index + 1, effectKey: `P0:E0${index + 1}`,
    }))),
    options: Object.freeze({
      checkpoint: Object.freeze(['transfer', 'missing', 'ahead', 'unavailable']),
      oldProbe: Object.freeze(['fenced', 'accepted', 'unavailable']),
      delivery: Object.freeze(['complete', 'repeat', 'drop', 'unavailable']),
      effects: Object.freeze(['idempotent', 'unchecked']),
    }),
    maxAttempts: 6,
    maxDeliveries: 8,
    combinations: 96,
  });
}));
