'use strict';

// C010 scenarios "Anonymous callers see nothing", "A visitor reaches no lease and the operator reaches only audited metadata" (the role part)
// and the credential rules inherited from C009: a presented credential is always verified, a role or owner claim is never obeyed.
const assert = require('node:assert/strict');
const test = require('node:test');
const { call, same, seed, target, withApp } = require('./helpers.cjs');

const SUBJECTS = ['conductor-a', 'conductor-b'];
const PUBLIC = ['/', '/page.js', '/style.css', '/scope.json'];

test('there is no public state route and no anonymous API answer contains an owner subject or a resource id', () => withApp({}, async (context) => {
  const { ids } = await seed(context);
  const state = await call(context, null, 'GET', '/v1/state');
  assert.equal(state.status, 404);
  assert.equal(state.json.error.code, 'NOT_FOUND');
  const secrets = [...SUBJECTS, ...Object.values(ids.a), ...Object.values(ids.b), 'run-a', 'scratch-a', 'lease-a', 'run-b', 'scratch-b', 'lease-b'];
  // The page assets are the same static fixture code for everyone (they name the four synthetic identities); only data routes are scanned.
  const routes = ['/scope.json', '/v1/state', '/v1/me', '/v1/leases', '/v1/operator/leases', '/v1/operator/audit', target(ids.a, 'lease'), target(ids.a, 'run'), `${target(ids.a, 'lease')}/runs`, '/nope', '/v1/batch'];
  for (const route of routes) {
    for (const method of ['GET', 'POST', 'DELETE']) {
      const answer = await call(context, null, method, route, method === 'POST' ? {} : undefined);
      for (const secret of secrets) assert.equal(answer.text.includes(secret), false, `${method} ${route} must not contain ${secret}`);
    }
  }
}));

test('the public assets and the fixed scope answer without a token and say that no state is public', () => withApp({}, async (context) => {
  const scope = await call(context, null, 'GET', '/scope.json');
  assert.equal(scope.status, 200);
  assert.equal(scope.json.cardId, 'C010');
  assert.equal(scope.json.leaseOwnershipEnforcedServerSide, true);
  assert.equal(scope.json.publicState, false);
  assert.equal(scope.json.liveAzureRuns, 0);
  assert.equal(scope.json.authorizedCloudSpend, 0);
  for (const route of ['/', '/page.js', '/style.css']) {
    const asset = await call(context, null, 'GET', route);
    assert.equal(asset.status, 200, route);
    assert.equal(asset.headers['cache-control'], 'no-store');
    assert.match(asset.headers['content-security-policy'], /^default-src 'none'; script-src 'self'/);
  }
}));

const BAD_CREDENTIALS = [
  [null, 'AUTHENTICATION_REQUIRED'], ['abc', 'TOKEN_MALFORMED'], [`c009_${'A'.repeat(43)}`, 'TOKEN_UNKNOWN']
];

test('a missing, malformed, forged or expired credential is refused with its typed 401 on every route, public or not, and never read as anonymous', () => withApp({}, async (context) => {
  const { ids } = await seed(context);
  const expired = context.app.issueToken('conductor-a', { ttlMs: 1 });
  context.clock.advance(5);
  const before = same(context.app.snapshot());
  for (const route of [...PUBLIC.slice(1), '/v1/me', '/v1/leases', target(ids.a, 'lease'), target(ids.a, 'run')]) {
    for (const [token, code] of [...BAD_CREDENTIALS, [expired, 'TOKEN_EXPIRED']]) {
      const answer = await call(context, token, 'GET', route);
      if (token === null && PUBLIC.includes(route)) { assert.equal(answer.status, 200, route); continue; }
      assert.equal(answer.status, 401, `${route} ${code}: ${answer.text}`);
      assert.equal(answer.json.error.code, code);
      assert.ok(answer.headers['www-authenticate'], 'a 401 carries a challenge');
    }
  }
  const two = await call(context, null, 'GET', '/v1/me', undefined, { Authorization: ['Bearer a', 'Bearer b'] });
  assert.equal(two.status, 401);
  assert.equal(two.json.error.code, 'TOKEN_MALFORMED');
  assert.deepEqual(context.app.snapshot(), before);
}));

const LEASE_ROUTES = [
  ['GET', '/v1/leases'], ['POST', '/v1/leases', { name: 'x', ttlMs: 1000 }], ['GET', (i) => target(i, 'lease')], ['DELETE', (i) => target(i, 'lease')],
  ['GET', (i) => `/v1/leases/${i.lease}/runs`], ['POST', (i) => `/v1/leases/${i.lease}/runs`, { name: 'x', units: 1 }], ['GET', (i) => target(i, 'run')],
  ['PATCH', (i) => target(i, 'run'), { units: 3 }], ['POST', (i) => `${target(i, 'run')}/cancel`], ['DELETE', (i) => target(i, 'export')], ['POST', '/v1/batch', { ops: [] }]
];

test('the role table is deny by default: a visitor and the operator reach no lease route, a conductor and a visitor reach no operator route', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const before = same(context.app.snapshot());
  for (const identity of ['visitor', 'operator']) {
    for (const [method, route, body] of LEASE_ROUTES) {
      const url = typeof route === 'function' ? route(ids.a) : route;
      const answer = await call(context, tokens[identity], method, url, typeof body === 'function' ? body(ids.a) : body);
      assert.equal(answer.status, 403, `${identity} ${method} ${url}: ${answer.text}`);
      assert.equal(answer.json.error.code, 'ROLE_FORBIDDEN');
      assert.equal(answer.headers.connection, 'close');
    }
  }
  for (const identity of ['visitor', 'conductor-a', 'conductor-b']) {
    for (const route of ['/v1/operator/leases', '/v1/operator/audit']) {
      const answer = await call(context, tokens[identity], 'GET', route);
      assert.equal(answer.status, 403, `${identity} ${route}`);
      assert.equal(answer.json.error.code, 'ROLE_FORBIDDEN');
    }
  }
  assert.deepEqual(context.app.snapshot(), before);
}));

test('every identity may ask who the server thinks it is, and the answer is the verified subject and role, never a claim', () => withApp({}, async (context) => {
  const { tokens } = await seed(context);
  const expected = { visitor: 'visitor', 'conductor-a': 'conductor', 'conductor-b': 'conductor', operator: 'operator' };
  const claims = { 'X-Role': 'operator', 'X-Owner': 'conductor-a', 'X-Subject': 'conductor-a', 'X-Forwarded-User': 'operator', 'X-Lease': 'lease-0123456789abcdef', 'X-Tenant': 'a' };
  for (const [identity, role] of Object.entries(expected)) {
    const answer = await call(context, tokens[identity], 'GET', '/v1/me', undefined, claims);
    assert.equal(answer.status, 200);
    assert.deepEqual([answer.json.subject, answer.json.role], [identity, role]);
    assert.deepEqual(answer.json.ignoredClaims, ['x-forwarded-user', 'x-lease', 'x-owner', 'x-role', 'x-subject', 'x-tenant']);
  }
}));
