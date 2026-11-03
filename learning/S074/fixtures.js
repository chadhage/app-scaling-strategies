(function (root, factory) {
  'use strict';
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.S074Fixtures = value;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  return freeze({
    defaultInput: { pressure: 'capacity', durable: 'current', response: 'recover' },
    pressures: {
      none: { tick: 0, slots: 2, label: 'No pressure: tick 0, two slots' },
      capacity: { tick: 0, slots: 0, label: 'Capacity shrink: two slots to zero' },
      'ttl-optional': { tick: 2, slots: 2, label: 'TTL: tick 2, optional tile expires' },
      'ttl-session': { tick: 4, slots: 2, label: 'TTL: tick 4, required session expires' },
    },
    durableModes: ['current', 'missing', 'stale', 'unverified'],
    responseModes: ['recover', 'empty-success'],
    outcomes: ['SUCCESS', 'FAILURE', 'UNKNOWN'],
    required: { session: 'synthetic-session-074', revision: 3, cart: 'synthetic-bolt:2', step: 'review' },
    stale: { session: 'synthetic-session-074', revision: 2, cart: 'synthetic-bolt:1', step: 'edit' },
    entries: [
      { key: 'required-session', kind: 'required', expiresAt: 4, lastUsed: 0 },
      { key: 'derived-tile', kind: 'optional', expiresAt: 2, lastUsed: 1 },
    ],
    derivedTile: 'synthetic-catalog-tile-v1',
    historyLimit: 6,
  });
}));
