'use strict';

// Release and expiry return exactly what was reserved, once. Time is the injected clock of the fixture: nothing here sleeps to cross a deadline.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { bookProblems, get, release, reserve, withApp } = require('./helpers.cjs');

const poolOf = async (ctx) => (await get(ctx, 'operator', '/v1/operator/pool')).json.pool;
const stateOf = async (ctx, who, id) => (await get(ctx, who, `/v1/reservations/${id}`)).json.reservation;

test('a release returns exactly the units and the spend that were reserved, to the pool and to the lease', () => withApp({}, async (ctx) => {
  const mine = (await reserve(ctx, 'conductor-a', 3, { tier: 'burst' })).json.reservation;
  const theirs = (await reserve(ctx, 'conductor-b', 2)).json.reservation;
  const freed = await release(ctx, 'conductor-a', mine.id);
  assert.equal(freed.status, 200);
  assert.deepEqual([freed.json.reservation.state, freed.json.replayed, freed.json.reservation.units, freed.json.reservation.spend], ['released', false, 3, 24]);
  const pool = await poolOf(ctx);
  assert.deepEqual([pool.reservedUnits, pool.reservedSpend, pool.freeUnits, pool.freeSpend], [2, 8, 8, 52]);
  const { lease } = (await get(ctx, 'conductor-a', '/v1/allowance')).json.allowance;
  assert.deepEqual([lease.heldUnits, lease.heldSpend, lease.remainingUnits, lease.remainingSpend], [0, 0, 6, 40]);
  assert.deepEqual(await stateOf(ctx, 'conductor-b', theirs.id), theirs);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('a second release answers the same reservation, says replayed and returns nothing twice', () => withApp({}, async (ctx) => {
  const held = (await reserve(ctx, 'conductor-a', 4)).json.reservation;
  await reserve(ctx, 'conductor-b', 3);
  const first = await release(ctx, 'conductor-a', held.id);
  const second = await release(ctx, 'conductor-a', held.id);
  assert.equal(second.status, 200);
  assert.deepEqual([first.json.replayed, second.json.replayed], [false, true]);
  assert.deepEqual(second.json.reservation, first.json.reservation);
  const pool = await poolOf(ctx);
  assert.deepEqual([pool.reservedUnits, pool.freeUnits], [3, 7]);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('expiry returns the units at the deadline of the injected clock and not a millisecond before', () => withApp({}, async (ctx) => {
  const held = (await reserve(ctx, 'conductor-a', 3)).json.reservation;
  ctx.clock.advance(held.deadlineMs - ctx.clock.now() - 1);
  assert.equal((await stateOf(ctx, 'conductor-a', held.id)).state, 'reserved');
  assert.equal((await poolOf(ctx)).reservedUnits, 3);
  ctx.clock.advance(1);
  assert.equal((await stateOf(ctx, 'conductor-a', held.id)).state, 'expired');
  const pool = await poolOf(ctx);
  assert.deepEqual([pool.reservedUnits, pool.reservedSpend], [0, 0]);
  assert.equal((await get(ctx, 'conductor-a', '/v1/reservations?state=expired')).json.total, 1);
  assert.equal((await get(ctx, 'conductor-a', '/v1/reservations?state=reserved')).json.total, 0);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('an expired reservation cannot be released again, reused or spent twice, and its capacity can be reserved again', () => withApp({}, async (ctx) => {
  const held = (await reserve(ctx, 'conductor-a', 6)).json.reservation;
  ctx.clock.advance(held.deadlineMs - ctx.clock.now());
  const late = await release(ctx, 'conductor-a', held.id);
  assert.deepEqual([late.status, late.json.reservation.state, late.json.replayed], [200, 'expired', true]);
  assert.equal((await poolOf(ctx)).reservedUnits, 0);
  assert.equal((await reserve(ctx, 'conductor-a', 6)).status, 200);
  assert.equal((await release(ctx, 'conductor-a', held.id)).json.reservation.state, 'expired');
  assert.equal((await poolOf(ctx)).reservedUnits, 6);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('the reservations of the other lease keep their units, spend, state and deadline across a release and an expiry', () => withApp({}, async (ctx) => {
  const lapsing = (await reserve(ctx, 'conductor-a', 2)).json.reservation;
  ctx.clock.advance(5000);
  const theirs = (await reserve(ctx, 'conductor-b', 3, { tier: 'burst' })).json.reservation;
  const freed = (await reserve(ctx, 'conductor-a', 2)).json.reservation;
  await release(ctx, 'conductor-a', freed.id);
  assert.deepEqual(await stateOf(ctx, 'conductor-b', theirs.id), theirs);
  ctx.clock.advance(lapsing.deadlineMs - ctx.clock.now());
  assert.equal((await stateOf(ctx, 'conductor-a', lapsing.id)).state, 'expired');
  assert.deepEqual(await stateOf(ctx, 'conductor-b', theirs.id), theirs);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('each reservation expires at its own deadline', () => withApp({}, async (ctx) => {
  const early = (await reserve(ctx, 'conductor-a', 2)).json.reservation;
  ctx.clock.advance(1000);
  const later = (await reserve(ctx, 'conductor-a', 2)).json.reservation;
  ctx.clock.advance(early.deadlineMs - ctx.clock.now());
  assert.deepEqual([(await stateOf(ctx, 'conductor-a', early.id)).state, (await stateOf(ctx, 'conductor-a', later.id)).state], ['expired', 'reserved']);
  assert.equal((await poolOf(ctx)).reservedUnits, 2);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('the history of a lease is bounded: the oldest ended reservation goes first and its id becomes absent', () => withApp({}, async (ctx) => {
  const ids = [];
  for (let n = 0; n < 9; n += 1) {
    const held = (await reserve(ctx, 'conductor-a', 1)).json.reservation;
    ids.push(held.id);
    await release(ctx, 'conductor-a', held.id);
  }
  const listed = (await get(ctx, 'conductor-a', '/v1/reservations?limit=50')).json;
  assert.equal(listed.total, 6);
  assert.deepEqual(listed.items.map((item) => item.id), ids.slice(3));
  const gone = await get(ctx, 'conductor-a', `/v1/reservations/${ids[0]}`);
  assert.deepEqual([gone.status, gone.json.error.code], [404, 'RESERVATION_NOT_FOUND']);
  assert.deepEqual(await bookProblems(ctx), []);
}));
