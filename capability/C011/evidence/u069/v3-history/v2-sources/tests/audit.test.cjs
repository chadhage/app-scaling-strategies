'use strict';

// The audit: every decision (admit, refusal with its bound, replay, release, expiry) is appended with the figures before and after; a conductor sees only
// its own records, without a pool figure or the global sequence, the operator sees all of them; every ring is bounded and no flood by one identity evicts
// the records of another; no record holds a token, an idempotency key or a client claim.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SMALL, call, get, release, reserve, withApp } = require('./helpers.cjs');

const auditOf = async (ctx, who, route = '/v1/audit') => {
  const answer = await get(ctx, who, route);
  assert.equal(answer.status, 200, answer.text);
  return answer.json;
};
const flat = (item) => [item.route, item.outcome, item.code, item.unitsBefore, item.unitsAfter, item.spendBefore, item.spendAfter];

test('every decision of a lease is appended in order with the figures before and after, the expiry included', () => withApp({}, async (ctx) => {
  const first = (await reserve(ctx, 'conductor-a', 3, { key: 'key-audit-0001' })).json.reservation;
  await reserve(ctx, 'conductor-a', 3, { key: 'key-audit-0001' });
  await reserve(ctx, 'conductor-a', 2, { key: 'key-audit-0001' });
  await reserve(ctx, 'conductor-a', 7);
  await release(ctx, 'conductor-a', first.id);
  await release(ctx, 'conductor-a', first.id);
  const second = (await reserve(ctx, 'conductor-a', 2)).json.reservation;
  ctx.clock.advance(second.deadlineMs - ctx.clock.now());
  await get(ctx, 'conductor-a', '/v1/allowance');
  const { items } = await auditOf(ctx, 'conductor-a');
  assert.deepEqual(items.map(flat), [
    ['reservation.create', 'admitted', 'ok', 0, 3, 0, 12], ['reservation.create', 'replayed', 'ok', 3, 3, 12, 12], ['reservation.create', 'refused', 'IDEMPOTENCY_CONFLICT', 3, 3, 12, 12],
    ['reservation.create', 'refused', 'LEASE_CAP_EXCEEDED', 3, 3, 12, 12], ['reservation.release', 'released', 'ok', 3, 0, 12, 0], ['reservation.release', 'replayed', 'ok', 0, 0, 0, 0],
    ['reservation.create', 'admitted', 'ok', 0, 2, 0, 8], ['expire', 'expired', 'ok', 2, 0, 8, 0], ['allowance', 'read', 'ok', null, null, null, null], ['audit', 'read', 'ok', null, null, null, null]
  ]);
  assert.deepEqual(items.map((item) => item.reservation), [first.id, first.id, null, null, first.id, first.id, second.id, second.id, null, null]);
}));

test('an owner sees only its own records without the sequence, the subject or any pool figure, and never a record of the other lease', () => withApp({}, async (ctx) => {
  const mine = (await reserve(ctx, 'conductor-a', 2)).json.reservation;
  const theirs = (await reserve(ctx, 'conductor-b', 3)).json.reservation;
  await release(ctx, 'conductor-b', mine.id);
  const seenByA = await auditOf(ctx, 'conductor-a');
  const seenByB = await auditOf(ctx, 'conductor-b');
  assert.deepEqual(Object.keys(seenByA.items[0] ?? {}).sort(), ['code', 'method', 'outcome', 'reservation', 'route', 'spendAfter', 'spendBefore', 'unitsAfter', 'unitsBefore']);
  assert.deepEqual([seenByA.total, seenByB.total], [2, 3]);
  assert.equal(JSON.stringify(seenByA).includes(theirs.id), false);
  assert.equal(JSON.stringify(seenByB).includes(mine.id), false);
  assert.equal(/seq|subject|pool|conductor-/i.test(JSON.stringify(seenByA.items)), false);
  assert.deepEqual(seenByB.items.map(flat).slice(0, 2), [['reservation.create', 'admitted', 'ok', 0, 3, 0, 12], ['reservation.release', 'refused', 'RESERVATION_NOT_FOUND', null, null, null, null]]);
}));

test('the operator sees every record with its sequence, subject, role and pool figures, and its own reads are audited', () => withApp({}, async (ctx) => {
  await reserve(ctx, 'conductor-a', 2);
  await reserve(ctx, 'conductor-b', 3);
  await call(ctx, null, 'GET', '/v1/allowance');
  const first = await auditOf(ctx, 'operator', '/v1/operator/audit');
  const created = first.items.filter((item) => item.route === 'reservation.create');
  assert.deepEqual(created.map((item) => [item.subject, item.role, item.poolUnitsBefore, item.poolUnitsAfter, item.poolSpendBefore, item.poolSpendAfter]), [['conductor-a', 'conductor', 0, 2, 0, 8], ['conductor-b', 'conductor', 2, 5, 8, 20]]);
  assert.deepEqual(first.items.map((item) => item.seq), [...first.items.map((item) => item.seq)].sort((x, y) => x - y));
  assert.ok(first.items.some((item) => item.subject === null && item.outcome === 'refused' && item.code === 'AUTHENTICATION_REQUIRED'));
  const second = await auditOf(ctx, 'operator', '/v1/operator/audit');
  assert.ok(second.items.some((item) => item.subject === 'operator' && item.route === 'operator.audit' && item.outcome === 'read'));
}));

test('every ring is bounded and a flood by one identity never evicts the records of another', () => withApp({ app: { config: { ...SMALL, limits: { auditEntries: 5, anonymousEntries: 3 } } } }, async (ctx) => {
  for (let n = 0; n < 3; n += 1) await reserve(ctx, 'conductor-a', 1);
  for (let n = 0; n < 12; n += 1) await call(ctx, ctx.tokens['conductor-b'], 'POST', '/v1/reservations', { key: 'x', tier: 'standard', units: 1 });
  for (let n = 0; n < 8; n += 1) await call(ctx, null, 'GET', '/v1/allowance');
  const seenByA = await auditOf(ctx, 'conductor-a');
  assert.deepEqual(seenByA.items.slice(0, 3).map((item) => item.outcome), ['admitted', 'admitted', 'admitted']);
  const everything = await auditOf(ctx, 'operator', '/v1/operator/audit');
  assert.equal(everything.items.filter((item) => item.subject === 'conductor-b').length, 5);
  assert.equal(everything.items.filter((item) => item.subject === null).length, 3);
  assert.equal(everything.items.filter((item) => item.subject === 'conductor-a').length, 4);
}));

test('no record holds a token, an idempotency key or a client claim', () => withApp({}, async (ctx) => {
  await call(ctx, ctx.tokens['conductor-a'], 'POST', '/v1/reservations', { key: 'key-secret-0001', tier: 'standard', units: 1 }, { 'X-Lease': 'claimed-lease', 'X-Owner': 'claimed-owner' });
  await call(ctx, ctx.tokens['conductor-a'], 'POST', '/v1/reservations', { key: 'key-secret-0002', tier: 'standard', units: 1, owner: 'claimed-owner' });
  const operatorView = await auditOf(ctx, 'operator', '/v1/operator/audit');
  assert.ok(operatorView.items.length >= 3, 'the audit is empty: the absence checks below would be vacuous');
  const text = JSON.stringify([operatorView, await auditOf(ctx, 'conductor-a')]);
  for (const token of Object.values(ctx.tokens)) assert.equal(text.includes(token.slice(0, 16)), false);
  for (const secret of ['key-secret', 'claimed-lease', 'claimed-owner']) assert.equal(text.includes(secret), false, secret);
}));

test('a visitor and an anonymous client have no audit view and the operator has no conductor audit', () => withApp({}, async (ctx) => {
  assert.equal((await get(ctx, 'visitor', '/v1/audit')).status, 403);
  assert.equal((await get(ctx, 'operator', '/v1/audit')).status, 403);
  assert.equal((await get(ctx, 'conductor-a', '/v1/operator/audit')).status, 403);
  assert.equal((await call(ctx, null, 'GET', '/v1/operator/audit')).status, 401);
}));
