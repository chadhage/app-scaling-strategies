'use strict';
const { test } = require('node:test');
const { assert, fixture, request, login, world, denied, subject } = require('./kit.cjs');

test('original C047 unauthorized direct candidate read is denied, not C009-public', async () => {
  const f = await fixture();
  try { const before = world(f); denied(await request(f, '/candidate/profile.json'), 401, 'AUTHENTICATION_REQUIRED'); assert.deepEqual(world(f), before, 'UNAUTHORIZED_HAS_NO_BUSINESS_OR_SESSION_EFFECT'); }
  finally { await f.app.close(); }
});

test('original C047 real accepted C022 member preview is non-vacuously served', async () => {
  const f = await fixture();
  try {
    const session = await login(f);
    const r = await request(f, '/candidate/profile.json', { token: session.token });
    assert.equal(r.status, 200, 'REAL_AUTHORIZED_PREVIEW');
    assert.equal(r.json?.outcome, 'ok', 'AUTHORIZED_TYPED_RESULT');
    assert.equal(r.json?.profiles?.[0]?.profile?.id, 'synthetic-001', 'ACTUAL_TENANT_CANDIDATE_PROFILE');
  } finally { await f.app.close(); }
});

test('actual dispatch table enumerates every mounted candidate path, asset and alias', async () => {
  assert.equal(Array.isArray(subject.ROUTES), true, 'ACTUAL_ROUTE_TABLE_IS_EXPORTED');
  const candidates = subject.ROUTES.filter(r => r.candidate);
  assert.deepEqual(candidates.map(r => [r.path, r.method]), [
    ['/candidate', 'GET'], ['/candidate/', 'GET'], ['/candidate/profile.json', 'GET'],
    ['/v2', 'GET'], ['/v2/', 'GET'], ['/v2/profile.json', 'GET'],
    ['/assets/candidate.json', 'GET'], ['/candidate/manifest.json', 'GET'], ['/v2/manifest.json', 'GET'],
    ['/candidate/projects', 'POST'], ['/v2/projects', 'POST']
  ], 'EXACT_REACHABLE_CANDIDATE_DOMAIN');
  const f = await fixture();
  try {
    const member = await login(f), viewer = await login(f, 'ana'), birch = await login(f, 'ben', 'tenant-birch');
    for (const row of candidates) {
      const options = { method: row.method, ...(row.method === 'POST' && { body: { name: 'preview', units: 1 } }) };
      for (const [token, status, code] of [[undefined, 401, 'AUTHENTICATION_REQUIRED'], [viewer.token, 403, 'ROLE_FORBIDDEN'], ['c009_' + 'a'.repeat(43), 401, 'TOKEN_MALFORMED']]) {
        const before = world(f); denied(await request(f, row.path, { ...options, token }), status, code); assert.deepEqual(world(f), before, 'DENIED_ROW_NO_EFFECT:' + row.path);
      }
      const before = world(f), r = await request(f, row.path, { ...options, token: member.token });
      assert.equal(r.status, row.method === 'POST' ? 201 : 200, 'AUTHORIZED_ACTUAL_MOUNT:' + row.path);
      assert.equal(r.json?.outcome, 'ok', 'AUTHORIZED_RESULT_HAS_CONTRACT:' + row.path);
      assert.equal(/synthetic-002|birch-harbor/.test(r.raw), false, 'ALDER_NO_BIRCH_DATA:' + row.path);
      if (row.method === 'GET') assert.deepEqual(world(f), before, 'READ_ONLY_PREVIEW:' + row.path);
      const other = await request(f, row.path, { ...options, token: birch.token });
      assert.equal(other.status, row.method === 'POST' ? 201 : 200, 'OTHER_TENANT_REAL_POSITIVE:' + row.path);
      assert.equal(/synthetic-001|alder-orchard/.test(other.raw), false, 'BIRCH_NO_ALDER_DATA:' + row.path);
    }
  } finally { await f.app.close(); }
});
