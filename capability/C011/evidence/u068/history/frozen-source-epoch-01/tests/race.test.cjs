'use strict';

// Real concurrency over real loopback sockets, one connection per request: the last unit goes to exactly one request, a lease cap and a pool are
// never over-admitted, two leases racing one pool never consume each other's reservation, and one key sent many times reserves once.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { bookProblems, get, release, reserve, withApp } = require('./helpers.cjs');

const poolOf = async (ctx) => (await get(ctx, 'operator', '/v1/operator/pool')).json.pool;

test('many connections racing for the last unit: exactly one wins and every loser has a typed refusal and no effect', () => withApp({}, async (ctx) => {
  await reserve(ctx, 'conductor-a', 5);
  await reserve(ctx, 'conductor-b', 4);
  const answers = await Promise.all(Array.from({ length: 24 }, (_, n) => reserve(ctx, n % 2 === 0 ? 'conductor-a' : 'conductor-b', 1)));
  assert.equal(answers.filter((answer) => answer.status === 200).length, 1);
  for (const loser of answers.filter((answer) => answer.status !== 200)) {
    assert.equal(loser.status, 409);
    assert.ok(['CAPACITY_EXCEEDED', 'LEASE_CAP_EXCEEDED'].includes(loser.json.error.code), loser.text);
  }
  assert.equal((await poolOf(ctx)).reservedUnits, 10);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('a lease cap is never over-admitted by simultaneous requests of one lease', () => withApp({}, async (ctx) => {
  await reserve(ctx, 'conductor-a', 4);
  const answers = await Promise.all(Array.from({ length: 6 }, () => reserve(ctx, 'conductor-a', 1)));
  assert.equal(answers.filter((answer) => answer.status === 200).length, 2);
  for (const loser of answers.filter((answer) => answer.status !== 200)) assert.ok(['LEASE_CAP_EXCEEDED', 'RESERVATION_LIMIT_REACHED'].includes(loser.json.error.code), loser.text);
  assert.equal((await poolOf(ctx)).reservedUnits, 6);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('a reserve racing a release is linearized: either order leaves the books balanced', () => withApp({}, async (ctx) => {
  for (let round = 0; round < 8; round += 1) {
    const held = (await reserve(ctx, 'conductor-a', 6)).json.reservation;
    const [freed, again] = await Promise.all([release(ctx, 'conductor-a', held.id), reserve(ctx, 'conductor-a', 6)]);
    assert.equal(freed.status, 200);
    if (again.status === 200) {
      assert.equal((await poolOf(ctx)).reservedUnits, 6);
      assert.equal((await release(ctx, 'conductor-a', again.json.reservation.id)).status, 200);
    } else {
      assert.equal(again.json.error.code, 'LEASE_CAP_EXCEEDED');
    }
    assert.equal((await poolOf(ctx)).reservedUnits, 0);
    assert.deepEqual(await bookProblems(ctx), []);
  }
}));

test('a reserve racing an expiry sees the capacity back at the deadline', () => withApp({}, async (ctx) => {
  const held = (await reserve(ctx, 'conductor-a', 6)).json.reservation;
  ctx.clock.advance(held.deadlineMs - ctx.clock.now());
  const answers = await Promise.all([reserve(ctx, 'conductor-a', 6), reserve(ctx, 'conductor-a', 6)]);
  assert.deepEqual(answers.map((answer) => answer.status).sort(), [200, 409]);
  assert.equal((await get(ctx, 'conductor-a', `/v1/reservations/${held.id}`)).json.reservation.state, 'expired');
  assert.equal((await poolOf(ctx)).reservedUnits, 6);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('two leases racing one pool: exactly one wins and neither consumes the other reservation', () => withApp({}, async (ctx) => {
  const mine = (await reserve(ctx, 'conductor-a', 4)).json.reservation;
  const theirs = (await reserve(ctx, 'conductor-b', 4)).json.reservation;
  for (let round = 0; round < 6; round += 1) {
    const [first, second] = await Promise.all([reserve(ctx, 'conductor-a', 2), reserve(ctx, 'conductor-b', 2)]);
    const winners = [first, second].filter((answer) => answer.status === 200);
    const loser = [first, second].find((answer) => answer.status !== 200);
    assert.equal(winners.length, 1);
    assert.equal(loser.json.error.code, 'CAPACITY_EXCEEDED');
    assert.deepEqual((await get(ctx, 'conductor-a', `/v1/reservations/${mine.id}`)).json.reservation, mine);
    assert.deepEqual((await get(ctx, 'conductor-b', `/v1/reservations/${theirs.id}`)).json.reservation, theirs);
    await release(ctx, first.status === 200 ? 'conductor-a' : 'conductor-b', winners[0].json.reservation.id);
    assert.deepEqual(await bookProblems(ctx), []);
  }
}));

test('the same key sent by many connections at once reserves once and every answer is the same reservation', () => withApp({}, async (ctx) => {
  const key = 'key-concurrent-1';
  const answers = await Promise.all(Array.from({ length: 12 }, () => reserve(ctx, 'conductor-a', 2, { key })));
  assert.ok(answers.every((answer) => answer.status === 200), answers.map((answer) => answer.status).join());
  assert.equal(new Set(answers.map((answer) => answer.json.reservation.id)).size, 1);
  assert.equal(answers.filter((answer) => answer.json.replayed === false).length, 1);
  assert.equal((await poolOf(ctx)).reservedUnits, 2);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('the same key with different bodies sent at once: one body wins and the others are a typed conflict', () => withApp({}, async (ctx) => {
  const key = 'key-concurrent-2';
  const answers = await Promise.all([1, 2, 3, 4, 5, 6].map((units) => reserve(ctx, 'conductor-a', units, { key })));
  const winners = answers.filter((answer) => answer.status === 200);
  assert.equal(winners.length, 1);
  for (const loser of answers.filter((answer) => answer.status !== 200)) assert.equal(loser.json.error.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await poolOf(ctx)).reservedUnits, winners[0].json.reservation.units);
  assert.deepEqual(await bookProblems(ctx), []);
}));
