(function (root, factory) {
  'use strict';
  const fixtures = factory();
  if (typeof module === 'object' && module.exports) module.exports = fixtures;
  else root.CachePayloadFixtures = fixtures;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  return freeze({
    expected: { itemId: 'SYN-CART-055', minor: 1250, currency: 'USD' },
    v1: { schema: 1, itemId: 'SYN-CART-055', totalCents: 1250, currency: 'USD' },
    v2: {
      equivalent: { schema: 2, itemId: 'SYN-CART-055', money: { minor: 1250, currency: 'USD' } },
      malformed: { schema: 2, itemId: 'SYN-CART-055', money: { minor: '1250', currency: 'USD' } },
      'wrong-total': { schema: 2, itemId: 'SYN-CART-055', money: { minor: 1200, currency: 'USD' } },
    },
  });
}));
