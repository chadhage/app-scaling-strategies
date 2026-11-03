(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S051Fixtures = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  const baseline = { id: 'synthetic-051', displayName: 'Synthetic learner', unreadCount: 1 };
  const journeys = [2, 3, 4].map((unreadCount, index) => {
    const expected = { id: baseline.id, displayName: baseline.displayName, unreadCount };
    return {
      request: index + 1,
      method: 'GET',
      path: '/api/profile',
      expected,
      compatible: { status: 200, body: { ...expected, theme: 'new-api-theme' } },
      breaking: {
        status: 200,
        body: { id: expected.id, profile: { name: expected.displayName }, unreadCount },
      },
    };
  });
  return freeze({
    defaults: { response: 'compatible', observation: 'complete' },
    baseline,
    journeys,
    maxAttempts: 8,
  });
}));
