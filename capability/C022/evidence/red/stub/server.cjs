'use strict';

// RETAINED NAIVE STUB for the RED replay (never production code, never imported by the real fixture). It is the implementation the card
// text warns about: a plain node:http server with the SAME harness API as the real one (createApp, issueTicket, snapshot, hooks) and
// every classic multi-tenant mistake: the tenant of a request is a client claim when one is sent, resources live in ONE global table with
// global ids, ETags are content hashes shared by every tenant, a login keeps the anonymous session id (fixation), a logout and a revoke
// end nothing, the role is cached at login (stale privilege), a tenant switch is one request, a ticket can be replayed, an error echoes the
// id, unknown body fields are accepted (mass assignment), one global audit trail and one global quota, and no refusal closes anything.
const crypto = require('node:crypto');
const http = require('node:http');

const MEMBERS = {
  'tenant-alder': { ada: 'admin', alf: 'member', ana: 'viewer', dana: 'member' },
  'tenant-birch': { bea: 'admin', ben: 'member', bo: 'viewer', dana: 'viewer' },
  'tenant-cedar': { cai: 'admin', cy: 'member' }
};
const SEED = [['tenant-alder', 'alder-orchard', 3, 'ada'], ['tenant-alder', 'alder-river', 5, 'alf'], ['tenant-alder', 'alder-meadow', 2, 'ada'], ['tenant-birch', 'birch-harbor', 7, 'bea'], ['tenant-birch', 'birch-quarry', 4, 'ben']];
const PROFILES = { 'synthetic-001': 'Avery Example', 'synthetic-002': 'Jordan Sample' };

function createApp(options = {}) {
  const now = options.now || Date.now;
  const randomBytes = options.randomBytes || crypto.randomBytes;
  const hooks = options.hooks || {};
  const members = structuredClone(MEMBERS);
  const projects = SEED.map(([tenant, name, units, owner], index) => ({ id: `proj-${String(index + 1).padStart(4, '0')}`, tenant, name, units, owner, version: 1 }));
  const tickets = new Map();
  const sessions = new Map();
  const audit = [];
  const token = (prefix) => `${prefix}_${randomBytes(32).toString('base64url')}`;
  const etag = (project) => `"${crypto.createHash('sha256').update(`${project.name}|${project.units}|${project.version}`).digest('base64url').slice(0, 22)}"`;
  const reply = (response, status, body, headers = {}) => {
    const text = JSON.stringify(body);
    response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text), ...headers });
    response.end(text);
  };
  const fail = (response, status, code, message = code) => reply(response, status, { outcome: code, error: { code, message } });
  const view = (session) => ({ sid: session.sid, state: session.state, tenant: session.tenant, user: session.user, role: session.role, expiresAtMs: session.expiresAtMs });

  async function body(request) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString('utf8');
    if (text === '') return {};
    try { return JSON.parse(text); } catch { return {}; }
  }

  async function handle(request, response) {
    const url = new URL(request.url, 'http://127.0.0.1');
    const key = `${request.method} ${url.pathname}`;
    const header = request.headers.authorization;
    const session = header ? sessions.get(header.replace(/^bearer /i, '')) : null;
    if (key === 'GET /scope.json') return reply(response, 200, { cardId: 'C022', businessData: 'synthetic', entraIntegrated: false, identityRegistered: false, productionRuntimeValidated: false, nativeTargetQualified: false, liveAzureRuns: 0, authorizedCloudSpend: 0 });
    if (key === 'POST /v1/session/anonymous') {
      const value = token('c022');
      const created = { sid: `sid_${randomBytes(9).toString('base64url')}`, state: 'anonymous', tenant: null, user: null, role: null, expiresAtMs: now() + 600000 };
      sessions.set(value, created);
      return reply(response, 201, { outcome: 'ok', session: view(created), token: value });
    }
    if (key === 'POST /v1/session/login') {
      const input = await body(request);
      const ticket = tickets.get(input && input.ticket);
      if (!ticket) return fail(response, 401, 'TICKET_INVALID');
      const role = members[ticket.tenant] && members[ticket.tenant][ticket.user];
      if (!role) return fail(response, 403, 'NOT_A_MEMBER');
      if (session && session.state === 'anonymous') {
        Object.assign(session, { state: 'active', tenant: ticket.tenant, user: ticket.user, role });
        return reply(response, 201, { outcome: 'ok', session: view(session), token: header.replace(/^bearer /i, '') });
      }
      const value = token('c022');
      const created = { sid: `sid_${randomBytes(9).toString('base64url')}`, state: 'active', tenant: ticket.tenant, user: ticket.user, role, expiresAtMs: now() + 600000 };
      sessions.set(value, created);
      return reply(response, 201, { outcome: 'ok', session: view(created), token: value });
    }
    if (!header) return fail(response, 401, 'AUTHENTICATION_REQUIRED');
    if (!session) return fail(response, 401, 'TOKEN_UNKNOWN');
    const tenant = request.headers['x-tenant'] || url.searchParams.get('tenant') || session.tenant;
    if (key === 'GET /v1/session') return reply(response, 200, { outcome: 'ok', session: view(session) });
    if (key === 'POST /v1/session/logout') return reply(response, 200, { outcome: 'ok', session: { sid: session.sid, state: 'logged_out' } });
    if (key === 'POST /v1/session/switch') {
      const input = await body(request);
      session.tenant = input.tenant;
      return reply(response, 200, { outcome: 'ok' });
    }
    if (key === 'GET /v1/projects') {
      const q = url.searchParams.get('q');
      const items = projects.filter((p) => !q || p.name.includes(q));
      return reply(response, 200, { outcome: 'ok', items, count: items.length, nextCursor: null });
    }
    const one = /^\/v1\/projects\/([^/]+)$/.exec(url.pathname);
    if (one) {
      const project = projects.find((p) => p.id === one[1]);
      if (!project) return fail(response, 404, 'RESOURCE_NOT_FOUND', `no such project ${one[1]}`);
      if (request.method === 'GET') {
        if (request.headers['if-none-match'] === etag(project)) {
          response.writeHead(304);
          return response.end();
        }
        return reply(response, 200, { outcome: 'ok', project }, { ETag: etag(project) });
      }
      const input = await body(request);
      if (request.method === 'PUT') {
        Object.assign(project, input, { version: project.version + 1 });
        return reply(response, 200, { outcome: 'ok', project }, { ETag: etag(project) });
      }
      if (request.method === 'DELETE') {
        projects.splice(projects.indexOf(project), 1);
        return reply(response, 200, { outcome: 'ok', deleted: project.id });
      }
    }
    if (key === 'POST /v1/projects') {
      await hooks.afterAuthorize?.({ op: 'project.create', user: session.user, tenant });
      const input = await body(request);
      await hooks.beforeCommit?.({ op: 'project.create', user: session.user, tenant });
      if (projects.length >= 12) return fail(response, 409, 'TENANT_QUOTA_FULL');
      const project = { id: `proj-${String(projects.length + 1).padStart(4, '0')}`, tenant, owner: session.user, version: 1, ...input };
      projects.push(project);
      return reply(response, 201, { outcome: 'ok', project }, { ETag: etag(project) });
    }
    if (key === 'GET /v1/profiles') return reply(response, 200, { outcome: 'ok', profiles: Object.keys(PROFILES).map((id) => ({ profile: { id } })), count: 2 });
    const profile = /^\/v1\/profiles\/([^/]+)$/.exec(url.pathname);
    if (profile) {
      if (!PROFILES[profile[1]]) return fail(response, 404, 'RESOURCE_NOT_FOUND', `no such profile ${profile[1]}`);
      return reply(response, 200, { outcome: 'ok', profile: { apiContract: 'getProfile/1', profile: { displayName: PROFILES[profile[1]] }, stamp: { implementation: 'v2' } } });
    }
    if (key === 'GET /v1/admin/sessions') return reply(response, 200, { outcome: 'ok', sessions: [...sessions.values()].map(view), count: sessions.size });
    if (key === 'GET /v1/admin/audit') return reply(response, 200, { outcome: 'ok', entries: audit, count: audit.length });
    if (key === 'POST /v1/admin/revoke') {
      await body(request);
      return reply(response, 200, { outcome: 'ok', revoked: 1 });
    }
    if (key === 'POST /v1/admin/role') {
      const input = await body(request);
      const home = Object.keys(members).find((name) => members[name][input.user]);
      if (home) members[home][input.user] = input.role;
      return reply(response, 200, { outcome: 'ok', user: input.user, role: input.role, changed: true });
    }
    return fail(response, 404, 'NOT_FOUND');
  }

  const server = http.createServer((request, response) => { handle(request, response).catch(() => fail(response, 500, 'INTERNAL_ERROR')); });
  return {
    server,
    close: () => new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }),
    issueTicket({ user, tenant }) {
      const value = token('t022');
      tickets.set(value, { user, tenant });
      return value;
    },
    snapshot: () => ({ world: { members, projects, sessions: [...sessions.values()], tickets: [...tickets.keys()] }, audit }),
    health: () => ({ ok: true, reason: null })
  };
}

module.exports = Object.freeze({ createApp });
