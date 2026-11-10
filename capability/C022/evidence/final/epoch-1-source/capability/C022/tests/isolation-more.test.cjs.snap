'use strict';

// More hostile tenant scenarios over REAL sockets: the audit trail, quotas that must not starve a neighbour, mass assignment, every
// single-character token tamper, and a user that belongs to no tenant.
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { LIMITS, startApp } = require('./helpers.cjs');

let ctx;
before(async () => { ctx = await startApp(); });
after(async () => { await ctx.close(); });

const entries = async (admin) => (await ctx.call('GET', '/v1/admin/audit', { token: admin.token })).json.entries;

test('the audit trail is per tenant: a denial or a probe is recorded in the caller tenant only, anonymous refusals in no tenant', async () => {
  const ada = await ctx.session('ada');
  const bea = await ctx.session('bea');
  const ana = await ctx.session('ana');
  const ben = await ctx.session('ben');
  const beaBefore = (await entries(bea)).length;
  assert.equal((await ctx.call('POST', '/v1/projects', { token: ana.token, body: { name: 'x', units: 1 } })).status, 403);
  assert.equal((await ctx.call('GET', '/v1/projects/proj-0003', { token: ben.token })).status, 404);
  assert.equal((await ctx.call('GET', '/v1/projects', {})).status, 401);
  assert.equal((await ctx.call('GET', '/v1/projects', { token: `c022_${'A'.repeat(43)}` })).status, 401);
  const alder = await entries(ada);
  const birch = await entries(bea);
  assert.ok(alder.some((entry) => entry.user === 'ana' && entry.outcome === 'denied' && entry.code === 'ROLE_FORBIDDEN' && entry.op === 'project.create'));
  assert.ok(birch.some((entry) => entry.user === 'ben' && entry.outcome === 'rejected' && entry.code === 'RESOURCE_NOT_FOUND' && entry.op === 'project.read'));
  assert.equal(alder.some((entry) => entry.user === 'ben'), false, 'the probe of a birch member is not in the alder trail');
  assert.equal(birch.some((entry) => entry.user === 'ana'), false);
  assert.equal(birch.length, beaBefore + 1, 'birch gained exactly the one record of its own member; the anonymous refusals went to no tenant');
  assert.ok([...alder, ...birch].every((entry) => entry.user !== null && entry.user !== undefined), 'no anonymous record inside a tenant trail');
  const seqs = alder.map((entry) => entry.seq);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), 'the trail is ordered');
});

test('one user flooding denials cannot evict the record of another user or of another tenant', async () => {
  const ada = await ctx.session('ada');
  const ana = await ctx.session('ana');
  const alf = await ctx.session('alf');
  const bea = await ctx.session('bea');
  const bo = await ctx.session('bo');
  assert.equal((await ctx.call('DELETE', '/v1/projects/proj-0001', { token: alf.token, body: undefined })).status, 200);
  assert.equal((await ctx.call('POST', '/v1/projects', { token: bo.token, body: { name: 'x', units: 1 } })).status, 403);
  for (let index = 0; index < 205; index += 1) await ctx.call('POST', '/v1/projects', { token: ana.token, body: { name: 'x', units: 1 } });
  const alder = await entries(ada);
  assert.ok(alder.filter((entry) => entry.user === 'ana').length <= 200, 'a ring per user is bounded');
  assert.ok(alder.some((entry) => entry.user === 'alf' && entry.op === 'project.delete' && entry.outcome === 'applied'), 'the record of alf survived the flood of ana');
  assert.ok((await entries(bea)).some((entry) => entry.user === 'bo'), 'the record of a birch user survived the flood in alder');
});

test('quota exhaustion in one tenant starves nobody else: projects and sessions', async (t) => {
  const ctx = await startApp({ app: { limits: { sessionsPerTenant: LIMITS.sessionsPerTenant, recordsPerTenant: 32 } } });
  t.after(() => ctx.close());
  const cai = await ctx.session('cai');
  for (let index = 0; index < LIMITS.projectsPerTenant; index += 1) assert.equal((await ctx.call('POST', '/v1/projects', { token: cai.token, body: { name: `cedar-${index}`, units: 1 } })).status, 201);
  const full = await ctx.call('POST', '/v1/projects', { token: cai.token, body: { name: 'cedar-over', units: 1 } });
  assert.equal(full.status, 409);
  assert.equal(full.json.outcome, 'TENANT_QUOTA_FULL');
  const alf = await ctx.session('alf');
  assert.equal((await ctx.call('POST', '/v1/projects', { token: alf.token, body: { name: 'alder-still-ok', units: 1 } })).status, 201);
  const ben = await ctx.session('ben');
  assert.equal((await ctx.call('POST', '/v1/projects', { token: ben.token, body: { name: 'birch-still-ok', units: 1 } })).status, 201);
  const held = [cai];
  for (let index = 1; index < LIMITS.sessionsPerTenant; index += 1) held.push(await ctx.session('cy'));
  const spare = ctx.app.issueTicket({ user: 'cy', tenant: 'tenant-cedar' });
  const refused = await ctx.call('POST', '/v1/session/login', { body: { ticket: spare } });
  assert.equal(refused.status, 409);
  assert.equal(refused.json.outcome, 'SESSION_QUOTA_FULL');
  assert.equal((await ctx.login('ada')).status, 201, 'alder logs in while cedar is full');
  assert.equal((await ctx.login('bea')).status, 201, 'birch logs in while cedar is full');
  assert.equal((await ctx.call('POST', '/v1/session/logout', { token: held[0].token })).status, 200);
  assert.equal((await ctx.call('POST', '/v1/session/login', { body: { ticket: spare } })).status, 201, 'the refused ticket was not consumed and works once there is room');
});

test('mass assignment: a body can never set a role, a tenant, an owner, an id or a version; the owner is the verified user', async () => {
  const alf = await ctx.session('alf');
  const ada = await ctx.session('ada');
  const before = ctx.world();
  for (const extra of [{ role: 'admin' }, { owner: 'ada' }, { id: 'proj-0500' }, { version: 99 }, { createdBy: 'ada' }, { roles: ['admin'] }, { user: 'ada' }, { sid: 'sid_x' }, { 'x.y': 1 }]) {
    const res = await ctx.call('POST', '/v1/projects', { token: alf.token, body: { name: 'mass-assign', units: 1, ...extra } });
    assert.equal(res.status, 400, JSON.stringify(extra));
    assert.equal(res.json.outcome, 'INPUT_UNKNOWN_FIELD');
  }
  const proto = await ctx.call('POST', '/v1/projects', { token: alf.token, rawBody: '{"name":"mass-assign","units":1,"__proto__":{"role":"admin"}}' });
  assert.equal(proto.json.outcome, 'INPUT_UNKNOWN_FIELD');
  const put = await ctx.call('PUT', '/v1/projects/proj-0002', { token: alf.token, body: { name: 'alder-river', units: 5, owner: 'alf' } });
  assert.equal(put.json.outcome, 'INPUT_UNKNOWN_FIELD');
  const role = await ctx.call('POST', '/v1/admin/role', { token: ada.token, body: { user: 'alf', role: 'superadmin' } });
  assert.equal(role.json.outcome, 'INPUT_INVALID');
  assert.equal((await ctx.call('POST', '/v1/admin/role', { token: ada.token, body: { user: 'alf' } })).json.outcome, 'INPUT_MISSING_FIELD');
  assert.equal(ctx.world(), before, 'every refused body had no effect');
  const created = await ctx.call('POST', '/v1/projects', { token: alf.token, body: { name: 'mine', units: 1 } });
  assert.equal(created.json.project.owner, 'alf');
});

test('a token altered in any ONE character, or of any other shape, is refused; the original keeps working', async () => {
  const ada = await ctx.session('ada');
  const body = ada.token.slice('c022_'.length);
  const before = ctx.world();
  let tried = 0;
  for (let index = 0; index < body.length; index += 1) {
    for (const replacement of ['A', 'b', '-']) {
      if (body[index] === replacement) continue;
      const forged = `c022_${body.slice(0, index)}${replacement}${body.slice(index + 1)}`;
      const res = await ctx.call('GET', '/v1/projects', { token: forged });
      assert.equal(res.status, 401, forged);
      assert.equal(res.json.outcome, 'TOKEN_UNKNOWN');
      tried += 1;
    }
  }
  assert.ok(tried >= 120);
  for (const shape of [ada.token.slice(0, -1), `${ada.token}A`, `c009_${body}`, body, 'c022_', 'Bearer', `${ada.token} x`]) {
    const res = await ctx.call('GET', '/v1/projects', { token: shape });
    assert.equal(res.status, 401, shape);
    assert.ok(['TOKEN_MALFORMED', 'TOKEN_UNKNOWN'].includes(res.json.outcome), shape);
  }
  assert.equal((await ctx.call('GET', '/v1/projects', { token: ada.token })).status, 200);
  assert.equal(ctx.world(), before);
});

test('two credentials, a lowercase scheme and an empty value are handled by one strict rule', async () => {
  const ada = await ctx.session('ada');
  const twice = await ctx.bytes('GET', '/v1/projects', { headers: [`Authorization: Bearer ${ada.token}`, `Authorization: Bearer ${ada.token}`] });
  assert.equal(twice.json.outcome, 'TOKEN_MALFORMED');
  const lower = await ctx.bytes('GET', '/v1/projects', { headers: [`Authorization: bearer ${ada.token}`] });
  assert.equal(lower.status, 200);
  const basic = await ctx.bytes('GET', '/v1/projects', { headers: ['Authorization: Basic YWRhOnB3'] });
  assert.equal(basic.json.outcome, 'TOKEN_MALFORMED');
  const empty = await ctx.bytes('GET', '/v1/projects', { headers: ['Authorization: '] });
  assert.equal(empty.json.outcome, 'TOKEN_MALFORMED');
});

test('a user that belongs to no tenant, and a member of ANOTHER tenant, cannot redeem a ticket for it', async () => {
  for (const [user, tenant] of [['nomad', 'tenant-alder'], ['nomad', 'tenant-cedar'], ['ana', 'tenant-birch'], ['cy', 'tenant-alder'], ['bea', 'tenant-cedar']]) {
    const ticket = ctx.app.issueTicket({ user, tenant });
    const before = ctx.world();
    const res = await ctx.call('POST', '/v1/session/login', { body: { ticket } });
    assert.equal(res.status, 403, `${user} in ${tenant}`);
    assert.equal(res.json.outcome, 'NOT_A_MEMBER');
    assert.equal(res.json.token, undefined);
    assert.equal(ctx.world(), before, 'no session, and the refusal consumed nothing');
  }
});
