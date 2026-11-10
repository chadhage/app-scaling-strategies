'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { call, load, sequentialIds, withApp } = require('./helpers.cjs');

test('U057 default ownerEntries: the actual default server accepts entry 100 and refuses entry 101', () => withApp({}, async (context) => {
  const token = context.app.issueToken('conductor-a');
  for (let entry = 1; entry <= 100; entry += 1) {
    const answer = await call(context, token, 'POST', '/v1/leases', { name: `entry-${entry}`, ttlMs: 600000 });
    assert.equal(answer.status, 200, `actual default accepts entry ${entry}`);
  }
  assert.equal(context.app.snapshot().leases.length, 100, '100 real entries were committed without a limits override');
  const answer = await call(context, token, 'POST', '/v1/leases', { name: 'entry-101', ttlMs: 600000 });
  assert.equal(answer.status, 409, 'the actual default refuses entry 101');
  assert.equal(answer.json.error.code, 'OWNER_QUOTA_FULL');
  assert.equal(context.app.snapshot().leases.length, 100, 'the refused entry has no effect');
}));

test('U057 default urlChars: a target of 2048 characters is routed and 2049 is URL_TOO_LONG', () => withApp({}, async (context) => {
  const token = context.app.issueToken('conductor-a');
  const target = (length) => '/' + 'x'.repeat(length - 1);
  const routed = await call(context, token, 'GET', target(2048));
  assert.equal(routed.status, 404, '2048 characters reach the closed route table');
  assert.equal(routed.json.error.code, 'NOT_FOUND');
  const over = await call(context, token, 'GET', target(2049));
  assert.equal(over.status, 414, '2049 characters exceed the actual default');
  assert.equal(over.json.error.code, 'URL_TOO_LONG');
}));

test('U057 run units boundary: 100 is accepted and 101 is INPUT_INVALID', () => {
  const contract = load('contract.js');
  for (const schema of ['run', 'run.patch']) {
    assert.deepEqual(contract.validateBody(schema, { name: 'edge', units: 100 }), { ok: true, value: { name: 'edge', units: 100 } }, `${schema} accepts 100 units`);
    assert.deepEqual(contract.validateBody(schema, { name: 'edge', units: 101 }), { ok: false, code: 'INPUT_INVALID', field: 'units' }, `${schema} refuses 101 units`);
  }
});

test('U057 visited starts at exactly zero before any actual store pass', () => {
  const { createStore } = load('store.cjs');
  const store = createStore({ ownerEntries: 100, owners: ['conductor-a', 'conductor-b'] });
  assert.deepEqual(store.stats(), { visited: 0 });
});

test('U057 visited counts actual elements on each lease and resource pass, not just equality of lookups', () => {
  const { createStore } = load('store.cjs');
  let now = 1000000;
  const store = createStore({ now: () => now, newId: sequentialIds(), ownerEntries: 100, owners: ['conductor-a', 'conductor-b'] });
  const leases = ['conductor-a', 'conductor-b', 'conductor-a'].map((subject, index) => {
    const made = store.apply(subject, 'createLease', { name: `lease-${index}`, ttlMs: 600000 });
    assert.equal(made.ok, true);
    return made.value.lease.id;
  });
  const resources = [];
  for (let index = 0; index < 4; index += 1) {
    const before = store.stats().visited;
    const made = store.apply('conductor-a', 'createResource', { lease: leases[0], kind: 'run', input: { name: `run-${index}`, units: 1 } });
    assert.equal(made.ok, true);
    assert.equal(store.stats().visited - before, 3, 'creating a run actually visits all three leases');
    resources.push(made.value.resource.id);
  }
  const pass = (expected, run, label) => {
    const before = store.stats().visited;
    run();
    assert.equal(store.stats().visited - before, expected, label);
  };
  pass(3, () => store.readLease('conductor-a', leases[0]), 'own lease: three visits');
  pass(3, () => store.readLease('conductor-a', leases[1]), 'foreign lease: three visits');
  pass(3, () => store.readLease('conductor-a', 'lease-ffffffff'), 'absent lease: three visits');
  pass(7, () => store.readResource('conductor-a', leases[0], 'run', resources[0]), 'first run: three leases plus all four runs');
  pass(7, () => store.readResource('conductor-a', leases[0], 'run', resources[3]), 'last run: the same full passes');
  pass(7, () => store.readResource('conductor-a', leases[0], 'run', 'run-ffffffff'), 'absent run: the same full passes');
  pass(3, () => store.readResource('conductor-b', leases[0], 'run', resources[0]), 'foreign lease: no resource pass');
  now += 600001;
  pass(3, () => store.readLease('conductor-a', leases[0]), 'expired lease: still three actual visits');
});

test('U057 claimedHeaders reads header names only: Accept x-lease is not an ignored claim', () => withApp({}, async (context) => {
  const token = context.app.issueToken('conductor-a');
  const value = await call(context, token, 'GET', '/v1/me', undefined, { Accept: 'x-lease' });
  assert.equal(value.status, 200);
  assert.deepEqual(value.json.ignoredClaims, [], 'a header VALUE is not a claimed header name');
  const name = await call(context, token, 'GET', '/v1/me', undefined, { 'X-Lease': 'fictional' });
  assert.deepEqual(name.json.ignoredClaims, ['x-lease'], 'an actual claim header is reported by name');
}));

test('U057 startLocal requests port zero on loopback and returns the actual responsive automatic port', async (t) => {
  const listen = http.Server.prototype.listen;
  const calls = [];
  t.mock.method(http.Server.prototype, 'listen', function (...args) {
    calls.push(args.slice(0, 2));
    assert.equal(args[0], 0, 'startLocal must request an automatic port, not fixed port 1');
    assert.equal(args[1], '127.0.0.1');
    return listen.apply(this, args);
  });
  let local;
  try {
    local = await load('server.cjs').startLocal();
    assert.deepEqual(calls, [[0, '127.0.0.1']]);
    assert.equal(local.port, local.app.server.address().port);
    assert.ok(Number.isInteger(local.port) && local.port > 0);
    assert.equal(local.origin, `http://127.0.0.1:${local.port}`);
    assert.equal((await call(local, local.tokens['conductor-a'], 'GET', '/v1/me')).status, 200);
  } finally {
    if (local) await local.close();
  }
});
