'use strict';

// C010 scenarios "Hostile ids, paths, methods and fields are refused uniformly" (fields) and "A lease cannot be transferred": mass assignment
// of an owner, a role, a lease or a server-owned field on every route that takes a body, and every attempt to move a lease. Each must leave
// the full state byte-identical and every lease with its owner.
const assert = require('node:assert/strict');
const test = require('node:test');
const { bearer, exchange, withBody, JSON_TYPE } = require('./raw-http.cjs');
const { call, same, seed, target, withApp } = require('./helpers.cjs');

const FORBIDDEN = {
  IDENTITY_CLAIM_REJECTED: ['owner', 'role', 'roles', 'subject', 'identity', 'actingAs'],
  SERVER_FIELD_REJECTED: ['id', 'lease', 'leaseId', 'kind', 'state', 'revision', 'createdAtMs', 'expiresAtMs', 'ownerSubject']
};
const BODY_ROUTES = [
  ['POST', () => '/v1/leases', () => ({ name: 'x', ttlMs: 1000 })], ['POST', (i) => `/v1/leases/${i.lease}/runs`, () => ({ name: 'x', units: 1 })],
  ['POST', (i) => `/v1/leases/${i.lease}/scratches`, () => ({ name: 'x' })], ['POST', (i) => `/v1/leases/${i.lease}/exports`, (i) => ({ name: 'x', runId: i.run })],
  ['PATCH', (i) => target(i, 'run'), () => ({ units: 4 })], ['PATCH', (i) => target(i, 'scratch'), () => ({ name: 'y' })]
];
const owners = (context) => context.app.snapshot().leases.map((lease) => [lease.id, lease.owner]);

test('mass assignment of an owner, a role, a lease or any server-owned field is refused by name on every route that takes a body, and no owner ever changes', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const before = same(context.app.snapshot());
  for (const [method, route, body] of BODY_ROUTES) {
    for (const [code, fields] of Object.entries(FORBIDDEN)) {
      for (const field of fields) {
        const claimed = field === 'lease' || field === 'leaseId' ? ids.a.lease : 'conductor-a';
        const answer = await call(context, tokens['conductor-b'], method, route(ids.b), { ...body(ids.b), [field]: claimed });
        assert.equal(answer.status, 400, `${method} ${route(ids.b)} ${field}: ${answer.text}`);
        assert.equal(answer.json.error.code, code, `${field} is ${code}`);
        assert.equal(answer.json.field, field);
        assert.equal(answer.headers.connection, 'close');
      }
    }
    const unknown = await call(context, tokens['conductor-b'], method, route(ids.b), { ...body(ids.b), surprise: 1 });
    assert.equal(unknown.status, 400, `${method} ${route(ids.b)}`);
    assert.equal(unknown.json.error.code, 'INPUT_UNKNOWN_FIELD');
  }
  assert.deepEqual(context.app.snapshot(), before);
  assert.deepEqual(owners(context), [[ids.a.lease, 'conductor-a'], [ids.b.lease, 'conductor-b']]);
}));

test('a lease cannot be transferred: no route, verb, body, query or header moves it, and every attempt is refused with no effect', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const before = same(context.app.snapshot());
  const patch = { op: 'update', lease: ids.b.lease, kind: 'run', id: ids.b.run, patch: { owner: 'conductor-a' } };
  const attempts = [
    ['PATCH', `/v1/leases/${ids.b.lease}`, { owner: 'conductor-a' }, 405, 'METHOD_NOT_ALLOWED'], ['PUT', `/v1/leases/${ids.b.lease}`, { owner: 'conductor-a' }, 405, 'METHOD_NOT_ALLOWED'],
    ['POST', `/v1/leases/${ids.b.lease}/transfer`, { owner: 'conductor-a' }, 404, 'TARGET_NOT_FOUND'], ['POST', `/v1/leases/${ids.b.lease}/owner`, { subject: 'conductor-a' }, 404, 'TARGET_NOT_FOUND'],
    ['POST', '/v1/leases', { name: 'x', ttlMs: 1000, owner: 'conductor-a' }, 400, 'IDENTITY_CLAIM_REJECTED'], ['GET', `/v1/leases/${ids.b.lease}?owner=conductor-a`, undefined, 400, 'QUERY_NOT_ALLOWED'],
    ['POST', '/v1/batch', { ops: [patch] }, 400, 'IDENTITY_CLAIM_REJECTED'], ['POST', '/v1/batch', { owner: 'conductor-a', ops: [] }, 400, 'IDENTITY_CLAIM_REJECTED']
  ];
  for (const [method, route, body, status, code] of attempts) {
    for (const identity of ['conductor-a', 'conductor-b']) {
      const answer = await call(context, tokens[identity], method, route, body, { 'X-Owner': 'conductor-a', 'X-Lease': ids.a.lease, 'X-Subject': 'conductor-a' });
      assert.equal(answer.status, status, `${identity} ${method} ${route}: ${answer.text}`);
      assert.equal(answer.json.error.code, code, `${identity} ${method} ${route}`);
      assert.deepEqual(answer.json.ignoredClaims, ['x-lease', 'x-owner', 'x-subject']);
    }
  }
  assert.deepEqual(context.app.snapshot(), before);
  assert.deepEqual(owners(context), [[ids.a.lease, 'conductor-a'], [ids.b.lease, 'conductor-b']]);
}));

test('a claimed owner, lease or subject in a header is ignored: the same request with and without them gives the same answer, and is reported by name', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const claims = { 'X-Owner': 'conductor-a', 'X-Lease': ids.a.lease, 'X-Lease-Id': ids.a.lease, Owner: 'conductor-a', 'X-Forwarded-User': 'conductor-a', 'X-Role': 'operator', 'X-Tenant': 'a', 'X-Resource-Owner': 'conductor-a' };
  for (const route of [target(ids.b, 'lease'), target(ids.a, 'lease'), '/v1/leases', `${target(ids.b, 'lease')}/runs?limit=1`]) {
    const plain = await call(context, tokens['conductor-b'], 'GET', route);
    const claimed = await call(context, tokens['conductor-b'], 'GET', route, undefined, claims);
    assert.equal(claimed.status, plain.status, route);
    assert.deepEqual({ ...claimed.json, ignoredClaims: [] }, { ...plain.json, ignoredClaims: [] }, route);
    assert.deepEqual(claimed.json.ignoredClaims, ['owner', 'x-forwarded-user', 'x-lease', 'x-lease-id', 'x-owner', 'x-resource-owner', 'x-role', 'x-tenant']);
  }
}));

test('a raw request whose body claims an owner is refused before any effect, with the connection closed', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const before = same(context.app.snapshot());
  const bytes = withBody(context.port, 'POST', `/v1/leases/${ids.b.lease}/runs`, [bearer(tokens['conductor-b']), JSON_TYPE], '{"name":"x","units":1,"owner":"conductor-a"}');
  const { answers, closedByServer } = await exchange(context.port, bytes);
  assert.equal(answers.length, 1);
  assert.equal(answers[0].status, 400);
  assert.equal(answers[0].json.error.code, 'IDENTITY_CLAIM_REJECTED');
  assert.equal(closedByServer, true);
  assert.deepEqual(context.app.snapshot(), before);
}));
