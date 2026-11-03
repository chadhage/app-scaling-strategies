'use strict';

const { createHash } = require('node:crypto');
const path = require('node:path');
const contract = require(path.join(__dirname, '..', 'C020', 'contract.js'));
const { getProfileV1, getProfileV2 } = require(path.join(__dirname, '..', 'C020', 'profiles.cjs'));
const BYTE_LENGTH = 8192;
const versions = Object.freeze({ r1: getProfileV1, r2: getProfileV2 });

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

const catalog = new Map();
for (const [profileIndex, profile] of contract.profiles.entries()) {
  for (const [version, provider] of Object.entries(versions)) {
    const fixture = provider({ profileId: profile.id });
    const artifactId = `C025:${profile.id}:${version}`;
    const bytes = Buffer.alloc(BYTE_LENGTH);
    const prefix = Buffer.from(`${JSON.stringify({
      apiContract: 'ranged-download/1', artifactId, artifactVersion: version,
      source: 'unchanged C020 synthetic provider', fixture
    })}\n`, 'utf8');
    if (prefix.length >= BYTE_LENGTH) throw new Error('Synthetic prefix exceeds the artifact bound.');
    prefix.copy(bytes);
    for (let i = prefix.length; i < bytes.length; i++) {
      bytes[i] = (i * 37 + profileIndex * 53 + (version === 'r1' ? 17 : 29)) & 255;
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const manifest = freeze({
      apiContract: 'ranged-download/1', dataKind: 'synthetic', localOnly: true,
      artifactId, artifactVersion: version, profileId: profile.id,
      byteLength: bytes.length, sha256, etag: `"sha256-${sha256}"`,
      lineage: { cardId: 'C020', apiContract: fixture.apiContract, profileId: profile.id, stamp: fixture.stamp }
    });
    catalog.set(artifactId, { manifest, bytes });
  }
}

function getArtifact(request) {
  let fields;
  try {
    const proto = Object.getPrototypeOf(request);
    fields = Object.getOwnPropertyDescriptors(request);
    const keys = Reflect.ownKeys(fields).sort();
    if ((proto !== Object.prototype && proto !== null) ||
        keys.length !== 2 || keys[0] !== 'profileId' || keys[1] !== 'version' ||
        !Object.hasOwn(fields.profileId, 'value') || !Object.hasOwn(fields.version, 'value') ||
        !fields.profileId.enumerable || !fields.version.enumerable) throw new TypeError();
  } catch {
    throw new FixtureError('INVALID_REQUEST', 'Exactly the own data fields profileId and version are required.');
  }
  const { profileId, version } = { profileId: fields.profileId.value, version: fields.version.value };
  if (typeof profileId !== 'string' || !/^synthetic-\d{3}$/.test(profileId)) {
    throw new FixtureError('INVALID_PROFILE_ID', 'An explicit synthetic-NNN profile ID is required.');
  }
  if (!contract.profiles.some((profile) => profile.id === profileId)) {
    throw new FixtureError('UNKNOWN_PROFILE', 'No synthetic profile has that identifier.', 404);
  }
  if (typeof version !== 'string' || !Object.hasOwn(versions, version)) {
    throw new FixtureError('UNKNOWN_VERSION', 'Only immutable fixture versions r1 and r2 exist.', 404);
  }
  const entry = catalog.get(`C025:${profileId}:${version}`);
  return { manifest: entry.manifest, bytes: Buffer.from(entry.bytes) };
}

function parseRange(value, total) {
  if (!Number.isSafeInteger(total) || total < 1 || total > BYTE_LENGTH) {
    throw new FixtureError('INVALID_LENGTH', 'A bounded positive artifact length is required.');
  }
  if (typeof value !== 'string' || value.length > 100) {
    throw new FixtureError('INVALID_RANGE', 'Provide one bounded bytes range.');
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) {
    throw new FixtureError('INVALID_RANGE', 'Only one bytes=start-end, bytes=start-, or bytes=-suffix range is supported.');
  }
  const left = match[1] ? Number(match[1]) : null;
  const right = match[2] ? Number(match[2]) : null;
  if ((left !== null && !Number.isSafeInteger(left)) || (right !== null && !Number.isSafeInteger(right)) ||
      (left !== null && right !== null && left > right)) {
    throw new FixtureError('INVALID_RANGE', 'Range integers must be safe and ordered.');
  }
  if ((left !== null && left >= total) || (left === null && right === 0)) {
    throw new FixtureError('RANGE_UNSATISFIABLE', 'The requested range contains no bytes of this artifact.', 416);
  }
  const start = left === null ? Math.max(0, total - right) : left;
  const end = left === null || right === null ? total - 1 : Math.min(right, total - 1);
  return Object.freeze({ start, end, length: end - start + 1 });
}

module.exports = Object.freeze({ getArtifact, parseRange, FixtureError, BYTE_LENGTH });
