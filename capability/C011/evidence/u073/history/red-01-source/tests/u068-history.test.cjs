'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SMALL, withApp, reserve, release, get, call, bookProblems } = require('./helpers.cjs');
const config = { ...SMALL, maxActive: 1, entries: 2, keyEntries: 4, ttlMs: 1000 };
const ended = async (ctx, who, key) => {
  const made = await reserve(ctx, who, 1, { key });
  assert.equal(made.status, 200);
  assert.equal((await release(ctx, who, made.json.reservation.id)).status, 200);
  return made.json.reservation;
};
const pool = async (ctx) => (await get(ctx, 'operator', '/v1/operator/pool')).json.pool;

test('U068 released key survives visible-history eviction and never allocates again', () => withApp({ app: { config } }, async (ctx) => {
  const first = await ended(ctx, 'conductor-a', 'history-origin-01');
  const other = (await reserve(ctx, 'conductor-b', 2, { key: 'history-neighbour' })).json.reservation;
  await ended(ctx, 'conductor-a', 'history-filler-01');
  await ended(ctx, 'conductor-a', 'history-filler-02');
  const before = await pool(ctx);
  const retried = await reserve(ctx, 'conductor-a', 1, { key: 'history-origin-01' });
  assert.equal(retried.json.reservation.id, first.id, 'same key must retain the original server-lifetime identity');
  assert.deepEqual([retried.status, retried.json.replayed, retried.json.reservation.state], [200, true, 'released']);
  assert.deepEqual(await pool(ctx), before);
  assert.equal((await get(ctx, 'conductor-a', `/v1/reservations/${first.id}`)).status, 404, 'visible history remains separately bounded');
  assert.deepEqual((await get(ctx, 'conductor-b', `/v1/reservations/${other.id}`)).json.reservation, other);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('U068 expired key survives history eviction with its exact deadline and no new spend', () => withApp({ app: { config } }, async (ctx) => {
  const first = (await reserve(ctx, 'conductor-a', 1, { key: 'expiry-origin-01' })).json.reservation;
  ctx.clock.advance(first.deadlineMs - ctx.clock.now());
  const expired = await get(ctx, 'conductor-a', `/v1/reservations/${first.id}`);
  assert.equal(expired.json.reservation.state, 'expired');
  const other = (await reserve(ctx, 'conductor-b', 2, { key: 'expiry-neighbour' })).json.reservation;
  await ended(ctx, 'conductor-a', 'expiry-filler-01');
  await ended(ctx, 'conductor-a', 'expiry-filler-02');
  const before = await pool(ctx);
  const retried = await reserve(ctx, 'conductor-a', 1, { key: 'expiry-origin-01' });
  assert.deepEqual([retried.status, retried.json.replayed, retried.json.reservation.id, retried.json.reservation.state, retried.json.reservation.deadlineMs],
    [200, true, first.id, 'expired', first.deadlineMs]);
  assert.deepEqual(await pool(ctx), before);
  assert.deepEqual((await get(ctx, 'conductor-b', `/v1/reservations/${other.id}`)).json.reservation, other);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('U068 full ledger refuses a new key but old keys still replay and conflict without another lease effect', () => withApp({ app: { config: { ...config, keyEntries: 3 } } }, async (ctx) => {
  const first = await ended(ctx, 'conductor-a', 'ledger-origin-01');
  await ended(ctx, 'conductor-a', 'ledger-filler-01');
  await ended(ctx, 'conductor-a', 'ledger-filler-02');
  const other = (await reserve(ctx, 'conductor-b', 2, { key: 'ledger-origin-01' })).json.reservation;
  const before = await pool(ctx);
  const denied = await reserve(ctx, 'conductor-a', 1, { key: 'ledger-new-key-01' });
  assert.deepEqual([denied.status, denied.json.error.code], [409, 'IDEMPOTENCY_LIMIT_REACHED']);
  assert.equal(denied.headers.connection, 'close');
  assert.deepEqual(await pool(ctx), before);
  const replay = await reserve(ctx, 'conductor-a', 1, { key: 'ledger-origin-01' });
  assert.deepEqual([replay.status, replay.json.replayed, replay.json.reservation.id, replay.json.reservation.state], [200, true, first.id, 'released']);
  const conflict = await reserve(ctx, 'conductor-a', 2, { key: 'ledger-origin-01' });
  assert.deepEqual([conflict.status, conflict.json.error.code], [409, 'IDEMPOTENCY_CONFLICT']);
  assert.deepEqual(await pool(ctx), before);
  assert.deepEqual((await get(ctx, 'conductor-b', `/v1/reservations/${other.id}`)).json.reservation, other);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('U068 identical cross-lease keys are independent after eviction and at one full ledger', () => withApp({ app: { config: { ...config, keyEntries: 3 } } }, async (ctx) => {
  const a = await ended(ctx, 'conductor-a', 'shared-history-key');
  await ended(ctx, 'conductor-a', 'shared-filler-01');
  await ended(ctx, 'conductor-a', 'shared-filler-02');
  const b = await reserve(ctx, 'conductor-b', 1, { key: 'shared-history-key' });
  assert.equal(b.status, 200);
  assert.notEqual(b.json.reservation.id, a.id);
  assert.equal(b.json.replayed, false);
  const replay = await reserve(ctx, 'conductor-a', 1, { key: 'shared-history-key' });
  assert.deepEqual([replay.json.reservation.id, replay.json.replayed, replay.json.reservation.state], [a.id, true, 'released']);
  assert.equal((await get(ctx, 'conductor-b', `/v1/reservations/${b.json.reservation.id}`)).json.reservation.state, 'reserved');
}));

test('U068 atomic failed batch consumes no key and releases no standing reservation', () => withApp({ app: { config: { ...SMALL, maxActive: 2, entries: 3, keyEntries: 2 } } }, async (ctx) => {
  const first = (await reserve(ctx, 'conductor-a', 1, { key: 'batch-standing-01' })).json.reservation;
  const before = await pool(ctx);
  const failed = await call(ctx, ctx.tokens['conductor-a'], 'POST', '/v1/batch', { ops: [
    { op: 'release', id: first.id }, { op: 'reserve', key: 'batch-attempt-01', tier: 'standard', units: 1 },
    { op: 'reserve', key: 'batch-attempt-02', tier: 'standard', units: 1 }
  ] });
  assert.deepEqual([failed.status, failed.json.error.code, failed.json.opIndex], [409, 'IDEMPOTENCY_LIMIT_REACHED', 2]);
  assert.deepEqual(await pool(ctx), before);
  assert.equal((await get(ctx, 'conductor-a', `/v1/reservations/${first.id}`)).json.reservation.state, 'reserved');
  const fresh = await reserve(ctx, 'conductor-a', 1, { key: 'batch-attempt-01' });
  assert.deepEqual([fresh.status, fresh.json.replayed], [200, false]);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('U068 own replay allowance is reconciled and is independent of the other lease', () => withApp({ app: { config: { ...config, keyEntries: 3 } } }, async (ctx) => {
  await ended(ctx, 'conductor-a', 'allowance-key-01');
  const own = (await get(ctx, 'conductor-a', '/v1/allowance')).json.allowance?.lease ?? {};
  assert.deepEqual([own.replayKeys, own.maxReplayKeys, own.remainingReplayKeys], [1, 3, 2]);
  await ended(ctx, 'conductor-b', 'allowance-key-02');
  assert.deepEqual((await get(ctx, 'conductor-a', '/v1/allowance')).json.allowance.lease, own);
}));
