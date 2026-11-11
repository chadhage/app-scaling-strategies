'use strict';

// Idempotency keys: a retry returns the SAME reservation and reserves nothing more; the same key with another body is a typed conflict; keys are scoped
// per lease, so another lease's identical key is independent and tells it nothing; a retry after a release or an expiry still answers the same
// reservation and reserves nothing.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { bookProblems, call, get, release, reserve, withApp } = require('./helpers.cjs');

const poolOf = async (ctx) => (await get(ctx, 'operator', '/v1/operator/pool')).json.pool;

test('a retry with the same key and the same body returns the same reservation and reserves nothing more', () => withApp({}, async (ctx) => {
  const first = await reserve(ctx, 'conductor-a', 3, { key: 'key-retry-0001' });
  const second = await reserve(ctx, 'conductor-a', 3, { key: 'key-retry-0001' });
  assert.equal(second.status, 200);
  assert.equal(second.json.replayed, true);
  assert.deepEqual(second.json.reservation, first.json.reservation);
  assert.equal((await poolOf(ctx)).reservedUnits, 3);
  assert.equal((await get(ctx, 'conductor-a', '/v1/reservations')).json.total, 1);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('the same key with another body is a typed conflict that closes the connection and changes nothing', () => withApp({}, async (ctx) => {
  const first = await reserve(ctx, 'conductor-a', 3, { key: 'key-conflict-01' });
  for (const [units, tier] of [[4, 'standard'], [3, 'burst'], [1, 'burst']]) {
    const refused = await reserve(ctx, 'conductor-a', units, { key: 'key-conflict-01', tier });
    assert.equal(refused.status, 409);
    assert.equal(refused.json.error.code, 'IDEMPOTENCY_CONFLICT');
    assert.equal(refused.headers.connection, 'close');
  }
  assert.deepEqual((await get(ctx, 'conductor-a', `/v1/reservations/${first.json.reservation.id}`)).json.reservation, first.json.reservation);
  assert.equal((await poolOf(ctx)).reservedUnits, 3);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('keys are scoped per lease: another lease with the same key is independent and nothing tells it that the key was used', async () => {
  const shape = async (usedBefore) => withApp({}, async (ctx) => {
    if (usedBefore) await reserve(ctx, 'conductor-a', 2, { key: 'key-shared-001' });
    const sameBody = await reserve(ctx, 'conductor-b', 2, { key: 'key-shared-001' });
    const otherBody = await reserve(ctx, 'conductor-b', 1, { key: 'key-shared-002', tier: 'burst' });
    const clash = await reserve(ctx, 'conductor-b', 3, { key: 'key-shared-001' });
    return {
      sameBody: [sameBody.status, sameBody.json.replayed, Object.keys(sameBody.json.reservation).join()],
      otherBody: [otherBody.status, otherBody.json.replayed],
      // The conflict only exists inside the lease that used the key: after b used it, b's own other body clashes.
      clash: [clash.status, clash.json.error.code], units: (await poolOf(ctx)).reservedUnits
    };
  });
  const used = await shape(true);
  const fresh = await shape(false);
  assert.deepEqual(used.sameBody, fresh.sameBody);
  assert.deepEqual(used.otherBody, fresh.otherBody);
  assert.deepEqual(used.clash, [409, 'IDEMPOTENCY_CONFLICT']);
  assert.deepEqual(used.clash, fresh.clash);
  assert.equal(used.units, fresh.units + 2);
});

test('the identical key and body of another lease never replays the reservation of the first', () => withApp({}, async (ctx) => {
  const mine = await reserve(ctx, 'conductor-a', 2, { key: 'key-twin-00001' });
  const theirs = await reserve(ctx, 'conductor-b', 2, { key: 'key-twin-00001' });
  assert.equal(theirs.status, 200);
  assert.equal(theirs.json.replayed, false);
  assert.notEqual(theirs.json.reservation.id, mine.json.reservation.id);
  assert.equal((await poolOf(ctx)).reservedUnits, 4);
  assert.equal((await reserve(ctx, 'conductor-a', 2, { key: 'key-twin-00001' })).json.reservation.id, mine.json.reservation.id);
}));

test('a retry after a release or an expiry answers the same reservation and reserves nothing', () => withApp({}, async (ctx) => {
  const freed = await reserve(ctx, 'conductor-a', 2, { key: 'key-ended-0001' });
  await release(ctx, 'conductor-a', freed.json.reservation.id);
  const lapsed = await reserve(ctx, 'conductor-a', 2, { key: 'key-ended-0002' });
  ctx.clock.advance(lapsed.json.reservation.deadlineMs - ctx.clock.now());
  const retryFreed = await reserve(ctx, 'conductor-a', 2, { key: 'key-ended-0001' });
  const retryLapsed = await reserve(ctx, 'conductor-a', 2, { key: 'key-ended-0002' });
  assert.deepEqual([retryFreed.json.reservation.id, retryFreed.json.reservation.state, retryFreed.json.replayed], [freed.json.reservation.id, 'released', true]);
  assert.deepEqual([retryLapsed.json.reservation.id, retryLapsed.json.reservation.state, retryLapsed.json.replayed], [lapsed.json.reservation.id, 'expired', true]);
  assert.equal((await poolOf(ctx)).reservedUnits, 0);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('a key of another shape or a missing key is refused and reserves nothing', () => withApp({}, async (ctx) => {
  const token = ctx.tokens['conductor-a'];
  const missing = await call(ctx, token, 'POST', '/v1/reservations', { tier: 'standard', units: 1 });
  assert.deepEqual([missing.status, missing.json.error.code, missing.json.field], [400, 'INPUT_MISSING_FIELD', 'key']);
  for (const key of ['short', 'a'.repeat(65), 'bad key 12345', 'key/with/slash1', '-leading-dash1', 'ключ-ключ-ключ', 7, null, ['key-array-0001'], { k: 1 }, true]) {
    const refused = await call(ctx, token, 'POST', '/v1/reservations', { key, tier: 'standard', units: 1 });
    assert.deepEqual([refused.status, refused.json.error.code, refused.json.field], [400, 'INPUT_INVALID', 'key'], JSON.stringify(key));
  }
  assert.equal((await poolOf(ctx)).reservedUnits, 0);
}));
