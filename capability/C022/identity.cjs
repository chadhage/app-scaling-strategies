'use strict';

// Identity and session state: memberships (tenant, user, role), one-time login tickets and sessions, as a CLOSED state machine whose
// every transition is decided here and every refusal leaves NOTHING behind (the state is only written after the last check).
//   session:  active -> logged_out | revoked | superseded (an anonymous session replaced by a login); active -> expired by the clock
//   ticket:   unused -> used (only by the login that creates a session); a ticket is never reusable
//   role:     a membership role changes at once for every session of that user; a session NEVER carries a role of its own
// The "expired" state is DERIVED from the injected clock, never written by a request. Tokens and tickets are opaque random values held
// only as SHA-256 digests; the public session id (sid) is a separate random value. Nothing here knows HTTP.
const { createHash, randomBytes: nodeRandomBytes } = require('node:crypto');
const contract = require('./contract.js');

const TOKEN_SHAPE = /^c022_[A-Za-z0-9_-]{43}$/;
const TICKET_SHAPE = /^t022_[A-Za-z0-9_-]{43}$/;
const ENDED = Object.freeze({ expired: 'SESSION_EXPIRED', logged_out: 'SESSION_LOGGED_OUT', revoked: 'SESSION_REVOKED', superseded: 'SESSION_SUPERSEDED' });
const digest = (value) => createHash('sha256').update(value).digest('hex');
const refuse = (code) => Object.freeze({ ok: false, code });

function createIdentity({ now = Date.now, randomBytes = nodeRandomBytes, members = contract.members, limits = contract.limits } = {}) {
  const roles = new Map(Object.entries(members).map(([tenant, team]) => [tenant, new Map(Object.entries(team))]));
  const tickets = new Map();
  const sessions = new Map();
  const bySid = new Map();
  let sequence = 0;

  const effective = (record) => (record.state === 'active' && now() >= record.expiresAtMs ? 'expired' : record.state);
  const publicState = (record) => {
    const state = effective(record);
    return state === 'active' && record.kind === 'anonymous' ? 'anonymous' : state;
  };
  const view = (record) => Object.freeze({
    sid: record.sid, state: publicState(record), tenant: record.tenant, user: record.user,
    role: record.kind === 'tenant' ? roles.get(record.tenant).get(record.user) : null, expiresAtMs: record.expiresAtMs
  });
  const scopeOf = (record) => (record.kind === 'tenant' ? record.tenant : '');
  const live = (scope) => [...sessions.values()].filter((record) => scopeOf(record) === scope);

  // Makes room for one more record of a scope: an ended record is dropped (its token then reads as unknown). Returns false when
  // every record of the scope is still active and the scope is at its bound.
  function room(scope, activeLimit, recordLimit) {
    const records = live(scope);
    if (records.filter((record) => effective(record) === 'active').length >= activeLimit) return false;
    if (records.length >= recordLimit) {
      const oldest = records.find((record) => effective(record) !== 'active');
      sessions.delete(oldest.key);
      bySid.delete(oldest.sid);
    }
    return true;
  }

  function create(kind, tenant, user, ttlMs) {
    const token = `c022_${randomBytes(32).toString('base64url')}`;
    const record = {
      key: digest(token), sid: `sid_${randomBytes(12).toString('base64url')}`, kind, tenant, user, state: 'active',
      createdAtMs: now(), expiresAtMs: now() + ttlMs, seq: (sequence += 1)
    };
    sessions.set(record.key, record);
    bySid.set(record.sid, record);
    return { token, record };
  }

  function authenticate(token) {
    if (typeof token !== 'string' || !TOKEN_SHAPE.test(token)) return refuse('TOKEN_MALFORMED');
    const record = sessions.get(digest(token));
    if (!record) return refuse('TOKEN_UNKNOWN');
    const state = effective(record);
    if (state !== 'active') return refuse(ENDED[state]);
    return Object.freeze({ ok: true, kind: record.kind, session: view(record) });
  }

  function issueTicket({ user, tenant } = {}, { ttlMs = limits.ticketTtlMs } = {}) {
    if (typeof user !== 'string' || !contract.users.includes(user)) throw Object.assign(new RangeError('Unknown synthetic user'), { code: 'IDENTITY_UNKNOWN' });
    if (typeof tenant !== 'string' || !roles.has(tenant)) throw Object.assign(new RangeError('Unknown synthetic tenant'), { code: 'TENANT_UNKNOWN' });
    if (!Number.isInteger(ttlMs) || ttlMs < 0 || ttlMs > limits.ticketMaxTtlMs) throw Object.assign(new RangeError('Invalid ticket lifetime'), { code: 'TTL_INVALID' });
    for (const [key, entry] of tickets) if (tickets.size >= limits.tickets && (entry.used || now() >= entry.expiresAtMs)) tickets.delete(key);
    if (tickets.size >= limits.tickets) throw Object.assign(new RangeError('Too many outstanding tickets'), { code: 'TICKET_LIMIT' });
    const ticket = `t022_${randomBytes(32).toString('base64url')}`;
    tickets.set(digest(ticket), { user, tenant, expiresAtMs: now() + ttlMs, used: false });
    return ticket;
  }

  function startAnonymous() {
    if (!room('', limits.anonymousSessions, limits.anonymousRecords)) return refuse('ANONYMOUS_QUOTA_FULL');
    const { token, record } = create('anonymous', null, null, limits.anonymousTtlMs);
    return Object.freeze({ ok: true, token, session: view(record) });
  }

  // A login is the ONLY way into a tenant. Presented while anonymous it replaces that session: a new token and a new sid, the old one
  // superseded. The ticket is spent only when the session is created, so a refusal (membership, quota, a dead anonymous token) spends nothing.
  function login(ticket, anonymousToken) {
    let anonymous = null;
    if (anonymousToken !== null) {
      const presented = authenticate(anonymousToken);
      if (!presented.ok) return presented;
      if (presented.kind !== 'anonymous') return refuse('ALREADY_AUTHENTICATED');
      anonymous = sessions.get(digest(anonymousToken));
    }
    const entry = typeof ticket === 'string' && TICKET_SHAPE.test(ticket) ? tickets.get(digest(ticket)) : undefined;
    if (!entry || entry.used || now() >= entry.expiresAtMs) return refuse('TICKET_INVALID');
    if (!roles.get(entry.tenant).has(entry.user)) return refuse('NOT_A_MEMBER');
    if (!room(entry.tenant, limits.sessionsPerTenant, limits.recordsPerTenant)) return refuse('SESSION_QUOTA_FULL');
    entry.used = true;
    if (anonymous) anonymous.state = 'superseded';
    const { token, record } = create('tenant', entry.tenant, entry.user, limits.ttlMs);
    return Object.freeze({ ok: true, token, session: view(record) });
  }

  function logout(token) {
    const presented = authenticate(token);
    if (!presented.ok) return presented;
    const record = sessions.get(digest(token));
    record.state = 'logged_out';
    return Object.freeze({ ok: true, session: Object.freeze({ sid: record.sid, state: 'logged_out' }) });
  }

  // The administrative transitions take the TENANT of the verified admin: another tenant's session or user is "not found", exactly like one that never existed.
  function revokeSession(tenant, sid) {
    const record = bySid.get(sid);
    if (!record || record.kind !== 'tenant' || record.tenant !== tenant) return refuse('RESOURCE_NOT_FOUND');
    if (effective(record) !== 'active') return refuse('SESSION_NOT_ACTIVE');
    record.state = 'revoked';
    return Object.freeze({ ok: true, revoked: 1 });
  }

  function revokeUser(tenant, user) {
    if (!roles.get(tenant).has(user)) return refuse('RESOURCE_NOT_FOUND');
    let revoked = 0;
    for (const record of live(tenant)) {
      if (record.user === user && effective(record) === 'active') {
        record.state = 'revoked';
        revoked += 1;
      }
    }
    return Object.freeze({ ok: true, revoked });
  }

  function setRole(tenant, user, role) {
    const team = roles.get(tenant);
    if (!team.has(user)) return refuse('RESOURCE_NOT_FOUND');
    const current = team.get(user);
    if (current === role) return Object.freeze({ ok: true, changed: false });
    if (current === 'admin' && [...team.values()].filter((value) => value === 'admin').length === 1) return refuse('LAST_ADMIN');
    team.set(user, role);
    return Object.freeze({ ok: true, changed: true });
  }

  const sessionsOf = (tenant) => Object.freeze(live(tenant).sort((first, second) => first.seq - second.seq)
    .map((record) => Object.freeze({ sid: record.sid, user: record.user, state: publicState(record), expiresAtMs: record.expiresAtMs })));

  // Everything that can change, as plain data (the world digest of the tests). The expired state is not in it: only written states are.
  const snapshot = () => ({
    roles: Object.fromEntries([...roles].map(([tenant, team]) => [tenant, Object.fromEntries(team)])),
    tickets: [...tickets].map(([key, entry]) => ({ key, user: entry.user, tenant: entry.tenant, used: entry.used })),
    sessions: [...sessions.values()].sort((first, second) => first.seq - second.seq)
      .map((record) => ({ sid: record.sid, kind: record.kind, tenant: record.tenant, user: record.user, state: record.state, expiresAtMs: record.expiresAtMs }))
  });

  return Object.freeze({ authenticate, issueTicket, startAnonymous, login, logout, revokeSession, revokeUser, setRole, sessionsOf, snapshot });
}

module.exports = Object.freeze({ createIdentity, TOKEN_SHAPE });
