'use strict';
const { test } = require('node:test');
const { assert, fixture, request, login, world, denied } = require('./kit.cjs');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('accepted anonymous bootstrap and optional-ticket login retain their non-candidate semantics', async () => {
  const f = await fixture();
  try {
    const anon = await request(f, '/v1/session/anonymous', { method: 'POST', headers: { Authorization: 'not a bearer' } });
    assert.equal(anon.status, 201, 'ANONYMOUS_BOOTSTRAP_DOES_NOT_REQUIRE_PREVIEW');
    assert.equal(anon.json.session.state, 'anonymous', 'ACCEPTED_ANONYMOUS_STATE');
    denied(await request(f, '/candidate', { token: anon.json.token }), 401, 'LOGIN_REQUIRED');
    const ticket = f.app.issueTicket({ user: 'alf', tenant: 'tenant-alder' });
    const signed = await request(f, '/v1/session/login', { method: 'POST', token: anon.json.token, body: { ticket } });
    assert.equal(signed.status, 201, 'OPTIONAL_ANONYMOUS_LOGIN_SUCCEEDS');
    assert.notEqual(signed.json.token, anon.json.token, 'LOGIN_ROTATES_TOKEN');
    assert.notEqual(signed.json.session.sid, anon.json.session.sid, 'LOGIN_ROTATES_SESSION_ID');
    denied(await request(f, '/candidate', { token: anon.json.token }), 401, 'SESSION_SUPERSEDED');
    const before = world(f);
    denied(await request(f, '/v1/session/login', { method: 'POST', body: { ticket } }), 401, 'TICKET_INVALID');
    assert.deepEqual(world(f), before, 'REPLAYED_TICKET_NO_EFFECT');
    const who = await request(f, '/v1/session', { token: signed.json.token });
    assert.equal(who.json.session.tenant, 'tenant-alder', 'TENANT_DERIVED_ONLY_FROM_ACCEPTED_SESSION');
    assert.equal(who.json.session.role, 'member', 'CURRENT_ACCEPTED_ROLE');
  } finally { await f.app.close(); }
});

for (const path of ['/candidate/profile.json', '/candidate/manifest.json', '/candidate/projects']) {
  for (const transition of ['expire', 'logout', 'revoke', 'demote']) {
    test(`current authority after awaited admission: ${transition} refuses ${path} without serving/effect`, async () => {
      const entered = deferred(), release = deferred();
      const f = await fixture({ hooks: { afterAuthorize: async info => { if (info.path === path) { entered.resolve(); await release.promise; } } } });
      try {
        const member = await login(f), admin = await login(f, 'ada');
        const pending = request(f, path, { token: member.token, ...(path.endsWith('projects') && { method: 'POST', body: { name: 'must-not-exist', units: 1 } }) });
        await entered.promise;
        if (transition === 'expire') f.advance(600000);
        else if (transition === 'logout') assert.equal((await request(f, '/v1/session/logout', { method: 'POST', token: member.token })).status, 200, 'REAL_LOGOUT_APPLIED');
        else {
          const r = await request(f, transition === 'revoke' ? '/v1/admin/revoke' : '/v1/admin/role', {
            method: 'POST', token: admin.token, body: transition === 'revoke' ? { sid: member.session.sid } : { user: 'alf', role: 'viewer' }
          });
          assert.equal(r.status, 200, 'REAL_ACCEPTED_ADMIN_TRANSITION');
        }
        const before = world(f); release.resolve();
        const r = await pending;
        denied(r, transition === 'demote' ? 403 : 401, { expire: 'SESSION_EXPIRED', logout: 'SESSION_LOGGED_OUT', revoke: 'SESSION_REVOKED', demote: 'ROLE_FORBIDDEN' }[transition]);
        assert.deepEqual(world(f), before, 'RECHECKED_REFUSAL_NO_BUSINESS_OR_SESSION_EFFECT');
      } finally { release.resolve(); await f.app.close(); }
    });
  }
}

test('same live token uses immediate downgrade and re-upgrade; caller role/owner headers never grant', async () => {
  const f = await fixture();
  try {
    const member = await login(f), admin = await login(f, 'ada'), viewer = await login(f, 'ana');
    for (const headers of [{ 'X-Role': 'admin' }, { 'X-Owner': 'alf' }, { 'X-MS-Client-Principal': 'admin' }, { Cookie: `Authorization=${member.token}` }]) {
      denied(await request(f, '/candidate', { token: viewer.token, headers }), 403, 'ROLE_FORBIDDEN');
      denied(await request(f, '/candidate', { headers }), 401, 'AUTHENTICATION_REQUIRED');
    }
    for (const role of ['viewer', 'member']) {
      assert.equal((await request(f, '/v1/admin/role', { method: 'POST', token: admin.token, body: { user: 'alf', role } })).status, 200, 'ACCEPTED_ROLE_CHANGE');
      const r = await request(f, '/candidate', { token: member.token });
      assert.equal(r.status, role === 'viewer' ? 403 : 200, 'SAME_TOKEN_USES_CURRENT_AUTHORITY');
    }
  } finally { await f.app.close(); }
});

test('boundary clock is checked after the queued boundary hook, not just initial admission', async () => {
  let expire;
  const f = await fixture({ hooks: { beforeBoundary: info => { if (info.candidate) expire(); } } });
  expire = () => f.advance(600000);
  try {
    const member = await login(f), before = world(f);
    denied(await request(f, '/candidate/manifest.json', { token: member.token }), 401, 'SESSION_EXPIRED');
    assert.deepEqual(world(f), before, 'QUEUED_SERVE_EXPIRY_HAS_NO_EFFECT');
  } finally { await f.app.close(); }
});

test('foreign tenant claims never select a candidate or change ownership', async () => {
  const f = await fixture();
  try {
    const member = await login(f);
    for (const [path, options] of [
      ['/candidate?tenant=tenant-birch', {}],
      ['/candidate', { headers: { 'X-Tenant': 'tenant-birch' } }],
      ['/candidate', { headers: { 'X-Workspace': 'tenant-alder' } }],
      ['/candidate/projects', { method: 'POST', body: { name: 'foreign', units: 1, tenant: 'tenant-birch' } }]
    ]) {
      const before = world(f); denied(await request(f, path, { ...options, token: member.token }), 400, 'TENANT_CLAIM_REJECTED');
      assert.deepEqual(world(f), before, 'CLIENT_TENANT_CLAIM_NO_EFFECT');
    }
    const r = await request(f, '/candidate/projects', { method: 'POST', token: member.token, body: { name: 'owned', units: 1 } });
    assert.equal(r.status, 201, 'REAL_AUTHORIZED_CANDIDATE_EFFECT');
    assert.equal(r.json.project.owner, 'alf', 'OWNER_IS_ACCEPTED_PRINCIPAL_NOT_CALLER');
    assert.equal(world(f).resources['tenant-birch'].projects.length, 2, 'FOREIGN_TENANT_UNCHANGED');
  } finally { await f.app.close(); }
});

test('accepted typed credentials, switch refusal, ticket validation and expiry stay natural', async () => {
  const f = await fixture();
  try {
    const member = await login(f);
    for (const headers of [{ Authorization: 'Basic fake' }, { Authorization: 'Bearer x' }]) denied(await request(f, '/candidate', { headers }), 401, 'TOKEN_MALFORMED');
    denied(await request(f, '/candidate', { token: 'c022_' + 'a'.repeat(43) }), 401, 'TOKEN_UNKNOWN');
    denied(await request(f, '/v1/session/switch', { method: 'POST', token: member.token, body: { tenant: 'tenant-birch' } }), 403, 'TENANT_SWITCH_REQUIRES_LOGIN');
    denied(await request(f, '/v1/session/login', { method: 'POST', body: { ticket: 'invalid' } }), 401, 'TICKET_INVALID');
    denied(await request(f, '/v1/session/login', { method: 'POST', body: { ticket: 'invalid', role: 'admin' } }), 400, 'INPUT_UNKNOWN_FIELD');
    denied(await request(f, '/v1/session/login', { method: 'POST', token: member.token, body: { ticket: 'invalid' } }), 409, 'ALREADY_AUTHENTICATED');
    f.advance(600000);
    denied(await request(f, '/candidate', { token: member.token }), 401, 'SESSION_EXPIRED');
  } finally { await f.app.close(); }
});

test('injected unexpected hook failure is a typed closed refusal, never candidate content', async () => {
  const f = await fixture({ hooks: { afterAuthorize: info => { if (info.candidate) throw new Error('injected failure'); } } });
  try { const member = await login(f), before = world(f); denied(await request(f, '/candidate', { token: member.token }), 500, 'INTERNAL_ERROR'); assert.deepEqual(world(f), before, 'INJECTED_FAILURE_NO_EFFECT'); }
  finally { await f.app.close(); }
});
