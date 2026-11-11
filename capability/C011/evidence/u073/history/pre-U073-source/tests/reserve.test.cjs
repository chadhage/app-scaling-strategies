'use strict';

// Behavior over real HTTP: a reservation, its derived spend, the five bounds (each with a typed code that names it and no effect), their fixed order
// and the exact fits. These files also run against the retained naive stub (C011_SUBJECT_DIR) for the RED.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { bookProblems, get, reserve, same, withApp } = require('./helpers.cjs');

const world = async (ctx) => same({
  pool: (await get(ctx, 'operator', '/v1/operator/pool')).json.pool,
  a: (await get(ctx, 'conductor-a', '/v1/reservations?limit=50')).json.items,
  b: (await get(ctx, 'conductor-b', '/v1/reservations?limit=50')).json.items
});

test('a conductor reserves units: the spend is the units times the price of the tier and the books balance', () => withApp({}, async (ctx) => {
  const first = await reserve(ctx, 'conductor-a', 2);
  assert.equal(first.status, 200);
  assert.equal(first.json.outcome, 'ok');
  assert.equal(first.json.replayed, false);
  assert.equal(first.json.reservation.state, 'reserved');
  assert.deepEqual([first.json.reservation.units, first.json.reservation.spend, first.json.reservation.tier], [2, 8, 'standard']);
  assert.deepEqual(await bookProblems(ctx), []);
  const burst = await reserve(ctx, 'conductor-b', 1, { tier: 'burst' });
  assert.equal(burst.json.reservation.spend, 8);
  const { pool } = (await get(ctx, 'operator', '/v1/operator/pool')).json;
  assert.deepEqual([pool.reservedUnits, pool.reservedSpend, pool.freeUnits, pool.freeSpend], [3, 16, 7, 44]);
  assert.deepEqual(await bookProblems(ctx), []);
}));

const BOUNDS = [
  { code: 'RESERVATION_LIMIT_REACHED', setup: async (ctx) => { for (let n = 0; n < 3; n += 1) await reserve(ctx, 'conductor-a', 1); }, attempt: (ctx) => reserve(ctx, 'conductor-a', 1) },
  { code: 'LEASE_CAP_EXCEEDED', setup: async () => {}, attempt: (ctx) => reserve(ctx, 'conductor-a', 7) },
  { code: 'LEASE_SPEND_CAP_EXCEEDED', setup: async () => {}, attempt: (ctx) => reserve(ctx, 'conductor-a', 6, { tier: 'burst' }) },
  { code: 'CAPACITY_EXCEEDED', setup: async (ctx) => { await reserve(ctx, 'conductor-a', 6); }, attempt: (ctx) => reserve(ctx, 'conductor-b', 5) },
  { code: 'SPEND_EXCEEDED', setup: async (ctx) => { await reserve(ctx, 'conductor-a', 5, { tier: 'burst' }); }, attempt: (ctx) => reserve(ctx, 'conductor-b', 4, { tier: 'burst' }) }
];

for (const bound of BOUNDS) {
  test(`${bound.code}: a typed refusal that names the bound, closes the connection and changes nothing`, () => withApp({}, async (ctx) => {
    await bound.setup(ctx);
    const before = await world(ctx);
    const refused = await bound.attempt(ctx);
    assert.equal(refused.status, 409);
    assert.equal(refused.json.outcome, bound.code);
    assert.equal(refused.json.error.code, bound.code);
    assert.equal(refused.headers.connection, 'close');
    assert.deepEqual(await world(ctx), before);
    assert.deepEqual(await bookProblems(ctx), []);
  }));
}

test('the bounds are decided in a fixed order and the lease own bounds come first', () => withApp({}, async (ctx) => {
  for (let n = 0; n < 3; n += 1) await reserve(ctx, 'conductor-a', 1);
  assert.equal((await reserve(ctx, 'conductor-a', 7)).json.error.code, 'RESERVATION_LIMIT_REACHED');
}));

test('over its own cap a caller gets the lease code even where the pool would refuse too', () => withApp({}, async (ctx) => {
  await reserve(ctx, 'conductor-b', 5);
  assert.equal((await reserve(ctx, 'conductor-a', 7, { tier: 'burst' })).json.error.code, 'LEASE_CAP_EXCEEDED');
  await reserve(ctx, 'conductor-b', 1, { tier: 'burst' });
  assert.equal((await reserve(ctx, 'conductor-a', 6, { tier: 'burst' })).json.error.code, 'LEASE_SPEND_CAP_EXCEEDED');
}));

test('the pool capacity is decided before the pool spend', () => withApp({}, async (ctx) => {
  await reserve(ctx, 'conductor-b', 6);
  const refused = await reserve(ctx, 'conductor-a', 5, { tier: 'burst' });
  assert.equal(refused.json.error.code, 'CAPACITY_EXCEEDED');
}));

test('a reservation that fits exactly is admitted and the next unit is refused', () => withApp({}, async (ctx) => {
  assert.equal((await reserve(ctx, 'conductor-a', 6)).status, 200);
  assert.equal((await reserve(ctx, 'conductor-b', 4)).status, 200);
  const { pool } = (await get(ctx, 'operator', '/v1/operator/pool')).json;
  assert.deepEqual([pool.reservedUnits, pool.freeUnits], [10, 0]);
  assert.equal((await reserve(ctx, 'conductor-b', 1)).json.error.code, 'CAPACITY_EXCEEDED');
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('a spend that fits the ceiling exactly is admitted and one more unit of cost is refused', () => withApp({}, async (ctx) => {
  assert.equal((await reserve(ctx, 'conductor-a', 5, { tier: 'burst' })).status, 200);
  assert.equal((await reserve(ctx, 'conductor-b', 2, { tier: 'burst' })).status, 200);
  assert.equal((await reserve(ctx, 'conductor-b', 1, { tier: 'standard' })).status, 200);
  const { pool } = (await get(ctx, 'operator', '/v1/operator/pool')).json;
  assert.deepEqual([pool.reservedSpend, pool.freeSpend], [60, 0]);
  assert.equal((await reserve(ctx, 'conductor-b', 1)).json.error.code, 'SPEND_EXCEEDED');
  assert.deepEqual(await bookProblems(ctx), []);
}));
