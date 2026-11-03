(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./contract.js'));
  } else {
    Object.defineProperty(root, 'C020Inspector', { value: factory(root.C020Contract) });
  }
}(globalThis, function (contract) {
  'use strict';

  function reject(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function canonical(value, ancestors = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (!value || typeof value !== 'object' || ancestors.has(value) || ancestors.size > 12) {
      reject('INVALID_DATA', 'Observation must be finite JSON data.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value'))) {
      reject('INVALID_DATA', 'Observation must not contain accessors or symbol properties.');
    }
    ancestors.add(value);
    let result;
    if (Array.isArray(value)) {
      if (keys.length !== value.length + 1 || !Object.hasOwn(descriptors, 'length') ||
          Array.from({ length: value.length }, (_, index) => String(index)).some((key) => !descriptors[key]?.enumerable)) {
        reject('INVALID_DATA', 'Observation arrays must be dense JSON arrays.');
      }
      result = `[${Array.from({ length: value.length }, (_, index) => canonical(descriptors[index].value, ancestors)).join(',')}]`;
    } else {
      if (keys.some((key) => !descriptors[key].enumerable)) reject('INVALID_DATA', 'Observation fields must be enumerable.');
      result = `{${keys.sort().map((key) => `${JSON.stringify(key)}:${canonical(descriptors[key].value, ancestors)}`).join(',')}}`;
    }
    ancestors.delete(value);
    return result;
  }

  function oldConsumer(response) {
    canonical(response);
    if (response?.apiContract !== 'getProfile/1') reject('CONTRACT_MISMATCH', 'The old consumer requires getProfile/1.');
    const profile = response.profile;
    const preferences = profile?.preferences;
    if (!profile || !['id', 'displayName', 'email'].every((key) => typeof profile[key] === 'string') ||
        !preferences || typeof preferences.locale !== 'string' || typeof preferences.theme !== 'string' ||
        !Array.isArray(preferences.topics) || !preferences.topics.every((topic) => typeof topic === 'string')) {
      reject('INVALID_PROFILE', 'Required old-consumer profile fields are missing or invalid.');
    }
    return freeze({
      id: profile.id, displayName: profile.displayName, email: profile.email,
      preferences: { locale: preferences.locale, theme: preferences.theme, topics: [...preferences.topics] }
    });
  }

  function inspect(response, implementation, profileId) {
    if (!contract || contract.apiContract !== 'getProfile/1' || !contract.stamps || !Array.isArray(contract.profiles)) {
      reject('CONTRACT_UNAVAILABLE', 'The local fixture contract is unavailable; no observation can be verified.');
    }
    if (typeof implementation !== 'string' || !Object.hasOwn(contract.stamps, implementation)) {
      reject('UNKNOWN_IMPLEMENTATION', 'An explicit v1 or v2 observation is required.');
    }
    const expected = contract.profiles.find((profile) => profile.id === profileId);
    if (!expected) reject('UNKNOWN_PROFILE', 'The expected synthetic profile is unknown.');
    canonical(response);
    if (!response || response.apiContract !== contract.apiContract) {
      reject('CONTRACT_MISMATCH', 'The response did not preserve getProfile/1.');
    }
    if (!response.stamp || canonical(response.stamp) !== canonical(contract.stamps[implementation])) {
      reject('STAMP_MISMATCH', 'The server-owned implementation/deployment stamp is missing or unexpected.');
    }
    if (!response.profile || canonical(response.profile) !== canonical(expected)) {
      reject('PROFILE_MISMATCH', 'The response differs from the immutable expected synthetic profile.');
    }
    if (Object.keys(response).sort().join(',') !== 'apiContract,profile,stamp') {
      reject('INVALID_ENVELOPE', 'The known fixture response envelope differs from the observed response.');
    }
    return freeze({
      verified: true, apiContract: response.apiContract, profileId,
      implementation, stamp: { ...response.stamp }, oldConsumer: oldConsumer(response)
    });
  }

  function compare(v1, v2, profileId) {
    const observations = [inspect(v1, 'v1', profileId), inspect(v2, 'v2', profileId)];
    if (canonical(observations[0].oldConsumer) !== canonical(observations[1].oldConsumer)) {
      reject('COMPATIBILITY_MISMATCH', 'The unchanged old consumer observed different profile semantics.');
    }
    return freeze({
      verified: true, apiContract: contract.apiContract,
      compatible: true, oldConsumer: observations[0].oldConsumer, observations
    });
  }

  function parseCandidate(text, implementation, profileId) {
    if (typeof text !== 'string' || text.length === 0 || text.length > 16384) {
      reject('INVALID_JSON', 'Supply an explicit JSON candidate of at most 16384 characters.');
    }
    let value;
    try { value = JSON.parse(text); } catch { reject('INVALID_JSON', 'Candidate is not valid JSON.'); }
    return inspect(value, implementation, profileId);
  }

  return Object.freeze({ oldConsumer, inspect, compare, parseCandidate });
}));
