'use strict';

// Cross-tenant probes over REAL sockets: claims, IDOR on every kind and verb, the same id in two tenants, lists, search, cursors,
// conditional requests and caches. The assertion that matters most is BYTE identity: someone else's id is answered exactly like an id
// that exists nowhere (status line, every header but Date, body), and nothing in either tenant changed.
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { raw, startApp } = require('./helpers.cjs');

let ctx;
let s;
before(async () => {
  ctx = await startApp();
  s = {
    ada: await ctx.session('ada'), alf: await ctx.session('alf'), ana: await ctx.session('ana'), bea: await ctx.session('bea'),
    ben: await ctx.session('ben'), bo: await ctx.session('bo'), cai: await ctx.session('cai'), cy: await ctx.session('cy')
  };
});
after(async () => { await ctx.close(); });

const auditCount = async (admin) => (await ctx.call('GET', '/v1/admin/audit', { token: admin.token })).json.count;

test('a tenant named in ANY header, query field or body field is refused whatever its value, and nothing changes', async () => {
  const rows = [
    ['header X-Tenant', 'GET', '/v1/projects', { headers: (v) => [`X-Tenant: ${v}`] }],
    ['header X-Forwarded-Tenant', 'GET', '/v1/session', { headers: (v) => [`X-Forwarded-Tenant: ${v}`] }],
    ['header Tenant-Id', 'GET', '/v1/profiles', { headers: (v) => [`Tenant-Id: ${v}`] }],
    ['header X-Org', 'GET', '/v1/projects', { headers: (v) => [`X-Org: ${v}`] }],
    ['header X-Account-Id', 'GET', '/v1/projects', { headers: (v) => [`X-Account-Id: ${v}`] }],
    ['header X-MS-Tenant-Id', 'GET', '/v1/projects', { headers: (v) => [`X-MS-Tenant-Id: ${v}`] }],
    ['query tenant', 'GET', (v) => `/v1/projects?tenant=${v}`, {}],
    ['query orgId', 'GET', (v) => `/v1/projects?orgId=${v}`, {}],
    ['query workspace', 'GET', (v) => `/v1/projects?workspace=${v}`, {}],
    ['body tenant on POST', 'POST', '/v1/projects', { body: (v) => ({ name: 'x', units: 1, tenant: v }) }],
    ['body tenantId on PUT', 'PUT', '/v1/projects/proj-0001', { body: (v) => ({ name: 'x', units: 1, tenantId: v }) }],
    ['body orgId on admin role', 'POST', '/v1/admin/role', { admin: true, body: (v) => ({ user: 'alf', role: 'member', orgId: v }) }]
  ];
  const before = ctx.world();
  for (const [name, method, target, spec] of rows) {
    const caller = spec.admin ? s.ada : s.alf;
    const seen = [];
    for (const value of ['tenant-birch', 'tenant-alder', 'nonsense']) {
      const answer = await ctx.bytes(method, typeof target === 'function' ? target(value) : target, {
        token: caller.token, headers: spec.headers ? spec.headers(value) : [], ...(spec.body && { body: spec.body(value) })
      });
      assert.equal(answer.status, 400, `${name} ${value}`);
      assert.equal(answer.json.outcome, 'TENANT_CLAIM_REJECTED', name);
      assert.equal(answer.headers.connection, 'close', name);
      assert.equal(answer.closedByServer, true, name);
      seen.push(raw.canon(answer));
    }
    assert.equal(new Set(seen).size, 1, `${name}: the refusal does not depend on the value (no oracle for the own or a foreign tenant)`);
  }
  assert.equal(ctx.world(), before, 'a claim changes nothing');
  const path = await ctx.bytes('GET', '/v1/tenants/tenant-birch/projects', { token: s.alf.token });
  const nowhere = await ctx.bytes('GET', '/v1/nowhere/projects', { token: s.alf.token });
  assert.equal(raw.canon(path), raw.canon(nowhere), 'a tenant in the path is just an unknown route');
});

const PROBES = [
  ['GET project', 'GET', (id) => `/v1/projects/${id}`, undefined],
  ['PUT project', 'PUT', (id) => `/v1/projects/${id}`, { name: 'taken-over', units: 1 }],
  ['DELETE project', 'DELETE', (id) => `/v1/projects/${id}`, undefined]
];

test('IDOR on projects: an id that exists only in the OTHER tenant is answered exactly like an id that exists nowhere, in both directions, for every verb', async () => {
  const run = async (caller, foreignId, foreignAdmin) => {
    const adminBefore = await auditCount(foreignAdmin);
    for (const [name, method, target, body] of PROBES) {
      if (['viewer'].includes(caller.role) && method !== 'GET') continue;
      const foreign = await ctx.bytes(method, target(foreignId), { token: caller.token, ...(body && { body }) });
      const nowhere = await ctx.bytes(method, target('proj-0099'), { token: caller.token, ...(body && { body }) });
      assert.equal(foreign.status, 404, `${caller.user} ${name} ${foreignId}`);
      assert.equal(foreign.json.outcome, 'RESOURCE_NOT_FOUND');
      assert.equal(raw.canon(foreign), raw.canon(nowhere), `${caller.user} ${name}: foreign id and missing id are different answers`);
      assert.doesNotMatch(foreign.text, new RegExp(foreignId), 'the id is never echoed');
    }
    assert.equal(await auditCount(foreignAdmin), adminBefore, `the foreign tenant's audit trail gained nothing from ${caller.user}`);
  };
  s.bo.role = 'viewer';
  s.ana.role = 'viewer';
  // alder owns proj-0003 and birch does not: birch and cedar probe it.
  await run(s.ben, 'proj-0003', s.ada);
  await run(s.bo, 'proj-0003', s.ada);
  await run(s.cy, 'proj-0003', s.ada);
  // birch grows past alder, so that it owns ids alder lacks: alder and cedar probe those.
  for (const name of ['birch-grove', 'birch-field', 'birch-lake']) assert.equal((await ctx.call('POST', '/v1/projects', { token: s.ben.token, body: { name, units: 2 } })).status, 201);
  await run(s.alf, 'proj-0004', s.bea);
  await run(s.ana, 'proj-0005', s.bea);
  await run(s.cy, 'proj-0005', s.bea);
  assert.equal(ctx.world().includes('taken-over'), false, 'no probe changed or created anything');
});


test('IDOR on profiles, session handles and users: foreign ids are answered like missing ones and nothing changes', async () => {
  const before = ctx.world();
  const profileForeign = await ctx.bytes('GET', '/v1/profiles/synthetic-001', { token: s.ben.token });
  const profileNowhere = await ctx.bytes('GET', '/v1/profiles/synthetic-999', { token: s.ben.token });
  assert.equal(profileForeign.status, 404);
  assert.equal(raw.canon(profileForeign), raw.canon(profileNowhere));
  const sidForeign = await ctx.bytes('POST', '/v1/admin/revoke', { token: s.bea.token, body: { sid: s.ada.sid } });
  const sidNowhere = await ctx.bytes('POST', '/v1/admin/revoke', { token: s.bea.token, body: { sid: 'sid_does-not-exist' } });
  assert.equal(sidForeign.status, 404);
  assert.equal(raw.canon(sidForeign), raw.canon(sidNowhere));
  const userForeign = await ctx.bytes('POST', '/v1/admin/role', { token: s.bea.token, body: { user: 'ada', role: 'viewer' } });
  const userNowhere = await ctx.bytes('POST', '/v1/admin/role', { token: s.bea.token, body: { user: 'nobody', role: 'viewer' } });
  assert.equal(userForeign.status, 404);
  assert.equal(raw.canon(userForeign), raw.canon(userNowhere));
  const revokeUser = await ctx.bytes('POST', '/v1/admin/revoke', { token: s.bea.token, body: { user: 'ada' } });
  assert.equal(revokeUser.status, 404);
  assert.equal(ctx.world(), before);
  assert.equal((await ctx.call('GET', '/v1/session', { token: s.ada.token })).status, 200, 'alder admin session untouched by the birch admin');
  const sessions = await ctx.call('GET', '/v1/admin/sessions', { token: s.bea.token });
  assert.ok(sessions.json.sessions.every((entry) => !['ada', 'alf', 'ana', 'cai', 'cy'].includes(entry.user)), 'the birch admin lists only birch sessions');
});

test('a user who belongs to two tenants acts in ONE of them per session: the role change of one tenant never touches the other', async () => {
  const dana = await ctx.session('dana', 'tenant-alder');
  const changed = await ctx.call('POST', '/v1/admin/role', { token: s.bea.token, body: { user: 'dana', role: 'member' } });
  assert.equal(changed.status, 200);
  const alderView = await ctx.call('GET', '/v1/session', { token: dana.token });
  assert.equal(alderView.json.session.tenant, 'tenant-alder');
  assert.equal(alderView.json.session.role, 'member');
  const birchDana = await ctx.session('dana', 'tenant-birch');
  assert.equal(birchDana.res.json.session.role, 'member', 'the birch membership now says member');
  await ctx.call('POST', '/v1/admin/role', { token: s.bea.token, body: { user: 'dana', role: 'viewer' } });
  assert.equal((await ctx.call('GET', '/v1/session', { token: dana.token })).json.session.role, 'member', 'alder membership untouched');
});

test('the same resource id in two tenants never collides: content, ETags, edits and deletes are per tenant', async () => {
  const alderRead = await ctx.call('GET', '/v1/projects/proj-0001', { token: s.ada.token });
  const birchRead = await ctx.call('GET', '/v1/projects/proj-0001', { token: s.bea.token });
  assert.equal(alderRead.json.project.name, 'alder-orchard');
  assert.equal(birchRead.json.project.name, 'birch-harbor');
  assert.notEqual(alderRead.headers.etag, birchRead.headers.etag);
  const edit = await ctx.call('PUT', '/v1/projects/proj-0001', { token: s.ada.token, body: { name: 'alder-orchard-2', units: 4 } });
  assert.equal(edit.status, 200);
  const birchAgain = await ctx.call('GET', '/v1/projects/proj-0001', { token: s.bea.token });
  assert.equal(birchAgain.text, birchRead.text);
  assert.equal(birchAgain.headers.etag, birchRead.headers.etag);
  assert.equal((await ctx.call('DELETE', '/v1/projects/proj-0001', { token: s.ada.token })).status, 200);
  assert.equal((await ctx.call('GET', '/v1/projects/proj-0001', { token: s.ada.token })).status, 404);
  assert.equal((await ctx.call('GET', '/v1/projects/proj-0001', { token: s.bea.token })).text, birchRead.text, 'birch keeps its own proj-0001');
});

test('conditional requests cannot cross tenants: an ETag of one tenant validates nothing in another and never turns a missing id into 304', async () => {
  const birch = await ctx.call('GET', '/v1/projects/proj-0002', { token: s.bea.token });
  const etag = birch.headers.etag;
  const same = await ctx.bytes('GET', '/v1/projects/proj-0002', { token: s.bea.token, headers: [`If-None-Match: ${etag}`] });
  assert.equal(same.status, 304, 'own tenant, own ETag: not modified');
  assert.equal(same.text, '');
  const crossed = await ctx.call('GET', '/v1/projects/proj-0002', { token: s.ada.token, headers: { 'If-None-Match': etag } });
  assert.equal(crossed.status, 200, 'the same id in another tenant is a different resource: 200, never 304');
  assert.equal(crossed.json.project.name, 'alder-river');
  const missing = await ctx.bytes('GET', '/v1/projects/proj-0077', { token: s.ada.token, headers: [`If-None-Match: ${etag}`] });
  const plain = await ctx.bytes('GET', '/v1/projects/proj-0077', { token: s.ada.token });
  assert.equal(missing.status, 404);
  assert.equal(raw.canon(missing), raw.canon(plain));
  const star = await ctx.bytes('GET', '/v1/projects/proj-0077', { token: s.cy.token, headers: ['If-None-Match: *'] });
  assert.equal(star.status, 404);
  const wrongTenantMatch = await ctx.call('PUT', '/v1/projects/proj-0002', { token: s.ada.token, headers: { 'If-Match': etag }, body: { name: 'alder-river', units: 5 } });
  assert.equal(wrongTenantMatch.status, 412, 'an If-Match of another tenant fails');
  const ims = await ctx.call('GET', '/v1/projects/proj-0002', { token: s.ada.token, headers: { 'If-Modified-Since': 'Sat, 01 Jan 2050 00:00:00 GMT' } });
  assert.equal(ims.status, 200, 'no Last-Modified exists: If-Modified-Since is ignored');
  assert.equal(ims.headers['last-modified'], undefined);
});

test('every answer is private to the caller: no-store, Vary Authorization, never a cookie, and a decoy cookie changes nothing', async () => {
  const targets = [['GET', '/v1/projects', s.ada], ['GET', '/v1/projects/proj-0002', s.bea], ['GET', '/v1/projects/proj-0099', s.bea], ['GET', '/v1/session', null], ['GET', '/v1/admin/audit', s.ana], ['GET', '/scope.json', null]];
  for (const [method, target, who] of targets) {
    const plain = await ctx.bytes(method, target, who ? { token: who.token } : {});
    const decoy = await ctx.bytes(method, target, { ...(who && { token: who.token }), headers: [`Cookie: session=${s.ada.token}; tenant=tenant-alder`] });
    assert.equal(plain.headers['cache-control'], 'no-store', target);
    assert.match(plain.headers.vary, /Authorization/i, target);
    assert.equal(plain.headers['set-cookie'], undefined, target);
    assert.equal(raw.canon(decoy), raw.canon(plain), `${target}: a cookie is not an identity channel`);
  }
});

test('lists, counts, search and cursors show the caller tenant only; a cursor of another tenant is refused like a garbled one', async () => {
  for (const [who, own, foreign] of [[s.ada, 'alder', 'birch'], [s.bea, 'birch', 'alder'], [s.cai, 'cedar', 'alder']]) {
    const all = await ctx.call('GET', '/v1/projects?limit=10', { token: who.token });
    assert.ok(all.json.items.every((item) => item.name.startsWith(own)), `${own}: only own items`);
    const search = await ctx.call('GET', `/v1/projects?q=${foreign}`, { token: who.token });
    assert.equal(search.json.count, 0, `${own} searching for ${foreign} finds nothing and counts nothing`);
    assert.deepEqual(search.json.items, []);
  }
  const page = await ctx.call('GET', '/v1/projects?limit=1', { token: s.ada.token });
  assert.equal(typeof page.json.nextCursor, 'string');
  const crossed = await ctx.bytes('GET', `/v1/projects?limit=1&cursor=${encodeURIComponent(page.json.nextCursor)}`, { token: s.bea.token });
  const garbled = await ctx.bytes('GET', '/v1/projects?limit=1&cursor=garbage', { token: s.bea.token });
  assert.equal(crossed.status, 400);
  assert.equal(crossed.json.outcome, 'CURSOR_INVALID');
  assert.equal(raw.canon(crossed), raw.canon(garbled));
  const otherQuery = await ctx.call('GET', `/v1/projects?limit=1&q=river&cursor=${encodeURIComponent(page.json.nextCursor)}`, { token: s.ada.token });
  assert.equal(otherQuery.json.outcome, 'CURSOR_INVALID', 'a cursor is bound to its query as well');
});
