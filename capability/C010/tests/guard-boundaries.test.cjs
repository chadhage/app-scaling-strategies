'use strict';

// C010 scenarios "An ended or expired lease reaches nothing" and "Hostile ids, paths, methods and fields are refused uniformly", the BOUNDARIES (rev-C010
// m7: generated mutants that only an exact boundary tells apart). A lease is alive until the millisecond of its expiry; a batch is an ARRAY of
// operations, and an object that only looks like one (a length, indexes) is refused on the field ops, never read as a list.
const assert = require('node:assert/strict');
const test = require('node:test');
const { call, same, seed, withApp } = require('./helpers.cjs');

test('a lease is alive one millisecond before its expiry and gone at the millisecond of its expiry, for the owner and for every route', () => withApp({}, async (context) => {
  const { tokens } = await seed(context);
  const token = tokens['conductor-a'];
  const lease = (await call(context, token, 'POST', '/v1/leases', { name: 'edge', ttlMs: 5000 })).json.lease;
  assert.equal(lease.expiresAtMs, context.clock.now() + 5000);
  context.clock.advance(4999);
  assert.equal((await call(context, token, 'GET', `/v1/leases/${lease.id}`)).status, 200, 'alive 1 ms before its expiry');
  assert.equal((await call(context, token, 'POST', `/v1/leases/${lease.id}/scratches`, { name: 'last' })).status, 200, 'and it takes a mutation');
  context.clock.advance(1);
  assert.equal(context.clock.now(), lease.expiresAtMs);
  for (const [method, route, body] of [['GET', `/v1/leases/${lease.id}`], ['GET', `/v1/leases/${lease.id}/scratches`], ['POST', `/v1/leases/${lease.id}/scratches`, { name: 'late' }], ['DELETE', `/v1/leases/${lease.id}`]]) {
    const answer = await call(context, token, method, route, body);
    assert.deepEqual([answer.status, answer.json.error.code], [404, 'TARGET_NOT_FOUND'], `${method} ${route} at the millisecond of the expiry`);
  }
  assert.equal((await call(context, token, 'GET', '/v1/leases')).json.items.some((item) => item.id === lease.id), false, 'it is not listed');
  const operator = await call(context, tokens.operator, 'GET', '/v1/operator/leases');
  assert.equal(operator.json.items.some((item) => item.id === lease.id), false, 'the operator does not see it either');
}));

test('a batch whose ops is not an array (an object with a length and indexes, a string, a number, null, a boolean) is refused INPUT_INVALID on the field ops, never read as a list', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const before = same(context.app.snapshot());
  const operation = { op: 'delete', lease: ids.b.lease, kind: 'scratch', id: ids.b.scratch };
  for (const ops of [{ length: 1, 0: operation }, { length: 1 }, 'x', 'delete', 5, null, true, {}]) {
    const answer = await call(context, tokens['conductor-b'], 'POST', '/v1/batch', { ops });
    assert.deepEqual([answer.status, answer.json.error.code, answer.json.field], [400, 'INPUT_INVALID', 'ops'], JSON.stringify(ops));
    assert.deepEqual(context.app.snapshot(), before, `${JSON.stringify(ops)}: nothing was applied`);
  }
  assert.equal((await call(context, tokens['conductor-b'], 'POST', '/v1/batch', { ops: [operation] })).status, 200, 'an array of the same operation is applied');
}));
