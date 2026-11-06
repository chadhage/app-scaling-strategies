(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    Object.defineProperty(root, 'C022Contract', { value: factory() });
  }
}(globalThis, function () {
  'use strict';

  // C022 fixture contract: three fictional tenants, their users and roles, the permission table, the closed table of typed codes,
  // the limits and the input rules. Synthetic data only; nothing here is a credential. A role list is explicit (roles do not inherit)
  // and an operation that is not listed does not exist (deny by default).
  const ROLES = ['viewer', 'member', 'admin'];
  const MEMBERS = {
    'tenant-alder': { ada: 'admin', alf: 'member', ana: 'viewer', dana: 'member' },
    'tenant-birch': { bea: 'admin', ben: 'member', bo: 'viewer', dana: 'viewer' },
    'tenant-cedar': { cai: 'admin', cy: 'member' }
  };
  const USERS = ['ada', 'alf', 'ana', 'dana', 'bea', 'ben', 'bo', 'cai', 'cy', 'nomad'];
  const SEED_PROJECTS = {
    'tenant-alder': [['alder-orchard', 3, 'ada'], ['alder-river', 5, 'alf'], ['alder-meadow', 2, 'ada']],
    'tenant-birch': [['birch-harbor', 7, 'bea'], ['birch-quarry', 4, 'ben']],
    'tenant-cedar': []
  };
  const PROFILE_IDS = { 'tenant-alder': ['synthetic-001'], 'tenant-birch': ['synthetic-002'], 'tenant-cedar': [] };
  const LIMITS = {
    bodyBytes: 4096, ttlMs: 600000, anonymousTtlMs: 300000, ticketTtlMs: 120000, ticketMaxTtlMs: 600000, tickets: 256,
    sessionsPerTenant: 8, recordsPerTenant: 32, anonymousSessions: 16, anonymousRecords: 32,
    projectsPerTenant: 12, pageDefault: 5, pageMax: 10, auditPerUser: 200, anonymousAudit: 50,
    // Wire bounds of the imported C009 path: idle socket, open sockets, requests running or queued per socket, header and request
    // timeouts and how often Node checks them.
    idleMs: 5000, connections: 256, pipelined: 4, headerMs: 5000, checkMs: 1000
  };
  const ALL = ROLES.slice();
  const OPS = {
    'session.whoami': { method: 'GET', roles: null },
    'session.logout': { method: 'POST', roles: null },
    'session.switch': { method: 'POST', roles: ALL },
    'project.list': { method: 'GET', roles: ALL },
    'project.read': { method: 'GET', roles: ALL },
    'project.create': { method: 'POST', roles: ['member', 'admin'] },
    'project.update': { method: 'PUT', roles: ['member', 'admin'] },
    'project.delete': { method: 'DELETE', roles: ['member', 'admin'] },
    'profile.list': { method: 'GET', roles: ALL },
    'profile.read': { method: 'GET', roles: ALL },
    'admin.sessions': { method: 'GET', roles: ['admin'] },
    'admin.audit': { method: 'GET', roles: ['admin'] },
    'admin.revoke': { method: 'POST', roles: ['admin'] },
    'admin.role': { method: 'POST', roles: ['admin'] }
  };

  // Every typed answer the fixture can give: code -> [HTTP status, fixed message]. Messages never echo client input.
  const CODES = {
    AUTHENTICATION_REQUIRED: [401, 'A bearer token is required.'],
    TOKEN_MALFORMED: [401, 'Present exactly one well-formed bearer token.'],
    TOKEN_UNKNOWN: [401, 'This server did not issue that token.'],
    SESSION_EXPIRED: [401, 'The session has expired.'],
    SESSION_LOGGED_OUT: [401, 'The session was logged out.'],
    SESSION_REVOKED: [401, 'The session was revoked.'],
    SESSION_SUPERSEDED: [401, 'The session was replaced by a login.'],
    LOGIN_REQUIRED: [401, 'This route needs an authenticated session.'],
    TICKET_INVALID: [401, 'The login ticket is not valid.'],
    NOT_A_MEMBER: [403, 'The user is not a member of that tenant.'],
    ALREADY_AUTHENTICATED: [409, 'This session is already authenticated; log out first.'],
    SESSION_QUOTA_FULL: [409, 'The tenant already holds its share of sessions; nothing was changed.'],
    ANONYMOUS_QUOTA_FULL: [409, 'Too many anonymous sessions; nothing was changed.'],
    TENANT_SWITCH_REQUIRES_LOGIN: [403, 'A session never changes tenant; authenticate again for another tenant.'],
    TENANT_CLAIM_REJECTED: [400, 'The tenant comes from the session; a request that names one is refused.'],
    ROLE_FORBIDDEN: [403, 'The server-derived role may not do this.'],
    NOT_FOUND: [404, 'No fixture route has that path.'],
    RESOURCE_NOT_FOUND: [404, 'No such resource in your tenant.'],
    SESSION_NOT_ACTIVE: [409, 'That session is not active; nothing was changed.'],
    LAST_ADMIN: [409, 'A tenant keeps at least one admin; nothing was changed.'],
    TENANT_QUOTA_FULL: [409, 'The tenant already holds its share of resources; nothing was changed.'],
    PRECONDITION_FAILED: [412, 'The If-Match precondition failed; nothing was changed.'],
    CURSOR_INVALID: [400, 'The cursor is not valid for this query.'],
    QUERY_INVALID: [400, 'The query is not one this route accepts.'],
    METHOD_NOT_ALLOWED: [405, 'That method is not supported on this route.'],
    MEDIA_TYPE_UNSUPPORTED: [415, 'The body must be sent as application/json.'],
    BODY_TOO_LARGE: [413, 'The body exceeds the size limit.'],
    BODY_INVALID_JSON: [400, 'The body is not valid JSON.'],
    BODY_NOT_OBJECT: [400, 'The body must be a JSON object.'],
    INPUT_UNKNOWN_FIELD: [400, 'The body has a field this operation does not accept.'],
    INPUT_MISSING_FIELD: [400, 'A required field is missing.'],
    INPUT_INVALID: [400, 'A field is outside its type or bounds.'],
    UNEXPECTED_BODY: [400, 'This route must not receive a body.'],
    URL_TOO_LONG: [414, 'The request URL is too long.'],
    INVALID_URL: [400, 'An explicit local URL without a fragment is required.'],
    LOCAL_HOST_REQUIRED: [421, 'Only the actual 127.0.0.1 listener is supported.'],
    CROSS_ORIGIN_DENIED: [403, 'This synthetic fixture supports only its own loopback origin.'],
    EXPECTATION_FAILED: [417, 'Only the 100-continue expectation is supported.'],
    REQUEST_MALFORMED: [400, 'The request could not be parsed.'],
    HEADERS_TOO_LARGE: [431, 'The request headers are too large.'],
    REQUEST_TIMEOUT: [408, 'The request was not completed in time.'],
    INTERNAL_ERROR: [500, 'The fixture failed closed; nothing was changed.']
  };

  // A name that carries a tenant (or an organisation, an account, a workspace) in any header, query field or body field.
  const CLAIM_NAME = /tenant|organi[sz]ation|workspace|account|orgid|org[-_]id|(^|[^a-z])org([^a-z]|$)/i;
  const isTenantClaimName = (name) => typeof name === 'string' && CLAIM_NAME.test(name);

  const NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;
  const USER = /^[a-z][a-z0-9-]{0,31}$/;
  const isString = (max) => (value) => typeof value === 'string' && value.length <= max;
  const isUnits = (value) => Number.isInteger(value) && value >= 1 && value <= 100;
  const SCHEMAS = {
    'project.create': { name: (value) => typeof value === 'string' && NAME.test(value), units: isUnits },
    'project.update': { name: (value) => typeof value === 'string' && NAME.test(value), units: isUnits },
    'admin.role': { user: (value) => typeof value === 'string' && USER.test(value), role: (value) => ROLES.includes(value) },
    'admin.revoke': { sid: isString(64), user: (value) => typeof value === 'string' && USER.test(value) },
    'session.login': { ticket: isString(256) },
    'session.switch': { tenant: isString(64) }
  };
  // A body that names a tenant is a claim, except where the field IS the operation (a tenant switch asks for one and is refused).
  const OWN_CLAIM = { 'session.switch': 'tenant' };

  function validateInput(op, body) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return { ok: false, code: 'BODY_NOT_OBJECT' };
    const schema = SCHEMAS[op];
    const fields = Object.keys(body);
    for (const field of fields) if (isTenantClaimName(field) && OWN_CLAIM[op] !== field) return { ok: false, code: 'TENANT_CLAIM_REJECTED', field };
    for (const field of fields) if (!Object.hasOwn(schema, field)) return { ok: false, code: 'INPUT_UNKNOWN_FIELD', field };
    if (op === 'admin.revoke') {
      if (fields.length === 2) return { ok: false, code: 'INPUT_UNKNOWN_FIELD', field: 'user' };
      if (fields.length === 0) return { ok: false, code: 'INPUT_MISSING_FIELD', field: 'sid' };
    }
    const value = {};
    for (const field of fields) {
      if (!schema[field](body[field])) return { ok: false, code: 'INPUT_INVALID', field };
      value[field] = body[field];
    }
    if (op !== 'admin.revoke') {
      for (const field of Object.keys(schema)) if (!Object.hasOwn(body, field)) return { ok: false, code: 'INPUT_MISSING_FIELD', field };
    }
    return { ok: true, value };
  }

  // The list query: only limit, cursor and q, each at most once.
  function parseListQuery(params) {
    const seen = new Set();
    const query = { limit: LIMITS.pageDefault, cursor: null, q: '' };
    for (const [key, value] of params) {
      if (seen.has(key) || !['limit', 'cursor', 'q'].includes(key)) return { ok: false, code: 'QUERY_INVALID' };
      seen.add(key);
      if (key === 'limit') {
        const limit = /^[0-9]{1,3}$/.test(value) ? Number(value) : 0;
        if (limit < 1 || limit > LIMITS.pageMax) return { ok: false, code: 'QUERY_INVALID' };
        query.limit = limit;
      } else if (key === 'q') {
        if (!/^[A-Za-z0-9 _-]{1,32}$/.test(value)) return { ok: false, code: 'QUERY_INVALID' };
        query.q = value.toLowerCase();
      } else {
        query.cursor = value;
      }
    }
    return { ok: true, query };
  }

  function deepFreeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  }

  return deepFreeze({
    roles: ROLES, members: MEMBERS, users: USERS, tenants: Object.keys(MEMBERS), seedProjects: SEED_PROJECTS, profileIds: PROFILE_IDS,
    limits: LIMITS, ops: OPS, CODES, isTenantClaimName, validateInput, parseListQuery
  });
}));
