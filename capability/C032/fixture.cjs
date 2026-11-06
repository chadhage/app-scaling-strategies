'use strict';

const contract = require('./contract.js');

// Fictional opaque credentials. Each carries the last logical epoch in which it is valid; there is no wall clock.
const CURRENT_EPOCH = 5;
const issued = Object.freeze({
  'c032-synthetic-opaque-alpha-0001': Object.freeze({ clientId: 'synthetic-client-alpha', lastEpoch: 9 }),
  'c032-synthetic-opaque-beta-0002': Object.freeze({ clientId: 'synthetic-client-beta', lastEpoch: 9 }),
  'c032-synthetic-opaque-expired-0003': Object.freeze({ clientId: 'synthetic-client-alpha', lastEpoch: 4 })
});
const credentialPattern = new RegExp(contract.credentialPattern);

class FixtureError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'FixtureError';
    this.status = status;
    this.code = code;
  }
}

function deepFreeze(value) {
  Object.values(value).forEach((child) => { if (child && typeof child === 'object') deepFreeze(child); });
  return Object.freeze(value);
}

// One world owns every client's served-request counter. Callers can only present a credential: they cannot
// supply a destination, a counter or a stamp, and nothing here knows what a cookie is.
function createWorld({ epoch = CURRENT_EPOCH } = {}) {
  if (!Number.isSafeInteger(epoch) || epoch < 0) throw new TypeError('The logical epoch must be a non-negative safe integer.');
  const served = new Map();

  function authenticate(authorization) {
    if (authorization === undefined) {
      throw new FixtureError(401, 'CREDENTIAL_MISSING', 'An explicit Bearer credential is required; no default identity exists.');
    }
    const presented = /^Bearer (\S*)$/i.exec(authorization);
    if (!presented || !credentialPattern.test(presented[1])) {
      throw new FixtureError(401, 'CREDENTIAL_MALFORMED', 'The Authorization header must carry one opaque Bearer credential.');
    }
    const entry = Object.hasOwn(issued, presented[1]) ? issued[presented[1]] : undefined;
    if (!entry) throw new FixtureError(401, 'CREDENTIAL_FORGED', 'The credential was not issued by this synthetic fixture.');
    if (entry.lastEpoch < epoch) throw new FixtureError(401, 'CREDENTIAL_EXPIRED', 'The credential is expired in the current logical epoch.');
    return entry.clientId;
  }

  function serve(clientId) {
    const counter = (served.get(clientId) || 0) + 1;
    served.set(clientId, counter);
    const destination = counter <= contract.transitionAfter ? contract.destinations.blue : contract.destinations.green;
    return deepFreeze({
      apiContract: contract.apiContract,
      businessData: contract.businessData,
      client: { id: clientId },
      destination: { id: destination.id, version: destination.version },
      state: { counter },
      stamp: contract.stamp
    });
  }

  return Object.freeze({ authenticate, serve });
}

module.exports = Object.freeze({ CURRENT_EPOCH, FixtureError, createWorld, issuedCredentials: Object.freeze(Object.keys(issued)) });
