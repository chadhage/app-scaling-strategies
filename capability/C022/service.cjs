'use strict';

// The decision and the effect of every operation, with no HTTP in it. authorize() is the decision (who is it, may this role do this);
// execute() REPEATS that decision and then runs the effect in the same synchronous step, so nothing can happen between the last check and
// the write: this is "the decision is repeated where the effect is committed". The tenant of an operation is the tenant of the VERIFIED
// session and nothing else: no argument of any operation names a tenant. Every refusal after authentication is recorded in the audit trail
// of the caller's own tenant, every refusal before it in the anonymous ring, and never in another tenant's trail.
const contract = require('./contract.js');
const { getProfileV2 } = require('../C020/profiles.cjs');

const ok = (status, body, headers = {}) => ({ ok: true, status, body, headers });
const fail = (code, extra = {}) => ({ ok: false, code, extra });
const matches = (header, etag) => header.split(',').map((part) => part.trim().replace(/^W\//, '')).some((part) => part === '*' || part === etag);

function createService({ identity, store }) {
  const record = (principal, op, outcome, code) => {
    const entry = { outcome, code, op };
    if (principal && principal.kind === 'tenant') store.scope(principal.session.tenant).record(principal.session.user, entry);
    else store.recordAnonymous(entry);
  };
  const refusal = (principal, op, code, extra) => {
    record(principal, op, code === 'ROLE_FORBIDDEN' ? 'denied' : 'rejected', code);
    return fail(code, extra);
  };

  // Decision: authentication (a presented credential is always verified), tenant routes need a tenant session, then the role table.
  function authorize(token, op) {
    if (token === null) return refusal(null, op, 'AUTHENTICATION_REQUIRED');
    const principal = identity.authenticate(token);
    if (!principal.ok) return refusal(null, op, principal.code);
    const { roles } = contract.ops[op];
    if (roles === null) return principal;
    if (principal.kind === 'anonymous') return refusal(null, op, 'LOGIN_REQUIRED');
    if (!roles.includes(principal.session.role)) return refusal(principal, op, 'ROLE_FORBIDDEN', { role: principal.session.role, requiredRoles: roles });
    return principal;
  }

  const handlers = {
    'session.whoami': ({ principal }) => ok(200, { session: principal.session }),
    'session.logout': ({ token }) => ok(200, { session: identity.logout(token).session }),
    'session.switch': () => fail('TENANT_SWITCH_REQUIRES_LOGIN'),
    'project.list': ({ scope, input }) => {
      const { limit, cursor, q } = input.query;
      const after = cursor === null ? null : scope.readCursor(q, cursor);
      if (cursor !== null && after === null) return fail('CURSOR_INVALID');
      const page = scope.list({ limit, after, q });
      return ok(200, { items: page.items, count: page.count, nextCursor: page.next === null ? null : scope.mintCursor(q, page.next) });
    },
    'project.read': ({ scope, input }) => {
      const project = scope.get(input.id);
      if (!project) return fail('RESOURCE_NOT_FOUND');
      const etag = scope.etag(project);
      if (input.ifNoneMatch !== null && matches(input.ifNoneMatch, etag)) return ok(304, null, { ETag: etag });
      return ok(200, { project }, { ETag: etag });
    },
    'project.create': ({ scope, principal, input }) => {
      const project = scope.create(input.value, principal.session.user);
      return project ? ok(201, { project }, { ETag: scope.etag(project) }) : fail('TENANT_QUOTA_FULL');
    },
    'project.update': ({ scope, input }) => {
      const current = scope.get(input.id);
      if (!current) return fail('RESOURCE_NOT_FOUND');
      if (input.ifMatch !== null && !matches(input.ifMatch, scope.etag(current))) return fail('PRECONDITION_FAILED');
      const project = scope.update(input.id, input.value);
      return ok(200, { project }, { ETag: scope.etag(project) });
    },
    'project.delete': ({ scope, input }) => {
      const current = scope.get(input.id);
      if (!current) return fail('RESOURCE_NOT_FOUND');
      if (input.ifMatch !== null && !matches(input.ifMatch, scope.etag(current))) return fail('PRECONDITION_FAILED');
      scope.remove(input.id);
      return ok(200, { deleted: input.id });
    },
    'profile.list': ({ scope }) => {
      const profiles = scope.profiles().map((profileId) => getProfileV2({ profileId }));
      return ok(200, { profiles, count: profiles.length });
    },
    'profile.read': ({ scope, input }) => (scope.hasProfile(input.id) ? ok(200, { profile: getProfileV2({ profileId: input.id }) }) : fail('RESOURCE_NOT_FOUND')),
    'admin.sessions': ({ principal }) => {
      const sessions = identity.sessionsOf(principal.session.tenant);
      return ok(200, { sessions, count: sessions.length });
    },
    'admin.audit': ({ scope }) => {
      const entries = scope.auditLog();
      return ok(200, { entries, count: entries.length });
    },
    'admin.revoke': ({ principal, input }) => {
      const { tenant } = principal.session;
      const result = Object.hasOwn(input.value, 'sid') ? identity.revokeSession(tenant, input.value.sid) : identity.revokeUser(tenant, input.value.user);
      return result.ok ? ok(200, { revoked: result.revoked }) : fail(result.code);
    },
    'admin.role': ({ principal, input }) => {
      const result = identity.setRole(principal.session.tenant, input.value.user, input.value.role);
      return result.ok ? ok(200, { user: input.value.user, role: input.value.role, changed: result.changed }) : fail(result.code);
    }
  };

  // The operations without a session: a new anonymous session, and the login (which may replace an anonymous one).
  function start() {
    const result = identity.startAnonymous();
    if (!result.ok) return refusal(null, 'session.anonymous', result.code);
    store.recordAnonymous({ outcome: 'applied', code: 'ok', op: 'session.anonymous' });
    return ok(201, { session: result.session, token: result.token });
  }

  function login(token, ticket) {
    const result = identity.login(ticket, token);
    if (!result.ok) return refusal(null, 'session.login', result.code);
    store.scope(result.session.tenant).record(result.session.user, { outcome: 'applied', code: 'ok', op: 'session.login' });
    return ok(201, { session: result.session, token: result.token });
  }

  function execute(token, op, input) {
    const principal = authorize(token, op);
    if (!principal.ok) return principal;
    const scope = principal.kind === 'tenant' ? store.scope(principal.session.tenant) : null;
    const result = handlers[op]({ principal, scope, token, input });
    if (!result.ok) return refusal(principal, op, result.code, result.extra);
    if (contract.ops[op].method !== 'GET') record(principal, op, 'applied', 'ok');
    return result;
  }

  return Object.freeze({ authorize, execute, login, reject: (principal, op, code, extra) => refusal(principal, op, code, extra), start });
}

module.exports = Object.freeze({ createService });
