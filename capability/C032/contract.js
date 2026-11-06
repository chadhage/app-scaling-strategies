(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    Object.defineProperty(root, 'C032Contract', { value: factory() });
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

  // Public, fictional contract shared by the server, the cookie-less client and the page.
  return freeze({
    cardId: 'C032',
    apiContract: 'cookieless-observation/1',
    businessData: 'synthetic',
    stamp: 'C032-loopback-r1',
    transitionAfter: 2,
    paths: { observation: '/api/v1/observation', scope: '/scope.json' },
    headers: { destination: 'x-c032-destination', counter: 'x-c032-state-counter', stamp: 'x-c032-stamp' },
    credentialPattern: '^c032-synthetic-opaque-[a-z]{1,16}-[0-9]{4}$',
    clients: ['synthetic-client-alpha', 'synthetic-client-beta'],
    destinations: {
      blue: { id: 'synthetic-destination-blue', version: '1.0.0' },
      green: { id: 'synthetic-destination-green', version: '2.0.0' }
    },
    errorCodes: [
      'CREDENTIAL_MISSING', 'CREDENTIAL_MALFORMED', 'CREDENTIAL_FORGED', 'CREDENTIAL_EXPIRED', 'CREDENTIAL_AMBIGUOUS',
      'INVALID_QUERY', 'UNEXPECTED_BODY', 'METHOD_NOT_ALLOWED', 'NOT_FOUND', 'LOCAL_HOST_REQUIRED',
      'CROSS_ORIGIN_DENIED', 'URL_TOO_LONG', 'INVALID_URL', 'FIXTURE_UNAVAILABLE'
    ]
  });
}));
