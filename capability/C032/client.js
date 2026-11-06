(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./contract.js'));
  } else {
    Object.defineProperty(root, 'C032Client', { value: factory(root.C032Contract) });
  }
}(globalThis, function (contract) {
  'use strict';

  // Without the shared public contract nothing can be verified, so the client is deliberately unavailable.
  if (!contract) return null;

  class ClientError extends Error {
    constructor(code, message, status = null) {
      super(message);
      this.name = 'ClientError';
      this.code = code;
      this.status = status;
    }
  }

  const CODE_SHAPE = /^[A-Z][A-Z_]{2,39}$/;

  // A plain data record: its prototype is null or a root prototype, so objects from another realm still qualify.
  function isRecord(value) {
    if (value === null || typeof value !== 'object' || Object.prototype.toString.call(value) !== '[object Object]') return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || Object.getPrototypeOf(prototype) === null;
  }

  function hasExactKeys(value, keys) {
    return isRecord(value) && Object.keys(value).sort().join() === [...keys].sort().join();
  }

  function deepFreeze(value) {
    Object.values(value).forEach((child) => { if (child && typeof child === 'object') deepFreeze(child); });
    return Object.freeze(value);
  }

  function invalid(message) {
    return new ClientError('INVALID_OBSERVATION', message);
  }

  // Accepts only an exact, closed observation whose headers agree with its body.
  function validateObservation(body, headers) {
    if (!hasExactKeys(body, ['apiContract', 'businessData', 'client', 'destination', 'state', 'stamp'])) {
      throw invalid('The observation has missing or unknown fields.');
    }
    if (body.apiContract !== contract.apiContract || body.businessData !== contract.businessData || body.stamp !== contract.stamp) {
      throw invalid('The observation contract, data label or stamp is not the expected one.');
    }
    if (!hasExactKeys(body.client, ['id']) || !contract.clients.includes(body.client.id)) throw invalid('The client is not a known synthetic client.');
    const destination = Object.values(contract.destinations).find((item) => item.id === (body.destination && body.destination.id));
    if (!hasExactKeys(body.destination, ['id', 'version']) || !destination || destination.version !== body.destination.version) {
      throw invalid('The destination is not a known synthetic destination.');
    }
    if (!hasExactKeys(body.state, ['counter']) || !Number.isSafeInteger(body.state.counter) || body.state.counter < 1) {
      throw invalid('The state counter must be a positive integer.');
    }
    if (headers.get(contract.headers.destination) !== body.destination.id ||
        headers.get(contract.headers.counter) !== String(body.state.counter) ||
        headers.get(contract.headers.stamp) !== body.stamp) {
      throw new ClientError('OBSERVATION_INCOHERENT', 'The response headers disagree with the observation body.');
    }
    return deepFreeze(JSON.parse(JSON.stringify(body)));
  }

  // The client never reads or writes a cookie: it sends credentials 'omit' and one explicit Bearer credential,
  // or no credential at all (never a default identity), and it refuses a server that tries to set a cookie.
  function createClient({ fetch: fetcher = globalThis.fetch, baseUrl = '', credential } = {}) {
    if (typeof fetcher !== 'function') throw new ClientError('FETCH_UNAVAILABLE', 'A fetch implementation is required.');
    if (credential !== undefined && typeof credential !== 'string') {
      throw new ClientError('CREDENTIAL_TYPE', 'A credential must be an explicit string or be left out entirely.');
    }

    async function observe() {
      const headers = { Accept: 'application/json' };
      if (credential !== undefined) headers.Authorization = `Bearer ${credential}`;
      let response;
      try {
        response = await fetcher(`${baseUrl}${contract.paths.observation}`, {
          method: 'GET', headers, credentials: 'omit', cache: 'no-store', redirect: 'error'
        });
      } catch (error) {
        throw new ClientError('TRANSPORT_FAILED', `The local request failed: ${error.message}`);
      }
      if (response.headers.get('set-cookie') !== null) {
        throw new ClientError('COOKIE_SET_FORBIDDEN', 'The server attempted to set a cookie; a cookie-less client refuses it.', response.status);
      }
      let body;
      try {
        body = await response.json();
      } catch {
        throw new ClientError('INVALID_JSON', 'The local response is not JSON.', response.status);
      }
      if (!response.ok) {
        const code = isRecord(body) && isRecord(body.error) && CODE_SHAPE.test(body.error.code) ? body.error.code : 'HTTP_ERROR';
        throw new ClientError(code, `HTTP ${response.status}`, response.status);
      }
      return validateObservation(body, response.headers);
    }

    return Object.freeze({ observe });
  }

  return Object.freeze({ ClientError, createClient, validateObservation });
}));
