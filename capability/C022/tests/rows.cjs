'use strict';

// Test tooling, not production code: ONE table of every refusal the server can answer (every status, sync and decided after an await,
// and the answers Node gives itself), shared by the close test, the in-process pipelining matrix and the matrix against a server in a
// SEPARATE process. A row builds the bytes of the refused request; prepare() makes the state the rows need (a dead token of every kind,
// a full tenant, a user whose commit fails by injection) on a started app.
const { request } = require('./raw.cjs');

const JSON_TYPE = 'Content-Type: application/json';
const TTL_MS = 10 * 60 * 1000;
const bearer = (token) => `Authorization: Bearer ${token}`;
const post = (port, target, token, body, version = '1.1', more = []) => request(port, 'POST', target, { version, headers: [bearer(token), JSON_TYPE, ...more], body: JSON.stringify(body) });
const get = (port, target, token, version = '1.1', more = []) => request(port, 'GET', target, { version, headers: [...(token ? [bearer(token)] : []), ...more] });

// The hooks the app under test needs: the commit of the user "cy" fails by injection (INTERNAL_ERROR, 500).
const HOOKS = { beforeCommit: (info) => { if (info.user === 'cy') throw new Error('injected failure'); } };

async function prepare(ctx) {
  const t = {};
  t.expired = (await ctx.session('alf')).token;
  ctx.clock.advance(TTL_MS + 1);
  t.ada = (await ctx.session('ada')).token;
  t.alf = (await ctx.session('alf')).token;
  t.alfSid = (await ctx.session('alf')).sid;
  t.ana = (await ctx.session('ana')).token;
  t.cai = (await ctx.session('cai')).token;
  t.cy = (await ctx.session('cy')).token;
  t.dana = (await ctx.session('dana', 'tenant-alder')).token;
  const out = await ctx.session('alf');
  await ctx.call('POST', '/v1/session/logout', { token: out.token });
  t.loggedOut = out.token;
  t.endedSid = out.sid;
  const gone = await ctx.session('alf');
  await ctx.call('POST', '/v1/admin/revoke', { token: t.ada, body: { sid: gone.sid } });
  t.revoked = gone.token;
  const anon = await ctx.call('POST', '/v1/session/anonymous');
  t.anon = anon.json.token;
  const old = await ctx.call('POST', '/v1/session/anonymous');
  await ctx.call('POST', '/v1/session/login', { token: old.json.token, body: { ticket: ctx.app.issueTicket({ user: 'bo', tenant: 'tenant-birch' }) } });
  t.superseded = old.json.token;
  t.nomadTicket = ctx.app.issueTicket({ user: 'nomad', tenant: 'tenant-alder' });
  for (let index = 0; index < 12; index += 1) await ctx.call('POST', '/v1/projects', { token: t.cai, body: { name: `fill-${index}`, units: 1 } });
  return t;
}

const pad = (size) => 'A'.repeat(size);
const ROWS = (t) => [
  { code: 'AUTHENTICATION_REQUIRED', status: 401, build: (p, v) => get(p, '/v1/projects', null, v) },
  { code: 'TOKEN_MALFORMED', status: 401, build: (p, v) => get(p, '/v1/projects', 'x', v) },
  { code: 'TOKEN_UNKNOWN', status: 401, build: (p, v) => get(p, '/v1/projects', `c022_${pad(43)}`, v) },
  { code: 'SESSION_EXPIRED', status: 401, build: (p, v) => get(p, '/v1/projects', t.expired, v) },
  { code: 'SESSION_LOGGED_OUT', status: 401, build: (p, v) => get(p, '/v1/projects', t.loggedOut, v) },
  { code: 'SESSION_REVOKED', status: 401, build: (p, v) => get(p, '/v1/projects', t.revoked, v) },
  { code: 'SESSION_SUPERSEDED', status: 401, build: (p, v) => get(p, '/v1/projects', t.superseded, v) },
  { code: 'LOGIN_REQUIRED', status: 401, build: (p, v) => get(p, '/v1/projects', t.anon, v) },
  { code: 'TICKET_INVALID', status: 401, build: (p, v) => request(p, 'POST', '/v1/session/login', { version: v, headers: [JSON_TYPE], body: JSON.stringify({ ticket: 't022_x' }) }), async: true },
  { code: 'NOT_A_MEMBER', status: 403, build: (p, v) => request(p, 'POST', '/v1/session/login', { version: v, headers: [JSON_TYPE], body: JSON.stringify({ ticket: t.nomadTicket }) }), async: true },
  { code: 'ALREADY_AUTHENTICATED', status: 409, build: (p, v) => post(p, '/v1/session/login', t.alf, { ticket: 't022_x' }, v), async: true },
  { code: 'TENANT_SWITCH_REQUIRES_LOGIN', status: 403, build: (p, v) => post(p, '/v1/session/switch', t.alf, { tenant: 'tenant-birch' }, v), async: true },
  { code: 'TENANT_CLAIM_REJECTED', status: 400, build: (p, v) => get(p, '/v1/projects', t.alf, v, ['X-Tenant: tenant-birch']) },
  { code: 'TENANT_CLAIM_REJECTED', status: 400, name: 'TENANT_CLAIM_REJECTED (body, after an await)', build: (p, v) => post(p, '/v1/projects', t.alf, { name: 'x', units: 1, tenant: 'tenant-birch' }, v), async: true },
  { code: 'ROLE_FORBIDDEN', status: 403, build: (p, v) => post(p, '/v1/projects', t.ana, { name: 'x', units: 1 }, v) },
  { code: 'NOT_FOUND', status: 404, build: (p, v) => get(p, '/v1/nowhere', t.alf, v) },
  { code: 'RESOURCE_NOT_FOUND', status: 404, build: (p, v) => get(p, '/v1/projects/proj-0099', t.alf, v) },
  { code: 'RESOURCE_NOT_FOUND', status: 404, name: 'RESOURCE_NOT_FOUND (PUT, after an await)', build: (p, v) => request(p, 'PUT', '/v1/projects/proj-0099', { version: v, headers: [bearer(t.alf), JSON_TYPE], body: JSON.stringify({ name: 'x', units: 1 }) }), async: true },
  { code: 'SESSION_NOT_ACTIVE', status: 409, build: (p, v) => post(p, '/v1/admin/revoke', t.ada, { sid: t.endedSid }, v), async: true },
  { code: 'LAST_ADMIN', status: 409, build: (p, v) => post(p, '/v1/admin/role', t.ada, { user: 'ada', role: 'viewer' }, v), async: true },
  { code: 'PRECONDITION_FAILED', status: 412, build: (p, v) => request(p, 'PUT', '/v1/projects/proj-0001', { version: v, headers: [bearer(t.alf), JSON_TYPE, 'If-Match: "stale"'], body: JSON.stringify({ name: 'x', units: 1 }) }), async: true },
  { code: 'TENANT_QUOTA_FULL', status: 409, build: (p, v) => post(p, '/v1/projects', t.cai, { name: 'over', units: 1 }, v), async: true },
  { code: 'CURSOR_INVALID', status: 400, build: (p, v) => get(p, '/v1/projects?cursor=garbage', t.alf, v) },
  { code: 'QUERY_INVALID', status: 400, build: (p, v) => get(p, '/v1/projects?sort=name', t.alf, v) },
  { code: 'METHOD_NOT_ALLOWED', status: 405, build: (p, v) => request(p, 'PATCH', '/v1/projects/proj-0001', { version: v, headers: [bearer(t.alf)] }) },
  { code: 'MEDIA_TYPE_UNSUPPORTED', status: 415, build: (p, v) => request(p, 'POST', '/v1/projects', { version: v, headers: [bearer(t.alf), 'Content-Type: text/plain'], body: '{}' }) },
  { code: 'BODY_TOO_LARGE', status: 413, build: (p, v) => post(p, '/v1/projects', t.alf, { name: 'x', units: 1, pad: pad(5000) }, v), async: true },
  { code: 'BODY_INVALID_JSON', status: 400, build: (p, v) => request(p, 'POST', '/v1/projects', { version: v, headers: [bearer(t.alf), JSON_TYPE], body: '{nope' }), async: true },
  { code: 'BODY_NOT_OBJECT', status: 400, build: (p, v) => request(p, 'POST', '/v1/projects', { version: v, headers: [bearer(t.alf), JSON_TYPE], body: '[1]' }), async: true },
  { code: 'INPUT_UNKNOWN_FIELD', status: 400, build: (p, v) => post(p, '/v1/projects', t.alf, { name: 'x', units: 1, owner: 'ada' }, v), async: true },
  { code: 'INPUT_MISSING_FIELD', status: 400, build: (p, v) => post(p, '/v1/projects', t.alf, { name: 'x' }, v), async: true },
  { code: 'INPUT_INVALID', status: 400, build: (p, v) => post(p, '/v1/projects', t.alf, { name: 'X Y', units: 1 }, v), async: true },
  { code: 'UNEXPECTED_BODY', status: 400, build: (p, v) => request(p, 'GET', '/v1/projects', { version: v, headers: [bearer(t.alf)], body: '{}' }) },
  { code: 'URL_TOO_LONG', status: 414, build: (p, v) => get(p, `/v1/projects?q=${pad(2100)}`, t.alf, v) },
  { code: 'INVALID_URL', status: 400, build: (p, v) => get(p, '/v1/projects#fragment', t.alf, v) },
  { code: 'LOCAL_HOST_REQUIRED', status: 421, build: (p, v) => request(p, 'GET', '/v1/projects', { version: v, host: false, headers: ['Host: evil.invalid', bearer(t.alf)] }) },
  { code: 'LOCAL_HOST_REQUIRED', status: 421, name: 'LOCAL_HOST_REQUIRED (no Host at all, Node-own path)', build: (p, v) => request(p, 'GET', '/v1/projects', { version: v, host: false, headers: [bearer(t.alf)] }) },
  { code: 'CROSS_ORIGIN_DENIED', status: 403, build: (p, v) => get(p, '/v1/projects', t.alf, v, ['Origin: http://evil.invalid']) },
  { code: 'EXPECTATION_FAILED', status: 417, only11: true, nodeOwn: true, build: (p, v) => get(p, '/v1/projects', t.alf, v, ['Expect: nonsense']) },
  { code: 'REQUEST_MALFORMED', status: 400, nodeOwn: true, build: (p) => Buffer.from(`GET /v1/projects HTTP/1.1\r\nHost: 127.0.0.1:${p}\r\nBad Header Line\r\n\r\n`) },
  { code: 'HEADERS_TOO_LARGE', status: 431, nodeOwn: true, lossy: true, build: (p, v) => get(p, '/v1/projects', t.alf, v, [`X-Pad: ${pad(20000)}`]) },
  { code: 'METHOD_NOT_ALLOWED', status: 405, name: 'METHOD_NOT_ALLOWED (CONNECT, Node-own)', only11: true, nodeOwn: true, build: (p) => Buffer.from(`CONNECT 127.0.0.1:1 HTTP/1.1\r\nHost: 127.0.0.1:${p}\r\n\r\n`) },
  { code: 'INTERNAL_ERROR', status: 500, build: (p, v) => post(p, '/v1/projects', t.cy, { name: 'boom', units: 1 }, v), async: true }
];

// The valid, authorized mutation that must NEVER run behind a refusal: the admin turns dana (a user no refusal row uses) into a viewer.
// Its second form turns her back.
const MUTATION = (t) => ({
  down: (p, v = '1.1') => post(p, '/v1/admin/role', t.ada, { user: 'dana', role: 'viewer' }, v),
  up: (p, v = '1.1') => post(p, '/v1/admin/role', t.ada, { user: 'dana', role: 'member' }, v)
});
const LEGIT = (t) => (p, v = '1.1') => get(p, '/v1/session', t.alf, v);

module.exports = Object.freeze({ HOOKS, LEGIT, MUTATION, ROWS, TTL_MS, bearer, get, post, prepare });
