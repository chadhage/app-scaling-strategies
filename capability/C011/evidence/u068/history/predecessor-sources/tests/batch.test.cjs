'use strict';

// A batch is all or nothing: its operations run in order on one private copy of the books and the whole batch is kept only when every operation
// succeeds. The first failing operation ends it with its code and its index, whatever the failure (a bound, a conflict, a foreign or absent id).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { bookProblems, call, get, release, reserve, same, withApp } = require('./helpers.cjs');

const batch = (ctx, who, ops) => call(ctx, ctx.tokens[who], 'POST', '/v1/batch', { ops });
const op = (units, extra = {}) => ({ op: 'reserve', key: `key-batch-${String(units).padStart(2, '0')}${extra.suffix || ''}`, tier: 'standard', units });
const poolOf = async (ctx) => (await get(ctx, 'operator', '/v1/operator/pool')).json.pool;

test('a batch applies its operations in order: a release frees the headroom for a later reserve of the same batch', () => withApp({}, async (ctx) => {
  const held = (await reserve(ctx, 'conductor-a', 6)).json.reservation;
  const answer = await batch(ctx, 'conductor-a', [{ op: 'release', id: held.id }, op(6)]);
  assert.equal(answer.status, 200, answer.text);
  assert.deepEqual(answer.json.results.map((result) => [result.op, result.replayed, result.reservation.state]), [['release', false, 'released'], ['reserve', false, 'reserved']]);
  assert.equal((await poolOf(ctx)).reservedUnits, 6);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('a batch with an own reserve and an over-limit reserve is refused whole with the index and the code, and nothing was reserved', () => withApp({}, async (ctx) => {
  const refused = await batch(ctx, 'conductor-a', [op(1), op(7)]);
  assert.deepEqual([refused.status, refused.json.error.code, refused.json.opIndex, refused.headers.connection], [409, 'LEASE_CAP_EXCEEDED', 1, 'close']);
  assert.equal((await poolOf(ctx)).reservedUnits, 0);
  assert.equal((await get(ctx, 'conductor-a', '/v1/reservations')).json.total, 0);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('a batch that exceeds the pool with its second operation is refused whole and the first is not kept', () => withApp({}, async (ctx) => {
  await reserve(ctx, 'conductor-b', 6);
  const refused = await batch(ctx, 'conductor-a', [op(1), op(4, { suffix: 'x' })]);
  assert.deepEqual([refused.status, refused.json.error.code, refused.json.opIndex], [409, 'CAPACITY_EXCEEDED', 1]);
  assert.equal((await get(ctx, 'conductor-a', '/v1/reservations')).json.total, 0);
  assert.equal((await poolOf(ctx)).reservedUnits, 6);
}));

test('a batch that releases a foreign or an absent reservation is refused whole with the same bytes and changes nothing', () => withApp({}, async (ctx) => {
  const theirs = (await reserve(ctx, 'conductor-b', 3)).json.reservation;
  const foreign = await batch(ctx, 'conductor-a', [op(1), { op: 'release', id: theirs.id }]);
  const absent = await batch(ctx, 'conductor-a', [op(1), { op: 'release', id: 'rsv-0000ffff' }]);
  for (const refused of [foreign, absent]) assert.deepEqual([refused.status, refused.json.error.code, refused.json.opIndex], [404, 'RESERVATION_NOT_FOUND', 1]);
  assert.equal(foreign.text, absent.text);
  assert.deepEqual((await get(ctx, 'conductor-b', `/v1/reservations/${theirs.id}`)).json.reservation, theirs);
  assert.equal((await get(ctx, 'conductor-a', '/v1/reservations')).json.total, 0);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('inside a batch the same key with the same body replays and with another body is a conflict that refuses the whole batch', () => withApp({}, async (ctx) => {
  const twice = await batch(ctx, 'conductor-a', [op(2), op(2)]);
  assert.equal(twice.status, 200, twice.text);
  assert.deepEqual(twice.json.results.map((result) => result.replayed), [false, true]);
  assert.equal(twice.json.results[0].reservation.id, twice.json.results[1].reservation.id);
  assert.equal((await poolOf(ctx)).reservedUnits, 2);
  const clash = await batch(ctx, 'conductor-a', [{ ...op(3), key: 'key-batch-clash' }, { ...op(4), key: 'key-batch-clash' }]);
  assert.deepEqual([clash.status, clash.json.error.code, clash.json.opIndex], [409, 'IDEMPOTENCY_CONFLICT', 1]);
  assert.equal((await poolOf(ctx)).reservedUnits, 2);
}));

test('a malformed batch is refused: size, shape, unknown operations and claims', () => withApp({}, async (ctx) => {
  const own = (await reserve(ctx, 'conductor-a', 1)).json.reservation;
  const cases = [
    [[], 'INPUT_INVALID'], [Array.from({ length: 6 }, (_, n) => op(n + 1)), 'INPUT_INVALID'], ['x', 'INPUT_INVALID'], [[5], 'INPUT_INVALID'], [[{ op: 'delete', id: own.id }], 'INPUT_INVALID'],
    [[{ op: 'release' }], 'INPUT_MISSING_FIELD'], [[{ op: 'release', id: 'nope' }], 'INPUT_INVALID'], [[{ op: 'release', id: own.id, owner: 'x' }], 'IDENTITY_CLAIM_REJECTED'],
    [[{ op: 'reserve', key: 'key-batch-claim', tier: 'standard', units: 1, lease: 'conductor-b' }], 'SERVER_FIELD_REJECTED'], [[{ op: 'reserve', key: 'key-batch-claim', tier: 'standard', units: 1, id: own.id }], 'SERVER_FIELD_REJECTED'],
    [[{ op: 'reserve', key: 'key-batch-claim', tier: 'gold', units: 1 }], 'INPUT_INVALID'], [[{ op: 'reserve', key: 'key-batch-claim', tier: 'standard', units: '1' }], 'INPUT_INVALID']
  ];
  for (const [ops, code] of cases) {
    const refused = await batch(ctx, 'conductor-a', ops);
    assert.deepEqual([refused.status, refused.json.error.code], [400, code], JSON.stringify(ops).slice(0, 80));
  }
  for (const body of ['{}', '{"ops":[],"ops":[]}', '{"ops":[{"op":"release","id":"x"}],"owner":"b"}', '[]']) assert.equal((await call(ctx, ctx.tokens['conductor-a'], 'POST', '/v1/batch', Buffer.from(body))).status, 400);
  assert.deepEqual(await bookProblems(ctx), []);
  assert.equal((await poolOf(ctx)).reservedUnits, 1);
}));

test('two batches racing for the last two units: one is applied whole and the other refused whole', () => withApp({}, async (ctx) => {
  await reserve(ctx, 'conductor-a', 4);
  await reserve(ctx, 'conductor-b', 4);
  const [first, second] = await Promise.all([batch(ctx, 'conductor-a', [op(1), op(1, { suffix: 'y' })]), batch(ctx, 'conductor-b', [op(1, { suffix: 'z' }), op(1, { suffix: 'w' })])]);
  const done = [first, second].filter((answer) => answer.status === 200);
  assert.equal(done.length, 1);
  assert.equal([first, second].find((answer) => answer.status !== 200).json.error.code, 'CAPACITY_EXCEEDED');
  assert.equal((await poolOf(ctx)).reservedUnits, 10);
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('a batch is refused for every other identity and a released reservation inside it replays', () => withApp({}, async (ctx) => {
  const held = (await reserve(ctx, 'conductor-a', 2)).json.reservation;
  await release(ctx, 'conductor-a', held.id);
  const again = await batch(ctx, 'conductor-a', [{ op: 'release', id: held.id }]);
  assert.equal(again.status, 200, again.text);
  assert.equal(again.json.results[0].replayed, true);
  const before = same(await poolOf(ctx));
  for (const who of ['visitor', 'operator']) assert.deepEqual([(await batch(ctx, who, [op(1)])).status], [403]);
  assert.deepEqual(same(await poolOf(ctx)), before);
}));
