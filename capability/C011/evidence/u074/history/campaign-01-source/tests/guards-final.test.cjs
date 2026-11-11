'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { test } = require('node:test');
const contract = require('../contract.js');
const { createStore } = require('../store.cjs');
const { startLocal } = require('../server.cjs');
const { SMALL, call, fakeClock, planHooks, reserve, sequentialIds, withApp } = require('./helpers.cjs');

test('a foreign batch is refused before the commit gate; an own-only batch reaches it once', async () => {
  const plan = planHooks();
  await withApp({ app: { hooks: plan.hooks } }, async (ctx) => {
    const foreign = (await reserve(ctx, 'conductor-a', 1)).json.reservation;
    const before = ctx.app.snapshot();
    let arrivals = 0;
    plan.arm('batch', () => { arrivals += 1; });
    const rejected = await call(ctx, ctx.tokens['conductor-b'], 'POST', '/v1/batch',
      { ops: [{ op: 'reserve', key: 'batch-guard-own', tier: 'standard', units: 1 }, { op: 'release', id: foreign.id }] });
    assert.equal(rejected.status, 404);
    assert.equal(rejected.json.error.code, 'RESERVATION_NOT_FOUND');
    assert.equal(rejected.json.opIndex, 1);
    assert.equal(arrivals, 0, 'foreign batch never enters the commit queue');
    assert.deepEqual(ctx.app.snapshot(), before);
    const accepted = await call(ctx, ctx.tokens['conductor-b'], 'POST', '/v1/batch',
      { ops: [{ op: 'reserve', key: 'batch-guard-own', tier: 'standard', units: 1 }] });
    assert.equal(accepted.status, 200);
    assert.equal(arrivals, 1, 'positive control consumes the still-armed hook once');
  });
});

test('URL character boundary is exactly 2048; header values cannot masquerade as claim header names', () =>
  withApp({}, async (ctx) => {
    for (const [length, expected] of [[2047, 'NOT_FOUND'], [2048, 'NOT_FOUND'], [2049, 'URL_TOO_LONG']]) {
      const answer = await call(ctx, ctx.tokens['conductor-a'], 'GET', '/' + 'x'.repeat(length - 1));
      assert.equal(answer.json.error.code, expected, `target length ${length}`);
      assert.equal(answer.headers.connection, 'close');
    }
    const innocent = await call(ctx, ctx.tokens['conductor-a'], 'GET', '/v1/me', undefined, { Accept: 'x-lease', 'X-Note': 'x-price' });
    assert.deepEqual(innocent.json.ignoredClaims, []);
    const claim = await call(ctx, ctx.tokens['conductor-a'], 'GET', '/v1/me', undefined, { 'X-Lease': 'fictional-other' });
    assert.deepEqual(claim.json.ignoredClaims, ['x-lease']);
    assert.equal(claim.json.subject, 'conductor-a');
  }));

test('startLocal explicitly requests IPv4 loopback port zero, twice; no fixed-port mutant is ever bound', async () => {
  const original = http.Server.prototype.listen;
  const requested = [];
  http.Server.prototype.listen = function (port, host, ...rest) {
    assert.equal(port, 0, 'startLocal must explicitly request an ephemeral port');
    assert.equal(host, '127.0.0.1', 'startLocal must bind IPv4 loopback only');
    requested.push([port, host]);
    return original.call(this, port, host, ...rest);
  };
  const instances = [];
  try {
    instances.push(await startLocal(), await startLocal());
    assert.equal(requested.length, 2);
    assert.notEqual(instances[0].app.server.address().port, instances[1].app.server.address().port);
    for (const instance of instances) assert.equal(instance.app.server.address().address, '127.0.0.1');
  } finally {
    http.Server.prototype.listen = original;
    for (const instance of instances) await instance.close();
  }
});

test('visited counts actual complete record scans, starting at zero, not merely equal foreign and absent work', () => {
  const clock = fakeClock();
  const store = createStore({ config: contract.resolveConfig(SMALL), now: clock.now, newId: sequentialIds() });
  assert.deepEqual(store.stats(), { visited: 0 });
  for (let index = 0; index < 3; index += 1) {
    assert.equal(store.reserve('conductor-a', { key: `scan-key-00${index}`, tier: 'standard', units: 1 }).ok, true);
  }
  assert.equal(store.stats().visited, 3, 'reserve scans zero, one, then two existing records');
  for (const id of ['rsv-00000001', 'rsv-ffffffff']) {
    const before = store.stats().visited;
    store.read('conductor-a', id);
    assert.equal(store.stats().visited - before, 3, 'each lookup visits every own record exactly once');
  }
  const before = store.stats().visited;
  assert.equal(store.read('conductor-b', 'rsv-00000001').ok, false);
  assert.equal(store.stats().visited - before, 0, 'foreign lookups do not traverse another lease');
});

function attackReturned(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) continue;
    attackReturned(descriptor.value, seen);
    if (typeof descriptor.value === 'object' && descriptor.value !== null) continue;
    try { value[key] = typeof descriptor.value === 'number' ? 999999 : 'tampered'; }
    catch (error) { assert.ok(error instanceof TypeError); }
  }
  try { value.injected = { units: -999 }; }
  catch (error) { assert.ok(error instanceof TypeError); }
}

test('a generic walker attacks every reachable public store return without changing later books or another lease', () => {
  const clock = fakeClock();
  const store = createStore({ config: contract.resolveConfig(SMALL), now: clock.now, newId: sequentialIds() });
  const first = store.reserve('conductor-a', { key: 'return-first-key', tier: 'standard', units: 1 });
  store.reserve('conductor-b', { key: 'return-other-key', tier: 'burst', units: 1 });
  const id = first.value.reservation.id;
  const query = { limit: 50, offset: 0, state: null };
  const readAll = () => ({
    snapshot: store.snapshot(), allowance: store.allowance('conductor-a'), pool: store.operatorPool(),
    list: store.list('conductor-a', query), read: store.read('conductor-a', id), missing: store.read('conductor-a', 'rsv-ffffffff')
  });
  const before = readAll();
  for (const returned of [first, ...Object.values(readAll()), store.stats()]) attackReturned(returned);
  assert.deepEqual(readAll(), before);
  const released = store.release('conductor-a', id);
  const afterRelease = readAll();
  attackReturned(released);
  assert.deepEqual(readAll(), afterRelease);
  clock.advance(300000);
  const expired = store.operatorPool();
  const afterExpiry = readAll();
  attackReturned(expired);
  assert.deepEqual(readAll(), afterExpiry);
});
