'use strict';

// The identity and session lifecycle over REAL sockets: every legal transition, and every illegal one answered with a typed refusal and
// NO effect (the world snapshot is compared; a ticket is issued BEFORE the snapshot, so a refusal that consumed it would show).
// Every test starts its own app: counts and states never depend on a neighbour test.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { startApp } = require('./helpers.cjs');

const TTL_MS = 10 * 60 * 1000;

async function kit(t) {
  const ctx = await startApp();
  t.after(() => ctx.close());
  return {
    ctx,
    ticket: (user, tenant) => ctx.app.issueTicket({ user, tenant }),
    login: (body, token) => ctx.call('POST', '/v1/session/login', { token, body }),
    anonymous: async () => {
      const res = await ctx.call('POST', '/v1/session/anonymous');
      assert.equal(res.status, 201);
      return { token: res.json.token, sid: res.json.session.sid, res };
    }
  };
}

test('anonymous to authenticated: the session id AND the token change at login, and the anonymous token is dead (no fixation)', async (t) => {
  const { ctx, ticket, login, anonymous } = await kit(t);
  const anon = await anonymous();
  assert.equal(anon.res.json.session.state, 'anonymous');
  assert.match(anon.token, /^c022_[A-Za-z0-9_-]{43}$/);
  const me = await ctx.call('GET', '/v1/session', { token: anon.token });
  assert.equal(me.status, 200);
  assert.deepEqual({ tenant: me.json.session.tenant, user: me.json.session.user, role: me.json.session.role, state: me.json.session.state }, { tenant: null, user: null, role: null, state: 'anonymous' });
  assert.equal((await ctx.call('GET', '/v1/projects', { token: anon.token })).json.outcome, 'LOGIN_REQUIRED');
  const done = await login({ ticket: ticket('ada', 'tenant-alder') }, anon.token);
  assert.equal(done.status, 201);
  assert.notEqual(done.json.token, anon.token, 'the token changed');
  assert.notEqual(done.json.session.sid, anon.sid, 'the session id changed');
  assert.equal(done.json.session.state, 'active');
  const dead = await ctx.call('GET', '/v1/session', { token: anon.token });
  assert.equal(dead.status, 401);
  assert.equal(dead.json.outcome, 'SESSION_SUPERSEDED');
  assert.equal((await ctx.call('GET', '/v1/projects', { token: anon.token })).json.outcome, 'SESSION_SUPERSEDED');
  assert.equal((await ctx.call('GET', '/v1/projects', { token: done.json.token })).status, 200);
  assert.equal((await login({ ticket: ticket('alf', 'tenant-alder') }, anon.token)).json.outcome, 'SESSION_SUPERSEDED', 'a superseded id cannot be fixated onto a second login');
});

test('a client can neither choose nor adopt a session id: a body naming one is refused, a header or cookie is not an identity channel, a refusal consumes nothing', async (t) => {
  const { ctx, ticket, login, anonymous } = await kit(t);
  const anon = await anonymous();
  const ticketBea = ticket('bea', 'tenant-birch');
  const world = ctx.world();
  for (const extra of [{ sid: anon.sid }, { token: anon.token }, { sessionId: 'x' }, { session: anon.sid }]) {
    const res = await login({ ticket: ticketBea, ...extra }, anon.token);
    assert.equal(res.status, 400, JSON.stringify(Object.keys(extra)));
    assert.equal(res.json.outcome, 'INPUT_UNKNOWN_FIELD');
  }
  assert.equal(ctx.world(), world, 'no session was created and the ticket is unspent');
  const viaHeader = await ctx.call('POST', '/v1/session/login', { token: anon.token, headers: { 'X-Session-Id': anon.sid, Cookie: `sid=${anon.sid}` }, body: { ticket: ticketBea } });
  assert.equal(viaHeader.status, 201);
  assert.notEqual(viaHeader.json.session.sid, anon.sid);
});

test('a login ticket is ONE-TIME: replay, expiry, an unknown or malformed ticket and a session token as a ticket are all TICKET_INVALID', async (t) => {
  const { ctx, ticket, login } = await kit(t);
  const spent = ticket('alf', 'tenant-alder');
  assert.equal((await login({ ticket: spent })).status, 201);
  const old = ticket('ana', 'tenant-alder');
  const session = await ctx.session('ada');
  ctx.clock.advance(121000);
  const fresh = ticket('ana', 'tenant-alder');
  const before = ctx.world();
  for (const candidate of [spent, old, 't022_short', `t022_${'A'.repeat(43)}`, session.token, '', 'x'.repeat(200)]) {
    const res = await login({ ticket: candidate });
    assert.equal(res.status, 401, candidate.slice(0, 12));
    assert.equal(res.json.outcome, 'TICKET_INVALID');
  }
  assert.equal(ctx.world(), before, 'every refused ticket changed nothing');
  assert.equal((await login({ ticket: fresh })).status, 201, 'a ticket inside its lifetime still works');
  assert.equal((await login({})).json.outcome, 'INPUT_MISSING_FIELD');
  assert.equal((await login({ ticket: 5 })).json.outcome, 'INPUT_INVALID');
  assert.equal((await login({ ticket: 'x'.repeat(300) })).json.outcome, 'INPUT_INVALID');
});

test('an authenticated session cannot log in again (that would be a tenant switch without logging out): 409 and the ticket stays unspent', async (t) => {
  const { ctx, ticket, login } = await kit(t);
  const { token } = await ctx.session('dana', 'tenant-alder');
  const birchTicket = ticket('dana', 'tenant-birch');
  const world = ctx.world();
  const res = await login({ ticket: birchTicket }, token);
  assert.equal(res.status, 409);
  assert.equal(res.json.outcome, 'ALREADY_AUTHENTICATED');
  assert.equal(ctx.world(), world);
  assert.equal((await login({ ticket: birchTicket })).status, 201, 'without the old token the same ticket logs in');
});

test('logout ends the session for good: the dead token is refused everywhere, a second logout too, and a new login is a new session', async (t) => {
  const { ctx } = await kit(t);
  const first = await ctx.session('alf', 'tenant-alder');
  const out = await ctx.call('POST', '/v1/session/logout', { token: first.token });
  assert.equal(out.status, 200);
  assert.deepEqual(out.json, { outcome: 'ok', session: { sid: first.sid, state: 'logged_out' } });
  const world = ctx.world();
  for (const [method, target] of [['GET', '/v1/session'], ['GET', '/v1/projects'], ['POST', '/v1/session/logout'], ['GET', '/v1/admin/sessions']]) {
    const res = await ctx.call(method, target, { token: first.token });
    assert.equal(res.status, 401, `${method} ${target}`);
    assert.equal(res.json.outcome, 'SESSION_LOGGED_OUT');
  }
  assert.equal((await ctx.call('POST', '/v1/projects', { token: first.token, body: { name: 'replay', units: 1 } })).json.outcome, 'SESSION_LOGGED_OUT');
  assert.equal(ctx.world(), world);
  const again = await ctx.session('alf', 'tenant-alder');
  assert.notEqual(again.sid, first.sid);
  assert.notEqual(again.token, first.token);
});

test('an admin revokes by session id or by user: the token is refused at once; revoking what already ended is a refusal', async (t) => {
  const { ctx, anonymous } = await kit(t);
  const ada = await ctx.session('ada', 'tenant-alder');
  const one = await ctx.session('alf', 'tenant-alder');
  const two = await ctx.session('alf', 'tenant-alder');
  assert.deepEqual((await ctx.call('POST', '/v1/admin/revoke', { token: ada.token, body: { sid: one.sid } })).json, { outcome: 'ok', revoked: 1 });
  assert.equal((await ctx.call('GET', '/v1/projects', { token: one.token })).json.outcome, 'SESSION_REVOKED');
  assert.equal((await ctx.call('GET', '/v1/projects', { token: two.token })).status, 200, 'only the named session ended');
  const world = ctx.world();
  const again = await ctx.call('POST', '/v1/admin/revoke', { token: ada.token, body: { sid: one.sid } });
  assert.equal(again.status, 409);
  assert.equal(again.json.outcome, 'SESSION_NOT_ACTIVE');
  assert.equal(ctx.world(), world);
  const anon = await anonymous();
  const world2 = ctx.world();
  assert.equal((await ctx.call('POST', '/v1/admin/revoke', { token: ada.token, body: { sid: anon.sid } })).status, 404, 'an anonymous session belongs to no tenant');
  assert.equal(ctx.world(), world2);
  assert.deepEqual((await ctx.call('POST', '/v1/admin/revoke', { token: ada.token, body: { user: 'alf' } })).json, { outcome: 'ok', revoked: 1 });
  assert.equal((await ctx.call('GET', '/v1/session', { token: two.token })).json.outcome, 'SESSION_REVOKED');
  assert.deepEqual((await ctx.call('POST', '/v1/admin/revoke', { token: ada.token, body: { user: 'alf' } })).json, { outcome: 'ok', revoked: 0 });
  assert.equal((await ctx.call('POST', '/v1/admin/revoke', { token: ada.token, body: { sid: one.sid, user: 'alf' } })).json.outcome, 'INPUT_UNKNOWN_FIELD');
  assert.equal((await ctx.call('POST', '/v1/admin/revoke', { token: ada.token, body: {} })).json.outcome, 'INPUT_MISSING_FIELD');
});

test('a session expires by the injected clock and never revives; the state an admin sees is derived, not written by a refused request', async (t) => {
  const { ctx } = await kit(t);
  const ada = await ctx.session('ada', 'tenant-alder');
  const ana = await ctx.session('ana', 'tenant-alder');
  ctx.clock.advance(TTL_MS - 1);
  assert.equal((await ctx.call('GET', '/v1/session', { token: ana.token })).status, 200, 'one millisecond before the end');
  ctx.clock.advance(1);
  assert.equal((await ctx.call('GET', '/v1/session', { token: ada.token })).json.outcome, 'SESSION_EXPIRED');
  const world = ctx.world();
  for (const [method, target] of [['GET', '/v1/projects'], ['POST', '/v1/session/logout'], ['GET', '/v1/session']]) {
    const res = await ctx.call(method, target, { token: ana.token });
    assert.equal(res.status, 401);
    assert.equal(res.json.outcome, 'SESSION_EXPIRED');
  }
  assert.equal(ctx.world(), world, 'refusals of an expired token write nothing');
  const fresh = await ctx.session('ada', 'tenant-alder');
  const listed = await ctx.call('GET', '/v1/admin/sessions', { token: fresh.token });
  assert.ok(listed.json.sessions.some((entry) => entry.sid === ana.sid && entry.state === 'expired'));
  assert.ok(listed.json.sessions.some((entry) => entry.sid === fresh.sid && entry.state === 'active'));
});

test('tenant switch needs a fresh authentication: a request, a claim, or the old token never moves a session; a new login is a separate session', async (t) => {
  const { ctx, anonymous } = await kit(t);
  const alder = await ctx.session('dana', 'tenant-alder');
  const world = ctx.world();
  for (const tenant of ['tenant-birch', 'tenant-alder', 'tenant-nowhere']) {
    const res = await ctx.call('POST', '/v1/session/switch', { token: alder.token, body: { tenant } });
    assert.equal(res.status, 403, tenant);
    assert.equal(res.json.outcome, 'TENANT_SWITCH_REQUIRES_LOGIN');
  }
  assert.equal((await ctx.call('POST', '/v1/session/switch', { token: alder.token, body: {} })).json.outcome, 'INPUT_MISSING_FIELD');
  assert.equal((await ctx.call('GET', '/v1/projects', { token: alder.token, headers: { 'X-Tenant': 'tenant-birch' } })).json.outcome, 'TENANT_CLAIM_REJECTED');
  assert.equal(ctx.world(), world);
  assert.equal((await ctx.call('GET', '/v1/projects/proj-0002', { token: alder.token })).json.project.name, 'alder-river', 'the alder token reads the ALDER proj-0002, never the birch one');
  const anon = await anonymous();
  assert.equal((await ctx.call('POST', '/v1/session/switch', { token: anon.token, body: { tenant: 'tenant-birch' } })).json.outcome, 'LOGIN_REQUIRED');
  const birch = await ctx.session('dana', 'tenant-birch');
  assert.notEqual(birch.sid, alder.sid);
  assert.equal((await ctx.call('GET', '/v1/session', { token: birch.token })).json.session.tenant, 'tenant-birch');
  assert.equal((await ctx.call('GET', '/v1/session', { token: alder.token })).json.session.tenant, 'tenant-alder', 'the alder session is untouched');
  assert.equal((await ctx.call('GET', '/v1/projects/proj-0002', { token: birch.token })).json.project.name, 'birch-quarry');
});

test('every illegal transition is a typed refusal with NO effect on the world', async (t) => {
  const { ctx, ticket, login, anonymous } = await kit(t);
  const ada = await ctx.session('ada', 'tenant-alder');
  const ana = await ctx.session('ana', 'tenant-alder');
  const out = await ctx.session('alf', 'tenant-alder');
  await ctx.call('POST', '/v1/session/logout', { token: out.token });
  const nomad = ticket('nomad', 'tenant-alder');
  const used = ticket('bo', 'tenant-birch');
  await login({ ticket: used });
  const anon = await anonymous();
  const forged = `c022_${'Z'.repeat(43)}`;
  const rows = [
    ['replayed ticket', () => login({ ticket: used }), 401, 'TICKET_INVALID'],
    ['nomad redeems a ticket', () => login({ ticket: nomad }), 403, 'NOT_A_MEMBER'],
    ['active token at login', () => login({ ticket: 't022_x' }, ada.token), 409, 'ALREADY_AUTHENTICATED'],
    ['dead token logout', () => ctx.call('POST', '/v1/session/logout', { token: out.token }), 401, 'SESSION_LOGGED_OUT'],
    ['forged token', () => ctx.call('GET', '/v1/session', { token: forged }), 401, 'TOKEN_UNKNOWN'],
    ['anonymous on a tenant route', () => ctx.call('GET', '/v1/profiles', { token: anon.token }), 401, 'LOGIN_REQUIRED'],
    ['switch', () => ctx.call('POST', '/v1/session/switch', { token: ada.token, body: { tenant: 'tenant-birch' } }), 403, 'TENANT_SWITCH_REQUIRES_LOGIN'],
    ['revoke an ended session', () => ctx.call('POST', '/v1/admin/revoke', { token: ada.token, body: { sid: out.sid } }), 409, 'SESSION_NOT_ACTIVE'],
    ['demote the last admin', () => ctx.call('POST', '/v1/admin/role', { token: ada.token, body: { user: 'ada', role: 'viewer' } }), 409, 'LAST_ADMIN'],
    ['viewer mutation', () => ctx.call('POST', '/v1/projects', { token: ana.token, body: { name: 'x', units: 1 } }), 403, 'ROLE_FORBIDDEN'],
    ['viewer on an admin route', () => ctx.call('GET', '/v1/admin/audit', { token: ana.token }), 403, 'ROLE_FORBIDDEN'],
    ['anonymous creates nothing', () => ctx.call('POST', '/v1/projects', { token: anon.token, body: { name: 'x', units: 1 } }), 401, 'LOGIN_REQUIRED'],
    ['no credential', () => ctx.call('POST', '/v1/projects', { body: { name: 'x', units: 1 } }), 401, 'AUTHENTICATION_REQUIRED']
  ];
  for (const [name, attempt, status, code] of rows) {
    const world = ctx.world();
    const res = await attempt();
    assert.equal(res.status, status, name);
    assert.equal(res.json.outcome, code, name);
    assert.equal(res.json.error.code, code, name);
    assert.equal(ctx.world(), world, `${name}: no effect`);
  }
});
