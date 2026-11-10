'use strict';

// Authentication and the permission decision. Every identity comes from a server-issued opaque token; nothing a client
// sends in a header, query or body is ever read as a role or subject.
const { createHash, randomBytes: nodeRandomBytes } = require('node:crypto');
const contract = require('./contract.js');

const REALM = 'Bearer realm="c009-local"';
const CHALLENGES = Object.freeze({
  AUTHENTICATION_REQUIRED: REALM,
  TOKEN_MALFORMED: `${REALM}, error="invalid_request"`,
  TOKEN_UNKNOWN: `${REALM}, error="invalid_token"`,
  TOKEN_EXPIRED: `${REALM}, error="invalid_token"`
});
const TOKEN_SHAPE = /^c009_[A-Za-z0-9_-]{43}$/;
const CREDENTIAL = /^bearer ([A-Za-z0-9._~+/-]+=*)$/i;
const MAX_CREDENTIAL = 256;
// Headers that proxies and identity platforms use to carry a role or subject; they are reported by name and never obeyed.
const CLAIM_HEADERS = new Set(['role', 'roles', 'subject', 'owner', 'identity', 'x-role', 'x-roles', 'x-user-role', 'x-forwarded-role',
  'x-user', 'x-forwarded-user', 'x-subject', 'x-owner', 'x-identity', 'x-acting-as', 'x-ms-client-principal',
  'x-ms-client-principal-id', 'x-ms-client-principal-name']);

class AuthError extends Error {
  constructor(code) {
    if (!Object.hasOwn(CHALLENGES, code)) throw new RangeError('Unknown authentication error code');
    super(code);
    this.name = 'AuthError';
    this.code = code;
    this.status = 401;
    this.challenge = CHALLENGES[code];
  }
}

function decide(table, command, role) {
  if (typeof command !== 'string' || !Object.hasOwn(table, command)) {
    return { allowed: false, status: 404, code: 'COMMAND_UNKNOWN', requiredRoles: [] };
  }
  const entry = table[command];
  const roles = entry && Array.isArray(entry.roles) ? [...entry.roles] : [];
  if (typeof role === 'string' && roles.includes(role)) return { allowed: true, status: 200, code: 'ok', requiredRoles: roles };
  return { allowed: false, status: 403, code: 'ROLE_FORBIDDEN', requiredRoles: roles };
}

function headerValues(rawHeaders, wanted) {
  const values = [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index].toLowerCase() === wanted) values.push(rawHeaders[index + 1]);
  }
  return values;
}

// null means no credential was presented; anything presented but not exactly one well-formed credential is an error.
function parseBearer(rawHeaders) {
  const values = headerValues(rawHeaders, 'authorization');
  if (values.length === 0) return null;
  const match = values.length === 1 ? CREDENTIAL.exec(values[0]) : null;
  if (!match || match[1].length > MAX_CREDENTIAL) throw new AuthError('TOKEN_MALFORMED');
  return match[1];
}

function createTokenRegistry({ now = Date.now, randomBytes = nodeRandomBytes } = {}) {
  const entries = new Map();
  const keyOf = (token) => createHash('sha256').update(token).digest('hex');
  return {
    issue(name, { ttlMs = contract.limits.defaultTtlMs } = {}) {
      if (typeof name !== 'string' || !Object.hasOwn(contract.identities, name)) {
        throw Object.assign(new RangeError('Unknown synthetic identity'), { code: 'IDENTITY_UNKNOWN' });
      }
      if (!Number.isInteger(ttlMs) || ttlMs < 0 || ttlMs > contract.limits.maxTtlMs) {
        throw Object.assign(new RangeError('Invalid token lifetime'), { code: 'TTL_INVALID' });
      }
      const token = `c009_${randomBytes(32).toString('base64url')}`;
      const { subject, role } = contract.identities[name];
      entries.set(keyOf(token), Object.freeze({ subject, role, expiresAtMs: now() + ttlMs }));
      return token;
    },
    verify(token) {
      if (typeof token !== 'string' || !TOKEN_SHAPE.test(token)) throw new AuthError('TOKEN_MALFORMED');
      const entry = entries.get(keyOf(token));
      if (!entry) throw new AuthError('TOKEN_UNKNOWN');
      if (now() >= entry.expiresAtMs) throw new AuthError('TOKEN_EXPIRED');
      return entry;
    }
  };
}

function authenticate(registry, rawHeaders) {
  const token = parseBearer(rawHeaders);
  return token === null ? null : registry.verify(token);
}

function claimedHeaders(rawHeaders) {
  const names = new Set();
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index].toLowerCase();
    if (CLAIM_HEADERS.has(name)) names.add(name);
  }
  return [...names].sort();
}

module.exports = Object.freeze({ AuthError, decide, parseBearer, createTokenRegistry, authenticate, claimedHeaders });
