'use strict';

// Property test: a seeded random sequence over {login (fresh, replayed or forged ticket, with or without an anonymous or an active token),
// anonymous start, logout, revoke by session id or by user, expire (the clock), role change, tenant switch attempt, create, read, list,
// update, delete, profile reads, admin reads, replay of ANY stale token} as every user of every tenant. After EVERY operation:
//   1. the answer is exactly what the independent model (model.cjs) says: ok or the typed code, and the data;
//   2. a refused operation changed nothing (the world digest is identical);
//   3. an effect stayed inside the tenant of the session (every other tenant's memberships, projects and sessions are identical);
//   4. nothing a tenant reads names another tenant (every resource carries its tenant in its name, independent of the model).
// The same sequences run against the service in this process (direct) and against the real HTTP server over sockets.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const contract = require('../contract.js');
const { createCore } = require('../server.cjs');
const { createModel } = require('./model.cjs');
const { call, manualClock, seededBytes, startApp } = require('./helpers.cjs');

const SHORT = { 'tenant-alder': 'alder', 'tenant-birch': 'birch', 'tenant-cedar': 'cedar' };
const RAISED = { sessionsPerTenant: 100000, recordsPerTenant: 200000, projectsPerTenant: 100000, anonymousSessions: 100000, anonymousRecords: 200000, tickets: 100000 };

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INPUT = (op) => {
  switch (op.kind) {
    case 'project.list': return { query: { limit: 10, cursor: null, q: op.q } };
    case 'project.read': return { id: op.id, ifNoneMatch: null };
    case 'project.create': return { value: { name: op.name, units: op.units } };
    case 'project.update': return { id: op.id, ifMatch: null, value: { name: op.name, units: op.units } };
    case 'project.delete': return { id: op.id, ifMatch: null };
    case 'profile.read': return { id: op.id };
    case 'admin.role': return { value: { user: op.user, role: op.role } };
    case 'admin.revoke': return { value: op.sid !== undefined ? { sid: op.sid } : { user: op.user } };
    case 'session.switch': return { value: { tenant: op.tenant } };
    default: return {};
  }
};

function directExecutor(clock) {
  const core = createCore({ now: clock.now, randomBytes: seededBytes('prop'), limits: RAISED });
  const norm = (r) => ({ ok: r.ok, code: r.ok ? 'ok' : r.code, body: r.ok ? r.body : null });
  return {
    issue: (user, tenant) => core.identity.issueTicket({ user, tenant }),
    run: async (op) => {
      if (op.kind === 'anonymous') return norm(core.service.start());
      if (op.kind === 'login') return norm(core.service.login(op.token, op.ticket));
      return norm(core.service.execute(op.token, op.kind, INPUT(op)));
    },
    world: () => ({ identity: core.identity.snapshot(), resources: core.store.snapshot().tenants }),
    close: async () => {}
  };
}

async function httpExecutor(clock) {
  const ctx = await startApp({ clock, app: { limits: RAISED } });
  const ROUTE = {
    'project.list': (op) => ['GET', `/v1/projects?limit=10${op.q ? `&q=${op.q}` : ''}`], 'project.read': (op) => ['GET', `/v1/projects/${op.id}`],
    'project.create': () => ['POST', '/v1/projects', (op) => ({ name: op.name, units: op.units })], 'project.update': (op) => ['PUT', `/v1/projects/${op.id}`, (o) => ({ name: o.name, units: o.units })],
    'project.delete': (op) => ['DELETE', `/v1/projects/${op.id}`], 'profile.read': (op) => ['GET', `/v1/profiles/${op.id}`], 'profile.list': () => ['GET', '/v1/profiles'],
    'admin.role': () => ['POST', '/v1/admin/role', (op) => ({ user: op.user, role: op.role })], 'admin.revoke': () => ['POST', '/v1/admin/revoke', (op) => (op.sid !== undefined ? { sid: op.sid } : { user: op.user })],
    'admin.sessions': () => ['GET', '/v1/admin/sessions'], 'admin.audit': () => ['GET', '/v1/admin/audit'], 'session.whoami': () => ['GET', '/v1/session'],
    'session.logout': () => ['POST', '/v1/session/logout'], 'session.switch': () => ['POST', '/v1/session/switch', (op) => ({ tenant: op.tenant })]
  };
  return {
    issue: (user, tenant) => ctx.app.issueTicket({ user, tenant }),
    run: async (op) => {
      let res;
      if (op.kind === 'anonymous') res = await call(ctx.port, 'POST', '/v1/session/anonymous');
      else if (op.kind === 'login') res = await call(ctx.port, 'POST', '/v1/session/login', { token: op.token || undefined, body: { ticket: op.ticket } });
      else {
        const [method, target, bodyOf] = ROUTE[op.kind](op);
        res = await call(ctx.port, method, target, { token: op.token || undefined, ...(bodyOf && { body: bodyOf(op) }) });
      }
      return { ok: res.status < 400, code: res.status < 400 ? 'ok' : res.json.outcome, body: res.status < 400 ? res.json : null };
    },
    world: () => ctx.app.snapshot().world,
    close: () => ctx.close()
  };
}

const part = (world, tenant) => JSON.stringify([world.identity.roles[tenant], world.resources[tenant], world.identity.sessions.filter((entry) => entry.tenant === tenant)]);

async function sequence(makeExecutor, seed, steps, stats = null) {
  const rng = mulberry32(seed);
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const clock = manualClock();
  const exec = await makeExecutor(clock);
  const model = createModel(clock);
  const used = [];
  const tickets = [];
  let created = 0;
  const token = () => {
    const r = rng();
    const known = model.liveTokens();
    if (r < 0.04) return null;
    if (r < 0.08) return 'garbage';
    if (r < 0.12 || known.length === 0) return `c022_${'Q'.repeat(43)}`;
    return pick(known);
  };
  try {
    for (let step = 0; step < steps; step += 1) {
      const r = rng();
      const tok = token();
      const tenantOfToken = (tok && model.tenantOf(tok)) || pick(contract.tenants);
      const ids = ['proj-0001', 'proj-0002', 'proj-0003', 'proj-0004', 'proj-0005', 'proj-0006', 'proj-0099'];
      // Most role changes and revokes name a member of the acting tenant (the interesting transitions); some name anybody.
      const userFor = () => (rng() < 0.7 ? pick(Object.keys(model.roles[tenantOfToken])) : pick(contract.users));
      let op;
      if (r < 0.06) { clock.advance(rng() < 0.92 ? pick([0, 1, 1000, 5000]) : pick([130000, 400000, 600000])); continue; }
      if (r < 0.12) op = { kind: 'anonymous' };
      else if (r < 0.28) {
        const t = rng();
        let ticket;
        if (t < 0.7 || tickets.length === 0) {
          const user = pick(contract.users);
          const tenant = pick(contract.tenants);
          ticket = exec.issue(user, tenant);
          model.registerTicket(ticket, user, tenant);
        } else if (t < 0.85) { ticket = pick(tickets); } else { ticket = `t022_${'Z'.repeat(43)}`; }
        op = { kind: 'login', ticket, token: rng() < 0.45 ? tok : null };
      } else if (r < 0.34) op = { kind: 'session.logout', token: tok };
      else if (r < 0.38) op = { kind: 'session.whoami', token: tok };
      else if (r < 0.41) op = { kind: 'session.switch', token: tok, tenant: pick(contract.tenants) };
      else if (r < 0.49) op = { kind: 'project.list', token: tok, q: pick(['', 'p', SHORT[pick(contract.tenants)], 'orchard']) };
      else if (r < 0.57) op = { kind: 'project.read', token: tok, id: pick(ids) };
      else if (r < 0.66) { created += 1; op = { kind: 'project.create', token: tok, name: `${SHORT[tenantOfToken]}-p${created}`, units: 1 + (created % 99) }; }
      else if (r < 0.72) op = { kind: 'project.update', token: tok, id: pick(ids), name: `${SHORT[tenantOfToken]}-u${step}`, units: 7 };
      else if (r < 0.76) op = { kind: 'project.delete', token: tok, id: pick(ids) };
      else if (r < 0.79) op = { kind: 'profile.read', token: tok, id: pick(['synthetic-001', 'synthetic-002', 'synthetic-999']) };
      else if (r < 0.81) op = { kind: 'profile.list', token: tok };
      else if (r < 0.87) op = { kind: 'admin.role', token: tok, user: userFor(), role: pick(contract.roles) };
      else if (r < 0.94) {
        const sids = [...model.sessions.keys()];
        const mine = [...model.sessions.values()].filter((session) => session.tenant === tenantOfToken).map((session) => session.sid);
        const sid = rng() < 0.6 && mine.length ? pick(mine) : pick([...sids, 'sid_none']);
        op = rng() < 0.5 && sids.length ? { kind: 'admin.revoke', token: tok, sid } : { kind: 'admin.revoke', token: tok, user: userFor() };
      } else op = { kind: pick(['admin.sessions', 'admin.audit']), token: tok };

      const before = JSON.stringify(exec.world());
      const worldBefore = exec.world();
      const predicted = model.step(op);
      const actual = await exec.run(op);
      const where = `seed ${seed} step ${step} ${JSON.stringify({ ...op, token: op.token ? op.token.slice(0, 9) : op.token })}`;
      assert.equal(actual.code, predicted.code, where);
      assert.equal(actual.ok, predicted.ok, where);
      if (stats) stats.add(`${op.kind}:${actual.code}`);
      const worldAfter = exec.world();
      if (!actual.ok) assert.equal(JSON.stringify(worldAfter), before, `${where}: a refused operation changed the world`);
      if (op.kind === 'login' && op.ticket) tickets.push(op.ticket);
      if (actual.ok && op.kind === 'anonymous') model.register(actual.body.token, { ...predicted.create, sid: actual.body.session.sid });
      if (actual.ok && op.kind === 'login') model.register(actual.body.token, { ...predicted.create, sid: actual.body.session.sid });
      if (actual.ok && op.kind !== 'anonymous') {
        const effectTenant = op.kind === 'login' ? predicted.create.tenant : model.tenantOf(op.token);
        for (const other of contract.tenants.filter((tenant) => tenant !== effectTenant)) assert.equal(part(worldAfter, other), part(worldBefore, other), `${where}: an effect crossed into ${other}`);
      }
      if (actual.ok && op.kind === 'anonymous') for (const tenant of contract.tenants) assert.equal(part(worldAfter, tenant), part(worldBefore, tenant), where);
      if (actual.ok && predicted.data) {
        const { data } = predicted;
        const b = actual.body;
        if (op.kind === 'project.list') {
          assert.deepEqual(b.items.map(({ id, name, units, owner, version }) => ({ id, name, units, owner, version })), data.items, where);
          assert.equal(b.count, data.count, where);
          assert.ok(b.items.every((item) => item.name.startsWith(SHORT[model.tenantOf(op.token)])), `${where}: a listed item names another tenant`);
        } else if (op.kind === 'project.read') {
          assert.deepEqual(b.project, data, where);
          assert.ok(b.project.name.startsWith(SHORT[model.tenantOf(op.token)]), `${where}: a read item names another tenant`);
        } else if (op.kind === 'project.create') {
          assert.equal(b.project.id, data.id, where);
          assert.equal(b.project.owner, model.userOf(op.token), `${where}: the owner is the verified user`);
        } else if (op.kind === 'session.whoami') {
          assert.deepEqual({ tenant: b.session.tenant, user: b.session.user, role: b.session.role }, data, where);
        } else if (op.kind === 'admin.role') assert.equal(b.changed, data.changed, where);
        else if (op.kind === 'admin.revoke') assert.equal(b.revoked, data.revoked, where);
        else if (op.kind === 'profile.list') assert.equal(b.count, data.count, where);
      }
    }
  } finally {
    await exec.close();
  }
}

test('seeded random sequences against the service: every answer is the model\'s, every refusal had no effect, no effect crossed a tenant (5 seeds x 500 operations)', async () => {
  for (const seed of [11, 22, 33, 44, 55]) await sequence(async (clock) => directExecutor(clock), seed, 500);
});

test('the same kind of sequence over REAL sockets against the HTTP server (2 seeds x 120 operations)', { timeout: 120000 }, async () => {
  for (const seed of [101, 202]) await sequence(httpExecutor, seed, 120);
});

test('the sequences are not vacuous: the real seeds reach every operation, every refusal class and both outcomes', async () => {
  const stats = new Set();
  for (const seed of [11, 22, 33, 44, 55]) await sequence(async (clock) => directExecutor(clock), seed, 500, stats);
  for (const needed of [
    'login:ok', 'login:TICKET_INVALID', 'login:NOT_A_MEMBER', 'login:ALREADY_AUTHENTICATED', 'login:SESSION_SUPERSEDED', 'login:TOKEN_UNKNOWN', 'anonymous:ok',
    'session.logout:ok', 'session.logout:SESSION_LOGGED_OUT', 'session.whoami:ok', 'session.switch:TENANT_SWITCH_REQUIRES_LOGIN', 'session.switch:LOGIN_REQUIRED',
    'project.list:ok', 'project.read:ok', 'project.read:RESOURCE_NOT_FOUND', 'project.read:SESSION_EXPIRED', 'project.read:SESSION_REVOKED', 'project.read:TOKEN_MALFORMED',
    'project.read:AUTHENTICATION_REQUIRED', 'project.create:ok', 'project.create:ROLE_FORBIDDEN', 'project.update:ok', 'project.update:RESOURCE_NOT_FOUND', 'project.delete:ok',
    'profile.read:ok', 'profile.read:RESOURCE_NOT_FOUND', 'admin.role:ok', 'admin.role:LAST_ADMIN', 'admin.role:ROLE_FORBIDDEN', 'admin.role:RESOURCE_NOT_FOUND',
    'admin.revoke:ok', 'admin.revoke:SESSION_NOT_ACTIVE', 'admin.revoke:RESOURCE_NOT_FOUND', 'admin.sessions:ok', 'admin.audit:ok'
  ]) assert.ok(stats.has(needed), `${needed} was never reached by the five seeds: ${[...stats].sort().join(' ')}`);
});
