'use strict';

// C010 scenarios "A conductor reaches its own resources with every verb" and "Another conductor's resources are inaccessible for every
// kind and every verb": an IDOR table. Every attack is sent by every identity that is not the owner and must leave the full server
// state byte-identical; the same request by the owner works (a refusal that also refuses the owner would pass the attacks vacuously).
const assert = require('node:assert/strict');
const test = require('node:test');
const { call, same, seed, target, withApp } = require('./helpers.cjs');

const T = { lease: 'lease', run: 'run', scratch: 'scratch', export: 'export' };
// verb, kind, method, route suffix after the target, body builder
const ROWS = [
  ['read', 'lease', 'GET', (i) => target(i, T.lease)],
  ['list', 'runs', 'GET', (i) => `/v1/leases/${i.lease}/runs`],
  ['list', 'scratches', 'GET', (i) => `/v1/leases/${i.lease}/scratches`],
  ['list', 'exports', 'GET', (i) => `/v1/leases/${i.lease}/exports`],
  ['create', 'run', 'POST', (i) => `/v1/leases/${i.lease}/runs`, () => ({ name: 'evil', units: 1 })],
  ['create', 'scratch', 'POST', (i) => `/v1/leases/${i.lease}/scratches`, () => ({ name: 'evil' })],
  ['create', 'export', 'POST', (i) => `/v1/leases/${i.lease}/exports`, (i) => ({ name: 'evil', runId: i.run })],
  ['read', 'run', 'GET', (i) => target(i, T.run)],
  ['read', 'scratch', 'GET', (i) => target(i, T.scratch)],
  ['read', 'export', 'GET', (i) => target(i, T.export)],
  ['update', 'run', 'PATCH', (i) => target(i, T.run), () => ({ units: 99 })],
  ['update', 'scratch', 'PATCH', (i) => target(i, T.scratch), () => ({ name: 'evil' })],
  ['cancel', 'run', 'POST', (i) => `${target(i, T.run)}/cancel`],
  ['delete', 'run', 'DELETE', (i) => target(i, T.run)],
  ['delete', 'scratch', 'DELETE', (i) => target(i, T.scratch)],
  ['delete', 'export', 'DELETE', (i) => target(i, T.export)],
  ['end', 'lease', 'DELETE', (i) => target(i, T.lease)]
];
const ATTACKERS = [
  ['conductor-b', 404, 'TARGET_NOT_FOUND'],
  ['visitor', 403, 'ROLE_FORBIDDEN'],
  ['operator', 403, 'ROLE_FORBIDDEN'],
  [null, 401, 'AUTHENTICATION_REQUIRED']
];

for (const [verb, kind, method, route, body] of ROWS) {
  test(`the owner reaches its own ${kind} with ${verb} (${method}) and the answer shows only its own data`, () => withApp({}, async (context) => {
    const { tokens, ids } = await seed(context);
    const before = same(context.app.snapshot());
    const answer = await call(context, tokens['conductor-a'], method, route(ids.a), body && body(ids.a));
    assert.equal(answer.status, 200, answer.text);
    assert.equal(answer.json.outcome, 'ok');
    assert.equal(answer.text.includes(ids.b.lease), false, 'the answer names nothing of the other conductor');
    for (const foreign of [ids.b.run, ids.b.scratch, ids.b.export, 'conductor-b']) assert.equal(answer.text.includes(foreign), false, `the answer must not mention ${foreign}`);
    if (method === 'GET') assert.deepEqual(context.app.snapshot(), before, 'a read changes nothing');
    else assert.notDeepEqual(context.app.snapshot(), before, 'a permitted mutation takes effect');
  }));

  test(`another conductor's ${kind} cannot be reached with ${verb} (${method}): the same request by every other identity changes nothing`, () => withApp({}, async (context) => {
    const { tokens, ids } = await seed(context);
    const before = same(context.app.snapshot());
    for (const [identity, status, code] of ATTACKERS) {
      const answer = await call(context, identity && tokens[identity], method, route(ids.a), body && body(ids.a));
      assert.equal(answer.status, status, `${identity} ${verb} ${kind}: ${answer.text}`);
      assert.equal(answer.json?.error?.code, code, `${identity} ${verb} ${kind}`);
      assert.equal(answer.headers.connection, 'close', 'a refusal closes the connection');
      assert.deepEqual(context.app.snapshot(), before, `${identity} ${verb} ${kind} must have no effect`);
      for (const secret of [ids.a.lease, ids.a.run, ids.a.scratch, ids.a.export, 'run-a', 'scratch-a', 'lease-a', 'conductor-a']) {
        assert.equal(answer.text.includes(secret), false, `the refusal must not echo or reveal ${secret}`);
      }
    }
  }));
}

test('the owner of a lease is the subject of the verified token: a lease created by conductor-b is not reachable by conductor-a', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const created = await call(context, tokens['conductor-b'], 'POST', '/v1/leases', { name: 'fresh', ttlMs: 60000 });
  assert.equal(created.status, 200);
  const route = `/v1/leases/${created.json.lease.id}`;
  assert.equal((await call(context, tokens['conductor-b'], 'GET', route)).status, 200);
  const stolen = await call(context, tokens['conductor-a'], 'GET', route);
  assert.equal(stolen.status, 404);
  assert.equal(stolen.json.error.code, 'TARGET_NOT_FOUND');
  const owners = context.app.snapshot().leases.map((lease) => [lease.id, lease.owner]);
  assert.deepEqual(owners.find(([id]) => id === created.json.lease.id), [created.json.lease.id, 'conductor-b']);
  assert.deepEqual(owners.find(([id]) => id === ids.a.lease), [ids.a.lease, 'conductor-a']);
}));
