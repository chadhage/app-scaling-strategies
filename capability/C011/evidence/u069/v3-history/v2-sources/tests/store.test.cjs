'use strict';

// The books at the store level: the conservation invariant (books.cjs, computed from a snapshot) after EVERY operation, the five bounds and their order,
// the exact fits, and the rule that a refusal, a conflict or a failed batch changes nothing at all.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { booksProblems } = require('./books.cjs');
const { PRICES, SMALL, fakeClock } = require('./helpers.cjs');
const contract = require('../contract.js');
const { createStore } = require('../store.cjs');

const config = contract.resolveConfig(SMALL);
const A = 'conductor-a';
const B = 'conductor-b';
function world() {
  const clock = fakeClock();
  const store = createStore({ config, now: clock.now });
  let n = 0;
  const check = () => assert.deepEqual(booksProblems(store.snapshot(), config), []);
  const reserve = (subject, units, tier = 'standard', key = `key-store-${++n}`) => {
    const answer = store.reserve(subject, { key, tier, units });
    check();
    return answer;
  };
  const release = (subject, id) => {
    const answer = store.release(subject, id);
    check();
    return answer;
  };
  return { clock, store, check, reserve, release };
}

test('a scripted sequence keeps the books balanced after every single operation', () => {
  const { store, clock, reserve, release, check } = world();
  const first = reserve(A, 3, 'burst');
  assert.deepEqual([first.ok, first.value.reservation.spend, first.value.replayed], [true, 3 * PRICES.burst, false]);
  const second = reserve(B, 2);
  reserve(A, 3, 'standard', 'key-store-dup');
  assert.equal(reserve(A, 1).code, 'LEASE_CAP_EXCEEDED');
  assert.equal(release(A, first.value.reservation.id).value.reservation.state, 'released');
  assert.equal(release(A, first.value.reservation.id).value.replayed, true);
  assert.equal(release(B, first.value.reservation.id).code, 'RESERVATION_NOT_FOUND');
  clock.advance(config.ttlMs);
  assert.deepEqual(store.read(B, second.value.reservation.id).value.reservation.state, 'expired');
  check();
  assert.deepEqual([store.snapshot().reserved.units, store.snapshot().reserved.spend], [0, 0]);
});

const SETUPS = {
  RESERVATION_LIMIT_REACHED: { setup: (w) => { for (let n = 0; n < 3; n += 1) w.reserve(A, 1); }, attempt: (w) => w.store.reserve(A, { key: 'key-store-new', tier: 'standard', units: 1 }) },
  LEASE_CAP_EXCEEDED: { setup: () => {}, attempt: (w) => w.store.reserve(A, { key: 'key-store-new', tier: 'standard', units: 7 }) },
  LEASE_SPEND_CAP_EXCEEDED: { setup: () => {}, attempt: (w) => w.store.reserve(A, { key: 'key-store-new', tier: 'burst', units: 6 }) },
  CAPACITY_EXCEEDED: { setup: (w) => { w.reserve(A, 6); }, attempt: (w) => w.store.reserve(B, { key: 'key-store-new', tier: 'standard', units: 5 }) },
  SPEND_EXCEEDED: { setup: (w) => { w.reserve(A, 5, 'burst'); }, attempt: (w) => w.store.reserve(B, { key: 'key-store-new', tier: 'burst', units: 4 }) },
  IDEMPOTENCY_CONFLICT: { setup: (w) => { w.reserve(A, 2, 'standard', 'key-store-new'); }, attempt: (w) => w.store.reserve(A, { key: 'key-store-new', tier: 'standard', units: 3 }) },
  RESERVATION_NOT_FOUND: { setup: (w) => { w.reserve(A, 2); }, attempt: (w) => w.store.release(B, w.store.snapshot().leases[A].records[0].id) }
};

for (const [code, { setup, attempt }] of Object.entries(SETUPS)) {
  test(`${code}: a refusal names the bound and changes nothing, not even a counter or a record`, () => {
    const w = world();
    setup(w);
    const before = w.store.snapshot();
    const refused = attempt(w);
    assert.deepEqual([refused.ok, refused.code], [false, code]);
    assert.deepEqual(w.store.snapshot(), before);
    assert.deepEqual(refused.figures.before, refused.figures.after);
    w.check();
  });
}

test('the fixed order of the bounds, the lease own bounds first', () => {
  const full = world();
  for (let n = 0; n < 3; n += 1) full.reserve(B, 1);
  assert.equal(full.store.reserve(B, { key: 'key-order-1', tier: 'burst', units: 50 }).code, 'RESERVATION_LIMIT_REACHED');
  const w = world();
  w.reserve(B, 6);
  assert.equal(w.store.reserve(A, { key: 'key-order-2', tier: 'burst', units: 50 }).code, 'LEASE_CAP_EXCEEDED');
  assert.equal(w.store.reserve(A, { key: 'key-order-3', tier: 'burst', units: 6 }).code, 'LEASE_SPEND_CAP_EXCEEDED');
  assert.equal(w.store.reserve(A, { key: 'key-order-4', tier: 'burst', units: 5 }).code, 'CAPACITY_EXCEEDED');
  assert.equal(w.store.reserve(A, { key: 'key-order-5', tier: 'standard', units: 5 }).code, 'CAPACITY_EXCEEDED');
});

test('exact fits are admitted and the books reach their totals exactly', () => {
  const w = world();
  assert.equal(w.reserve(A, 6).ok, true);
  assert.equal(w.reserve(B, 4).ok, true);
  assert.deepEqual([w.store.snapshot().reserved.units, w.store.snapshot().reserved.spend], [10, 40]);
  const w2 = world();
  assert.equal(w2.reserve(A, 5, 'burst').ok, true);
  assert.equal(w2.reserve(B, 2, 'burst').ok, true);
  assert.equal(w2.reserve(B, 1).ok, true);
  assert.equal(w2.store.snapshot().reserved.spend, 60);
  assert.equal(w2.reserve(B, 1).code, 'SPEND_EXCEEDED');
});

test('a batch is all or nothing at the store: the first failure ends it with its index and the draft is dropped', () => {
  const w = world();
  const held = w.reserve(A, 6).value.reservation;
  const before = w.store.snapshot();
  const failed = w.store.batch(A, [{ op: 'release', id: held.id }, { op: 'reserve', key: 'key-batch-s1', tier: 'standard', units: 6 }, { op: 'reserve', key: 'key-batch-s2', tier: 'standard', units: 1 }]);
  assert.deepEqual([failed.ok, failed.code, failed.opIndex], [false, 'LEASE_CAP_EXCEEDED', 2]);
  assert.deepEqual(w.store.snapshot(), before);
  const done = w.store.batch(A, [{ op: 'release', id: held.id }, { op: 'reserve', key: 'key-batch-s1', tier: 'standard', units: 6 }]);
  assert.deepEqual([done.ok, done.value.results.map((result) => result.replayed)], [true, [false, false]]);
  w.check();
  const foreign = w.store.batch(B, [{ op: 'reserve', key: 'key-batch-s3', tier: 'standard', units: 1 }, { op: 'release', id: held.id }]);
  assert.deepEqual([foreign.ok, foreign.code, foreign.opIndex], [false, 'RESERVATION_NOT_FOUND', 1]);
  w.check();
});
