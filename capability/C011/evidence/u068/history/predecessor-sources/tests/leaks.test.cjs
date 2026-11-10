'use strict';

// Nothing leaks across leases: a foreign reservation and an absent one answer one byte-identical typed refusal that echoes no id; lists, counts and the
// allowance show only the caller's own reservations and caps and never move with the activity of the other lease; a foreign release changes nothing.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { bookProblems, call, get, release, reserve, sequentialIds, withApp } = require('./helpers.cjs');

const comparable = (answer) => {
  const headers = { ...answer.headers };
  delete headers.date;
  return { status: answer.status, headers, text: answer.text };
};
const ABSENT = 'rsv-0000ffff';

test('a foreign reservation, an absent one and a malformed id answer the same bytes, for a read and for a release', () => withApp({ app: { newId: sequentialIds() } }, async (ctx) => {
  const mine = (await reserve(ctx, 'conductor-a', 2)).json.reservation;
  assert.equal(mine.id, 'rsv-00000001');
  const probes = [mine.id, ABSENT, 'rsv-zz', 'RSV-00000001', 'rsv-00000001%2f', `rsv-${'0'.repeat(40)}`, '..%2f..%2fv1%2fme'];
  for (const [method, suffix] of [['GET', ''], ['POST', '/release']]) {
    const answers = [];
    for (const id of probes) answers.push(await call(ctx, ctx.tokens['conductor-b'], method, `/v1/reservations/${id}${suffix}`));
    for (const answer of answers) {
      assert.deepEqual([answer.status, answer.json.error.code], [404, 'RESERVATION_NOT_FOUND']);
      assert.equal(answer.headers.connection, 'close');
      assert.equal(answer.text.includes('0000'), false, 'the answer echoes an id');
    }
    for (const answer of answers.slice(1)) assert.deepEqual(comparable(answer), comparable(answers[0]));
  }
  assert.equal((await get(ctx, 'conductor-a', `/v1/reservations/${mine.id}`)).json.reservation.state, 'reserved');
  assert.deepEqual(await bookProblems(ctx), []);
}));

test('a foreign release has no effect on the reservation, the pool or the books', () => withApp({}, async (ctx) => {
  const mine = (await reserve(ctx, 'conductor-a', 4)).json.reservation;
  const before = (await get(ctx, 'operator', '/v1/operator/pool')).json;
  assert.equal((await release(ctx, 'conductor-b', mine.id)).status, 404);
  assert.equal((await release(ctx, 'conductor-b', mine.id)).status, 404);
  assert.deepEqual((await get(ctx, 'conductor-a', `/v1/reservations/${mine.id}`)).json.reservation, mine);
  assert.deepEqual((await get(ctx, 'operator', '/v1/operator/pool')).json, before);
}));

test('lists and counts show only the own reservations, in creation order', () => withApp({}, async (ctx) => {
  const a1 = (await reserve(ctx, 'conductor-a', 1)).json.reservation;
  const b1 = (await reserve(ctx, 'conductor-b', 2)).json.reservation;
  const a2 = (await reserve(ctx, 'conductor-a', 3)).json.reservation;
  const listA = (await get(ctx, 'conductor-a', '/v1/reservations')).json;
  const listB = (await get(ctx, 'conductor-b', '/v1/reservations')).json;
  assert.deepEqual([listA.total, listA.items.map((item) => item.id)], [2, [a1.id, a2.id]]);
  assert.deepEqual([listB.total, listB.items.map((item) => item.id)], [1, [b1.id]]);
  const paged = (await get(ctx, 'conductor-a', '/v1/reservations?limit=1&offset=1')).json;
  assert.deepEqual([paged.total, paged.items.map((item) => item.id)], [2, [a2.id]]);
}));

test('the allowance is the own caps and holdings: it never moves with the activity of the other lease and shows no pool headroom', () => withApp({}, async (ctx) => {
  await reserve(ctx, 'conductor-a', 2);
  const before = (await get(ctx, 'conductor-a', '/v1/allowance')).json;
  await reserve(ctx, 'conductor-b', 5);
  const refused = await reserve(ctx, 'conductor-b', 4);
  assert.equal(refused.status, 409);
  const after = (await get(ctx, 'conductor-a', '/v1/allowance')).json;
  assert.deepEqual(after, before);
  assert.deepEqual(Object.keys(after.allowance.pool), ['units', 'spend']);
  assert.equal(/free|reservedUnits|reservedSpend/i.test(JSON.stringify(after)), false);
  assert.equal(after.allowance.lease.heldUnits, 2);
}));

test('the pool headroom and the books of every lease belong to the operator alone', () => withApp({}, async (ctx) => {
  await reserve(ctx, 'conductor-a', 2);
  const seen = (await get(ctx, 'operator', '/v1/operator/pool')).json;
  assert.deepEqual([seen.pool.reservedUnits, seen.pool.freeUnits, seen.leases.length], [2, 8, 2]);
  for (const who of ['conductor-a', 'conductor-b', 'visitor']) {
    const refused = await get(ctx, who, '/v1/operator/pool');
    assert.deepEqual([refused.status, refused.json.error.code, refused.headers.connection], [403, 'ROLE_FORBIDDEN', 'close']);
  }
}));

test('every refusal of the identity and of the bounds closes the connection', () => withApp({}, async (ctx) => {
  await reserve(ctx, 'conductor-a', 6);
  const probes = [
    call(ctx, null, 'GET', '/v1/allowance'), call(ctx, ctx.tokens.visitor, 'GET', '/v1/allowance'), get(ctx, 'conductor-b', '/v1/reservations/rsv-0000ffff'),
    reserve(ctx, 'conductor-b', 5), call(ctx, ctx.tokens['conductor-b'], 'POST', '/v1/reservations', { key: 'x', tier: 'standard', units: 1 })
  ];
  for (const answer of await Promise.all(probes)) {
    assert.ok(answer.status >= 400, answer.text);
    assert.equal(answer.headers.connection, 'close', answer.text);
  }
}));
