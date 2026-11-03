(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    Object.defineProperty(root, 'C020Contract', { value: factory() });
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

  const profiles = [
    {
      id: 'synthetic-001',
      displayName: 'Avery Example',
      email: 'avery@example.invalid',
      preferences: { locale: 'en-GB', theme: 'dark', topics: ['scaling', 'versions'] }
    },
    {
      id: 'synthetic-002',
      displayName: 'Jordan Sample',
      email: 'jordan@example.invalid',
      preferences: { locale: 'fr-FR', theme: 'light', topics: [] }
    }
  ];

  const stamps = Object.fromEntries(['v1', 'v2'].map((implementation, index) => [
    implementation,
    {
      tier: 'getProfile',
      implementation,
      implementationVersion: `${index + 1}.0.0`,
      deploymentStamp: `C020-loopback-${implementation}-r1`,
      deploymentKind: 'local-fixture-label-not-cloud',
      fixtureRevision: 'C020-r1',
      profileCatalogVersion: 'synthetic-profiles/1',
      dataKind: 'synthetic'
    }
  ]));

  return freeze({ apiContract: 'getProfile/1', profiles, stamps });
}));
