'use strict';

// Core behavior over REAL loopback sockets: the world, the session endpoints, the project and profile kinds, the admin routes.
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { HOME, LIMITS, MEMBERS, SEED, startApp } = require('./helpers.cjs');

let ctx;
before(async () => { ctx = await startApp(); });
after(async () => { await ctx.close(); });

const names = (items) => items.map((item) => item.name);

test('scope.json says what this fixture is not', async () => {
  const res = await ctx.call('GET', '/scope.json');
  assert.equal(res.status, 200);
  assert.equal(res.json.cardId, 'C022');
  for (const flag of ['entraIntegrated', 'identityRegistered', 'productionRuntimeValidated', 'nativeTargetQualified']) assert.equal(res.json[flag], false, flag);
  assert.equal(res.json.liveAzureRuns, 0);
  assert.equal(res.json.authorizedCloudSpend, 0);
  assert.equal(res.json.businessData, 'synthetic');
});

test('a login with a one-time ticket gives a tenant session whose tenant, user and role come from the server', async () => {
  for (const [tenant, members] of Object.entries(MEMBERS)) {
    for (const [user, role] of Object.entries(members)) {
      const { token, sid, res } = await ctx.session(user, tenant);
      assert.equal(res.json.outcome, 'ok');
      assert.match(token, /^c022_[A-Za-z0-9_-]{43}$/);
      assert.equal(res.json.session.tenant, tenant);
      assert.equal(res.json.session.user, user);
      assert.equal(res.json.session.role, role);
      assert.equal(res.json.session.state, 'active');
      const me = await ctx.call('GET', '/v1/session', { token });
      assert.equal(me.status, 200);
      assert.deepEqual({ ...me.json.session, expiresAtMs: 0 }, { sid, state: 'active', tenant, user, role, expiresAtMs: 0 });
    }
  }
});

test('every tenant lists exactly its own seeded projects and nothing else', async () => {
  for (const [tenant, seeded] of Object.entries(SEED)) {
    const admin = Object.keys(MEMBERS[tenant]).find((user) => MEMBERS[tenant][user] === 'admin');
    const { token } = await ctx.session(admin, tenant);
    const res = await ctx.call('GET', '/v1/projects?limit=10', { token });
    assert.equal(res.status, 200);
    assert.equal(res.json.count, seeded.length);
    assert.deepEqual(names(res.json.items), seeded.map(([name]) => name));
    assert.deepEqual(res.json.items.map((item) => item.id), seeded.map((entry, index) => `proj-${String(index + 1).padStart(4, '0')}`));
    assert.deepEqual(res.json.items.map((item) => item.owner), seeded.map(([, , owner]) => owner));
  }
});

test('a member creates, reads, updates with If-Match and deletes a project; the owner is the verified user', async () => {
  const { token } = await ctx.session('alf', 'tenant-alder');
  const created = await ctx.call('POST', '/v1/projects', { token, body: { name: 'alder-lake', units: 9 } });
  assert.equal(created.status, 201);
  assert.deepEqual(created.json.project, { id: 'proj-0004', name: 'alder-lake', units: 9, owner: 'alf', version: 1 });
  const etag = created.headers.etag;
  assert.match(etag, /^"[A-Za-z0-9_-]{16,}"$/);
  const read = await ctx.call('GET', '/v1/projects/proj-0004', { token });
  assert.equal(read.status, 200);
  assert.equal(read.headers.etag, etag);
  const stale = await ctx.call('PUT', '/v1/projects/proj-0004', { token, headers: { 'If-Match': '"nope"' }, body: { name: 'alder-lake', units: 10 } });
  assert.equal(stale.status, 412);
  assert.equal(stale.json.outcome, 'PRECONDITION_FAILED');
  const updated = await ctx.call('PUT', '/v1/projects/proj-0004', { token, headers: { 'If-Match': etag }, body: { name: 'alder-lake', units: 10 } });
  assert.equal(updated.status, 200);
  assert.deepEqual(updated.json.project, { id: 'proj-0004', name: 'alder-lake', units: 10, owner: 'alf', version: 2 });
  assert.notEqual(updated.headers.etag, etag);
  const gone = await ctx.call('DELETE', '/v1/projects/proj-0004', { token });
  assert.equal(gone.status, 200);
  assert.deepEqual(gone.json, { outcome: 'ok', deleted: 'proj-0004' });
  assert.equal((await ctx.call('GET', '/v1/projects/proj-0004', { token })).status, 404);
});

test('a viewer reads but never mutates; the server decides by the role it derived', async () => {
  const { token } = await ctx.session('ana', 'tenant-alder');
  assert.equal((await ctx.call('GET', '/v1/projects', { token })).status, 200);
  const before = ctx.world();
  for (const [method, target, body] of [['POST', '/v1/projects', { name: 'x', units: 1 }], ['PUT', '/v1/projects/proj-0001', { name: 'x', units: 1 }], ['DELETE', '/v1/projects/proj-0001'], ['GET', '/v1/admin/sessions'], ['POST', '/v1/admin/role', { user: 'ana', role: 'admin' }]]) {
    const res = await ctx.call(method, target, { token, ...(body && { body }) });
    assert.equal(res.status, 403, `${method} ${target}`);
    assert.equal(res.json.outcome, 'ROLE_FORBIDDEN');
  }
  assert.equal(ctx.world(), before, 'no effect');
});

test('pagination and search return pages of the caller tenant only, in id order, with a signed cursor', async () => {
  const { token } = await ctx.session('ada', 'tenant-alder');
  const first = await ctx.call('GET', '/v1/projects?limit=2', { token });
  assert.equal(first.json.items.length, 2);
  assert.equal(first.json.count, 3);
  assert.equal(typeof first.json.nextCursor, 'string');
  const second = await ctx.call('GET', `/v1/projects?limit=2&cursor=${encodeURIComponent(first.json.nextCursor)}`, { token });
  assert.deepEqual(names(second.json.items), ['alder-meadow']);
  assert.equal(second.json.nextCursor, null);
  const found = await ctx.call('GET', '/v1/projects?q=RIVER', { token });
  assert.deepEqual(names(found.json.items), ['alder-river']);
  assert.equal(found.json.count, 1);
  assert.equal((await ctx.call('GET', `/v1/projects?limit=${LIMITS.pageMax + 1}`, { token })).json.outcome, 'QUERY_INVALID');
  assert.equal((await ctx.call('GET', '/v1/projects?limit=2&limit=3', { token })).json.outcome, 'QUERY_INVALID');
  assert.equal((await ctx.call('GET', '/v1/projects?sort=name', { token })).json.outcome, 'QUERY_INVALID');
});

test('profiles come from the accepted C020 fixture and only for the profiles that belong to the tenant', async () => {
  const alder = await ctx.session('ana', 'tenant-alder');
  const list = await ctx.call('GET', '/v1/profiles', { token: alder.token });
  assert.equal(list.json.count, 1);
  const one = await ctx.call('GET', '/v1/profiles/synthetic-001', { token: alder.token });
  assert.equal(one.status, 200);
  assert.equal(one.json.profile.apiContract, 'getProfile/1');
  assert.equal(one.json.profile.profile.displayName, 'Avery Example');
  assert.equal(one.json.profile.stamp.implementation, 'v2');
  const birch = await ctx.session('bo', 'tenant-birch');
  assert.equal((await ctx.call('GET', '/v1/profiles/synthetic-002', { token: birch.token })).json.profile.profile.displayName, 'Jordan Sample');
  assert.equal((await ctx.call('GET', '/v1/profiles', { token: (await ctx.session('cy', 'tenant-cedar')).token })).json.count, 0);
});

test('the admin of a tenant lists its sessions, changes a role and reads its audit trail', async () => {
  const admin = await ctx.session('ada', 'tenant-alder');
  const other = await ctx.session('alf', 'tenant-alder');
  const sessions = await ctx.call('GET', '/v1/admin/sessions', { token: admin.token });
  assert.equal(sessions.status, 200);
  assert.ok(sessions.json.sessions.some((entry) => entry.sid === other.sid && entry.user === 'alf' && entry.state === 'active'));
  assert.ok(sessions.json.sessions.every((entry) => HOME[entry.user] === 'tenant-alder' || entry.user === 'dana'));
  const role = await ctx.call('POST', '/v1/admin/role', { token: admin.token, body: { user: 'alf', role: 'viewer' } });
  assert.deepEqual(role.json, { outcome: 'ok', user: 'alf', role: 'viewer', changed: true });
  assert.equal((await ctx.call('POST', '/v1/admin/role', { token: admin.token, body: { user: 'alf', role: 'member' } })).json.changed, true);
  const audit = await ctx.call('GET', '/v1/admin/audit', { token: admin.token });
  assert.equal(audit.status, 200);
  assert.ok(audit.json.entries.some((entry) => entry.op === 'admin.role' && entry.outcome === 'applied' && entry.user === 'ada'));
});

test('unknown routes and wrong methods are typed refusals', async () => {
  const { token } = await ctx.session('ada', 'tenant-alder');
  assert.equal((await ctx.call('GET', '/v1/nothing', { token })).json.outcome, 'NOT_FOUND');
  assert.equal((await ctx.call('GET', '/v1/tenants/tenant-birch/projects', { token })).json.outcome, 'NOT_FOUND');
  const wrong = await ctx.call('PATCH', '/v1/projects/proj-0001', { token, body: {} });
  assert.equal(wrong.status, 405);
  assert.equal(wrong.json.outcome, 'METHOD_NOT_ALLOWED');
  assert.ok(wrong.headers.allow);
});
