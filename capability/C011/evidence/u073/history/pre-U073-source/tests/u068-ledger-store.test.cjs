'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const contract = require('../contract.js');
const { createStore } = require('../store.cjs');
const { SMALL, fakeClock, sequentialIds } = require('./helpers.cjs');
const A = 'conductor-a', B = 'conductor-b';
const input = (key, units = 1, tier = 'standard') => ({ key, units, tier });
function world(overrides = {}, ids = sequentialIds()) {
  const clock = fakeClock();
  const config = contract.resolveConfig({ ...SMALL, maxActive: 1, entries: 2, keyEntries: 3, ttlMs: 1000, ...overrides });
  return { clock, config, store: createStore({ config, now: clock.now, newId: ids }) };
}
const finish = (store, key) => {
  const result = store.reserve(A, input(key));
  assert.equal(result.ok, true);
  assert.equal(store.release(A, result.value.reservation.id).ok, true);
  return result.value.reservation;
};

test('U068 bounded replay slots survive all visible-history trimming and are never freed by release', () => {
  const { store } = world();
  const first = finish(store, 'store-origin-01');
  finish(store, 'store-filler-01'); finish(store, 'store-filler-02');
  const before = store.snapshot();
  assert.equal(store.has(A, first.id), false);
  const replay = store.reserve(A, input('store-origin-01'));
  assert.equal(replay.ok, true);
  assert.deepEqual([replay.value.replayed, replay.value.reservation.id, replay.value.reservation.state], [true, first.id, 'released']);
  assert.deepEqual(store.snapshot(), before);
  assert.equal(store.reserve(A, input('store-new-key-01')).code, 'IDEMPOTENCY_LIMIT_REACHED');
  assert.equal(store.reserve(A, input('store-origin-01', 2)).code, 'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(store.snapshot(), before);
});
test('U068 lifetime ledger follows exact expiry and cannot resurrect an expired entry', () => {
  const { store, clock } = world();
  const first = store.reserve(A, input('store-expiry-01')).value.reservation;
  clock.advance(first.deadlineMs - clock.now());
  store.operatorPool();
  finish(store, 'store-expiry-02'); finish(store, 'store-expiry-03');
  const before = store.snapshot();
  const replay = store.reserve(A, input('store-expiry-01'));
  assert.deepEqual([replay.value.replayed, replay.value.reservation.id, replay.value.reservation.state, replay.value.reservation.deadlineMs],
    [true, first.id, 'expired', first.deadlineMs]);
  assert.deepEqual(store.snapshot(), before);
});
test('U068 a full lease ledger neither consumes nor reads another lease slot or reservation', () => {
  const { store } = world();
  finish(store, 'store-shared-key'); finish(store, 'store-shared-02'); finish(store, 'store-shared-03');
  const other = store.reserve(B, input('store-shared-key', 2));
  assert.equal(other.ok, true);
  assert.equal(other.value.replayed, false);
  const before = store.snapshot();
  assert.equal(store.reserve(A, input('store-shared-04')).code, 'IDEMPOTENCY_LIMIT_REACHED');
  assert.deepEqual(store.snapshot(), before);
});
test('U068 failed draft batch rolls back replay slots as well as standing resource counters', () => {
  const { store } = world({ maxActive: 2, entries: 3, keyEntries: 2 });
  const first = store.reserve(A, input('store-batch-01')).value.reservation;
  const before = store.snapshot();
  const failed = store.batch(A, [{ op: 'release', id: first.id },
    { op: 'reserve', ...input('store-batch-02') }, { op: 'reserve', ...input('store-batch-03') }]);
  assert.deepEqual([failed.ok, failed.code, failed.opIndex], [false, 'IDEMPOTENCY_LIMIT_REACHED', 2]);
  assert.deepEqual(store.snapshot(), before);
  assert.deepEqual([store.reserve(A, input('store-batch-02')).ok, store.allowance(A).value.allowance.lease.replayKeys], [true, 2]);
});
test('U068 id generation cannot reuse a trimmed lifetime identity', () => {
  let number = 0, collide = false;
  const { store } = world({ keyEntries: 4 }, () => collide ? 'rsv-00000001' : `rsv-${(++number).toString(16).padStart(8, '0')}`);
  const first = finish(store, 'store-id-old-01');
  finish(store, 'store-id-fill-01'); finish(store, 'store-id-fill-02');
  assert.equal(store.has(A, first.id), false);
  const before = store.snapshot();
  collide = true;
  assert.throws(() => store.reserve(A, input('store-id-new-01')), { code: 'ID_GENERATOR_INVALID' });
  assert.deepEqual(store.snapshot(), before);
});
test('U068 replay allowance is own, copied, bounded and consistent at exactly the key limit', () => {
  const { store } = world();
  finish(store, 'store-view-key-01'); finish(store, 'store-view-key-02'); finish(store, 'store-view-key-03');
  const view = store.allowance(A).value.allowance.lease;
  assert.deepEqual([view.replayKeys, view.maxReplayKeys, view.remainingReplayKeys], [3, 3, 0]);
  view.replayKeys = -1; view.maxReplayKeys = -1;
  const current = store.allowance(A).value.allowance.lease;
  assert.deepEqual([current.replayKeys, current.maxReplayKeys, current.remainingReplayKeys], [3, 3, 0]);
});
