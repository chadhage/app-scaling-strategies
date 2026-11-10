'use strict';

// What each identity may do is decided by the server (deny by default), and nothing a client sends in a body, a query or a header can name an owner,
// a lease, a role, a pool, a cap, a price, a state or a deadline.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { bookProblems, call, get, reserve, same, withApp } = require('./helpers.cjs');

const BODY = { key: 'key-roles-0001', tier: 'standard', units: 1 };
const ROUTES = [
  { name: 'me', method: 'GET', path: () => '/v1/me', allowed: ['visitor', 'conductor-a', 'operator'] },
  { name: 'reserve', method: 'POST', path: () => '/v1/reservations', body: BODY, allowed: ['conductor-a'] },
  { name: 'list', method: 'GET', path: () => '/v1/reservations', allowed: ['conductor-a'] },
  { name: 'read', method: 'GET', path: (id) => `/v1/reservations/${id}`, allowed: ['conductor-a'] },
  { name: 'release', method: 'POST', path: (id) => `/v1/reservations/${id}/release`, allowed: ['conductor-a'] },
  { name: 'allowance', method: 'GET', path: () => '/v1/allowance', allowed: ['conductor-a'] },
  { name: 'audit', method: 'GET', path: () => '/v1/audit', allowed: ['conductor-a'] },
  { name: 'batch', method: 'POST', path: () => '/v1/batch', body: { ops: [{ op: 'reserve', key: 'key-roles-0002', tier: 'standard', units: 1 }] }, allowed: ['conductor-a'] },
  { name: 'operator pool', method: 'GET', path: () => '/v1/operator/pool', allowed: ['operator'] },
  { name: 'operator audit', method: 'GET', path: () => '/v1/operator/audit', allowed: ['operator'] }
];

for (const route of ROUTES) {
  test(`${route.name}: only ${route.allowed.join(', ')} may use it; every other identity is refused and nothing changes`, () => withApp({}, async (ctx) => {
    const held = (await reserve(ctx, 'conductor-a', 1)).json.reservation;
    for (const who of ['visitor', 'conductor-a', 'operator']) {
      const before = same((await get(ctx, 'operator', '/v1/operator/pool')).json.pool);
      const answer = await call(ctx, ctx.tokens[who], route.method, route.path(held.id), route.body);
      if (route.allowed.includes(who)) {
        assert.equal(answer.status, 200, `${who}: ${answer.text}`);
      } else {
        assert.deepEqual([answer.status, answer.json.error.code, answer.headers.connection], [403, 'ROLE_FORBIDDEN', 'close'], who);
        assert.deepEqual(same((await get(ctx, 'operator', '/v1/operator/pool')).json.pool), before, who);
      }
    }
    const anonymous = await call(ctx, null, route.method, route.path(held.id), route.body);
    assert.deepEqual([anonymous.status, anonymous.json.error.code], [401, 'AUTHENTICATION_REQUIRED']);
  }));
}

test('the other conductor is a conductor but owns nothing of the first: the role does not open a foreign reservation', () => withApp({}, async (ctx) => {
  const held = (await reserve(ctx, 'conductor-a', 1)).json.reservation;
  assert.equal((await get(ctx, 'conductor-b', `/v1/reservations/${held.id}`)).status, 404);
}));

const CLAIMS = [['owner', 'IDENTITY_CLAIM_REJECTED'], ['role', 'IDENTITY_CLAIM_REJECTED'], ['subject', 'IDENTITY_CLAIM_REJECTED'], ['identity', 'IDENTITY_CLAIM_REJECTED'],
  ['actingAs', 'IDENTITY_CLAIM_REJECTED'], ['lease', 'SERVER_FIELD_REJECTED'], ['leaseId', 'SERVER_FIELD_REJECTED'], ['pool', 'SERVER_FIELD_REJECTED'], ['cap', 'SERVER_FIELD_REJECTED'],
  ['caps', 'SERVER_FIELD_REJECTED'], ['price', 'SERVER_FIELD_REJECTED'], ['prices', 'SERVER_FIELD_REJECTED'], ['spend', 'SERVER_FIELD_REJECTED'], ['state', 'SERVER_FIELD_REJECTED'],
  ['id', 'SERVER_FIELD_REJECTED'], ['deadlineMs', 'SERVER_FIELD_REJECTED'], ['ttlMs', 'SERVER_FIELD_REJECTED'], ['createdAtMs', 'SERVER_FIELD_REJECTED'], ['free', 'SERVER_FIELD_REJECTED']];

test('a body that names an owner, a lease, a pool, a cap, a price, a state or a deadline is refused by name and reserves nothing', () => withApp({}, async (ctx) => {
  for (const [field, code] of CLAIMS) {
    const refused = await call(ctx, ctx.tokens['conductor-a'], 'POST', '/v1/reservations', { key: 'key-claims-001', tier: 'standard', units: 1, [field]: 'conductor-b' });
    assert.deepEqual([refused.status, refused.json.error.code, refused.json.field], [400, code, field], field);
    assert.equal(refused.headers.connection, 'close');
  }
  const unknown = await call(ctx, ctx.tokens['conductor-a'], 'POST', '/v1/reservations', { key: 'key-claims-001', tier: 'standard', units: 1, colour: 'red' });
  assert.deepEqual([unknown.status, unknown.json.error.code, unknown.json.field], [400, 'INPUT_UNKNOWN_FIELD', undefined]);
  assert.equal((await get(ctx, 'operator', '/v1/operator/pool')).json.pool.reservedUnits, 0);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('claim headers are reported by name in ignoredClaims and never honoured', () => withApp({}, async (ctx) => {
  const headers = { 'X-Lease': 'conductor-b', 'X-Owner': 'conductor-b', 'X-Role': 'operator', 'X-Pool': '999', 'X-Cap': '999', 'X-Price': '0', 'X-Spend': '0', 'X-HTTP-Method-Override': 'DELETE', 'X-Forwarded-User': 'operator' };
  const answer = await call(ctx, ctx.tokens['conductor-a'], 'POST', '/v1/reservations', { key: 'key-claims-002', tier: 'standard', units: 2 }, headers);
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.json.ignoredClaims, ['x-cap', 'x-forwarded-user', 'x-http-method-override', 'x-lease', 'x-owner', 'x-pool', 'x-price', 'x-role', 'x-spend']);
  assert.equal(answer.json.reservation.spend, 8);
  assert.equal((await get(ctx, 'conductor-b', '/v1/allowance')).json.allowance.lease.heldUnits, 0);
  assert.equal((await get(ctx, 'conductor-a', '/v1/allowance')).json.allowance.lease.heldUnits, 2);
  const asOperator = await call(ctx, ctx.tokens['conductor-a'], 'GET', '/v1/operator/pool', undefined, { 'X-Role': 'operator' });
  assert.deepEqual([asOperator.status, asOperator.json.error.code], [403, 'ROLE_FORBIDDEN']);
}));

test('a query that names a lease, an owner, a pool or anything outside the vocabulary is refused', () => withApp({}, async (ctx) => {
  await reserve(ctx, 'conductor-a', 1);
  for (const query of ['lease=conductor-b', 'owner=conductor-b', 'pool=1', 'x=1', 'limit=0', 'limit=51', 'limit=1&limit=2', 'offset=1001', 'state=bogus', 'state=reserved&state=released', 'limit=1.5']) {
    const refused = await call(ctx, ctx.tokens['conductor-a'], 'GET', `/v1/reservations?${query}`);
    assert.deepEqual([refused.status, refused.json.error.code, refused.headers.connection], [400, 'QUERY_REJECTED', 'close'], query);
  }
  for (const route of ['/v1/allowance?x=1', '/v1/me?x=1']) assert.equal((await call(ctx, ctx.tokens['conductor-a'], 'GET', route)).json.error.code, 'QUERY_NOT_ALLOWED');
}));

test('other methods and a method override are refused with 405 and no effect', () => withApp({}, async (ctx) => {
  const held = (await reserve(ctx, 'conductor-a', 1)).json.reservation;
  for (const [method, route] of [['PUT', '/v1/reservations'], ['DELETE', `/v1/reservations/${held.id}`], ['PATCH', `/v1/reservations/${held.id}`], ['GET', `/v1/reservations/${held.id}/release`], ['POST', '/v1/allowance'], ['DELETE', '/v1/batch']]) {
    const refused = await call(ctx, ctx.tokens['conductor-a'], method, route);
    assert.deepEqual([refused.status, refused.json.error.code], [405, 'METHOD_NOT_ALLOWED'], `${method} ${route}`);
  }
  const overridden = await call(ctx, ctx.tokens['conductor-a'], 'GET', `/v1/reservations/${held.id}`, undefined, { 'X-HTTP-Method-Override': 'POST' });
  assert.equal(overridden.status, 200);
  assert.equal((await get(ctx, 'conductor-a', `/v1/reservations/${held.id}`)).json.reservation.state, 'reserved');
}));
