'use strict';

const contract = require('./contract.js');
const indexedProfiles = new Map(contract.profiles.map((profile) => [profile.id, profile]));

class FixtureError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'FixtureError';
    this.code = code;
    this.status = status;
  }
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function profileIdFrom(request) {
  try {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new TypeError();
    const prototype = Object.getPrototypeOf(request);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError();
    const descriptors = Object.getOwnPropertyDescriptors(request);
    const keys = Reflect.ownKeys(descriptors);
    const field = descriptors.profileId;
    if (keys.length !== 1 || keys[0] !== 'profileId' ||
        !field.enumerable || !Object.hasOwn(field, 'value')) throw new TypeError();
    if (typeof field.value !== 'string' || !/^synthetic-\d{3}$/.test(field.value)) {
      throw new FixtureError('INVALID_PROFILE_ID', 'profileId must be an explicit synthetic-NNN identifier.');
    }
    return field.value;
  } catch (error) {
    if (error instanceof FixtureError) throw error;
    throw new FixtureError('INVALID_REQUEST', 'Only one own data field, profileId, is accepted; overrides are forbidden.');
  }
}

function responseFor(implementation, profile) {
  if (!profile) throw new FixtureError('UNKNOWN_PROFILE', 'No synthetic profile has that identifier.', 404);
  return freeze(structuredClone({
    apiContract: contract.apiContract,
    profile,
    stamp: contract.stamps[implementation]
  }));
}

function getProfileV1(request) {
  const id = profileIdFrom(request);
  return responseFor('v1', contract.profiles.find((profile) => profile.id === id));
}

function getProfileV2(request) {
  const id = profileIdFrom(request);
  return responseFor('v2', indexedProfiles.get(id));
}

module.exports = Object.freeze({ getProfileV1, getProfileV2, FixtureError });
