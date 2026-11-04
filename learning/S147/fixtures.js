(function (root) {
  'use strict';

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function expected(id) {
    return {
      body: `fictional-receipt:${id}`,
      signedIn: true,
      identity: `fictional-person:${id}`,
      session: `fictional-session:${id}`,
      stateVersion: 7,
      items: ['sample-book'],
      effectKey: `fictional-effect:${id}`,
      effectCount: 1,
      view: 'order-confirmation',
      clientVersion: 'fictional-client-v1',
      apiVersion: 'fictional-api-v1',
    };
  }

  function observed(wanted) {
    return {
      response: { available: true, body: wanted.body },
      authentication: {
        available: true, signedIn: wanted.signedIn,
        identity: wanted.identity, session: wanted.session,
      },
      state: { available: true, version: wanted.stateVersion, items: [...wanted.items] },
      effect: {
        available: true, key: wanted.effectKey,
        count: wanted.effectCount, identity: wanted.identity,
      },
      ui: {
        available: true, view: wanted.view,
        clientVersion: wanted.clientVersion, apiVersion: wanted.apiVersion,
      },
    };
  }

  function unobserved() {
    return {
      response: { available: false, body: null },
      authentication: { available: false, signedIn: null, identity: null, session: null },
      state: { available: false, version: null, items: null },
      effect: { available: false, key: null, count: null, identity: null },
      ui: { available: false, view: null, clientVersion: null, apiVersion: null },
    };
  }

  function attempt(id, wanted, observations, phase = 'serving') {
    return {
      id, phase,
      request: {
        method: 'POST (fictional record only)',
        target: 'synthetic:checkout (not a URL)',
        intendedIdentity: wanted.identity,
        originalStateVersion: wanted.stateVersion,
        logicalEffectKey: wanted.effectKey,
        clientVersion: wanted.clientVersion,
        apiVersion: wanted.apiVersion,
      },
      server: { httpStatus: 200, ready: true, reportedRequestsPerSecond: 240 },
      observations,
    };
  }

  function journey(id, alteration, recovery = false) {
    const wanted = expected(id);
    let first = observed(wanted);
    if (alteration === 'empty-success') first.response.body = '';
    if (alteration === 'silent-logout') {
      first.authentication = { available: true, signedIn: false, identity: null, session: null };
    }
    if (alteration === 'lost-state') first.state = { available: true, version: 6, items: [] };
    if (alteration === 'duplicate-effect') first.effect.count = 2;
    if (alteration === 'broken-ui') {
      first.ui.view = 'blank';
      first.ui.apiVersion = 'fictional-api-v2';
    }
    if (alteration === 'unknown') first = unobserved();
    const attempts = [attempt(`${id}:original`, wanted, first)];
    if (recovery) attempts.push(attempt(`${id}:later`, wanted, observed(wanted), 'later-recovery'));
    return {
      id,
      goal: 'Keep the intended fictional identity and state, one logical effect, and a usable compatible confirmation.',
      expected: wanted,
      attempts,
    };
  }

  const fixtures = [
    {
      id: 'positive-control', title: 'Positive control: complete client evidence',
      kind: 'positive-control', expectedNegative: false,
      description: 'Two fixed original journeys have complete matching client evidence.',
      journeys: [journey('F-positive-1'), journey('F-positive-2')],
    },
    {
      id: 'empty-success', title: 'Misleading 200: empty-success body',
      kind: 'expected-negative', expectedNegative: true,
      description: 'A 200 receipt contains an observed empty body instead of the required receipt.',
      journeys: [journey('F-empty', 'empty-success')],
    },
    {
      id: 'silent-logout', title: 'Misleading 200: silent logout',
      kind: 'expected-negative', expectedNegative: true,
      description: 'The client is observed signed out; intended identity and session were not preserved.',
      journeys: [journey('F-logout', 'silent-logout')],
    },
    {
      id: 'lost-state', title: 'Misleading 200: silent state loss',
      kind: 'expected-negative', expectedNegative: true,
      description: 'The observed cart is empty and its version regressed, despite healthy status.',
      journeys: [journey('F-state', 'lost-state')],
    },
    {
      id: 'duplicate-effect', title: 'Misleading 200: duplicate logical effects',
      kind: 'expected-negative', expectedNegative: true,
      description: 'Two effects are observed for one intended fictional effect key and identity.',
      journeys: [journey('F-duplicate', 'duplicate-effect')],
    },
    {
      id: 'broken-ui', title: 'Misleading 200: broken incompatible UI',
      kind: 'expected-negative', expectedNegative: true,
      description: 'The observed view is blank and the API version differs from the supported fixture.',
      journeys: [journey('F-ui', 'broken-ui')],
    },
    {
      id: 'missing-observation', title: 'Unknown: missing client observations',
      kind: 'unknown', expectedNegative: false,
      description: 'Transport is observed; all five required client observations are unavailable, not failed.',
      journeys: [journey('F-unobserved', 'unknown')],
    },
    {
      id: 'later-recovery', title: 'Later recovery: do not erase original impact',
      kind: 'mixed-recovery', expectedNegative: true,
      description: 'One original state loss and one original unknown each have a later correct observation.',
      journeys: [
        journey('F-recovered-interruption', 'lost-state', true),
        journey('F-recovered-unknown', 'unknown', true),
      ],
    },
  ];

  const api = freeze({ fixtures });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S147Fixtures = api;
}(typeof globalThis === 'object' ? globalThis : this));
