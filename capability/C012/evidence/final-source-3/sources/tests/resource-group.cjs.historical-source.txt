'use strict';
const assert = require('node:assert/strict');
const { createStore } = require('../../C011/store.cjs');
const contract = require('../../C011/contract.js');
const { create } = require('./dom.cjs');
const { invariant } = require('./oracle.cjs');
const model = require('../model.js'), fixtures = require('../fixtures.js');
async function group(job = 0) {
  let at = 1000, sequence = 0, checks = 0, transitions = 0;
  const config = contract.resolveConfig({ pool: { units: 12, spend: 96 },
    caps: { 'conductor-a': { units: 8, spend: 48 }, 'conductor-b': { units: 8, spend: 64 } } });
  let store = createStore({ config, now: () => at, newId: () => 'rsv-' + (++sequence).toString(16).padStart(8, '0') });
  function books(label) {
    const snapshot = store.snapshot();
    let units = 0, spend = 0;
    for (const owner of contract.conductors) {
      const lease = snapshot.leases[owner], own = store.allowance(owner).value.allowance.lease;
      const held = lease.records.filter(record => record.state === 'reserved');
      assert.equal(lease.held.units, held.reduce((total, record) => total + record.units, 0), label);
      assert.equal(lease.held.spend, held.reduce((total, record) => total + record.spend, 0), label);
      assert.equal(own.capUnits, own.heldUnits + own.remainingUnits, label);
      assert.equal(own.capSpend, own.heldSpend + own.remainingSpend, label);
      assert.equal(own.maxReplayKeys, own.replayKeys + own.remainingReplayKeys, label);
      assert.ok(own.heldUnits <= config.caps[owner].units && own.heldSpend <= config.caps[owner].spend, label);
      assert.equal(new Set(lease.replays.map(record => record.key)).size, lease.replays.length, label);
      units += lease.held.units; spend += lease.held.spend; checks += 7;
    }
    assert.equal(snapshot.reserved.units, units, label);
    assert.equal(snapshot.reserved.spend, spend, label);
    assert.ok(units <= config.pool.units && spend <= config.pool.spend, label);
    checks += 3; transitions += 1;
  }
  const reserve = (owner, key, units, tier = 'standard') => {
    const checked = contract.validateBody('reserve', { key, units, tier });
    assert.equal(checked.ok, true);
    return store.reserve(owner, checked.value);
  };
  books('empty');
  const first = reserve('conductor-a', 'firstkey1', 3);
  assert.equal(first.ok, true); books('reserve');
  const beforeRetry = store.snapshot();
  assert.equal(reserve('conductor-a', 'firstkey1', 3).value.replayed, true);
  assert.deepEqual(store.snapshot(), beforeRetry); books('same-body retry');
  assert.equal(reserve('conductor-a', 'firstkey1', 4).code, 'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(store.snapshot(), beforeRetry); books('conflicting retry');
  reserve('conductor-b', 'otherkey1', 2, 'burst'); books('neighbor reserve');
  const beforeRefusal = store.snapshot();
  assert.equal(reserve('conductor-a', 'boundkey1', 6).code, 'LEASE_CAP_EXCEEDED');
  assert.deepEqual(store.snapshot(), beforeRefusal); books('bound refusal');
  const ops = contract.validateBody('batch', { ops: [
    { op: 'reserve', key: 'batchkey1', tier: 'standard', units: 1 },
    { op: 'reserve', key: 'batchkey2', tier: 'standard', units: 6 }
  ] });
  assert.equal(ops.ok, true);
  assert.equal(store.batch('conductor-a', ops.value.ops).ok, false);
  assert.deepEqual(store.snapshot(), beforeRefusal); books('atomic failed batch');
  assert.equal(store.release('conductor-b', first.value.reservation.id).code, 'RESERVATION_NOT_FOUND');
  assert.deepEqual(store.snapshot(), beforeRefusal); books('foreign release refusal');
  assert.equal(store.release('conductor-a', first.value.reservation.id).ok, true); books('release');
  assert.equal(store.release('conductor-a', first.value.reservation.id).value.replayed, true); books('duplicate release');
  assert.equal(reserve('conductor-a', 'firstkey1', 3).value.reservation.state, 'released'); books('retry released');
  at += config.ttlMs;
  assert.ok(store.allowance('conductor-b').expired.length > 0); books('clock expiry');
  assert.equal(store.allowance('conductor-b').expired.length, 0); books('settled expiry once');
  store = createStore({ config, now: () => at, newId: () => 'rsv-' + (++sequence).toString(16).padStart(8, '0') });
  books('new in-memory lifetime');
  assert.equal(reserve('conductor-a', 'firstkey1', 3).value.replayed, false); books('restart has no persistent replay claim');
  const dom = create();
  invariant(dom); checks += 1;
  const operations = ['load', 'review', 'ack', 'retry', 'edit', 'reset', 'typed-block', 'reset'];
  for (let round = 0; round < 4; round++) {
    for (const operation of operations) {
      if (operation === 'load' || operation === 'typed-block') {
        dom.elements.get('scenario').value = operation === 'load' ? 'held' : 'native';
        await dom.emit('load', 'click'); invariant(dom);
        if (operation === 'typed-block') { await dom.emit('review', 'click'); invariant(dom, 'native'); }
      } else if (operation === 'review' || operation === 'retry') {
        await dom.emit('review', 'click'); invariant(dom, 'held');
      } else if (operation === 'ack') {
        dom.elements.get('acknowledge').checked = true; await dom.emit('acknowledge', 'change'); invariant(dom, 'held');
      } else if (operation === 'edit') {
        await dom.emit('packet', 'input'); invariant(dom);
      } else { await dom.emit('reset', 'click'); invariant(dom); }
      checks += 1;
    }
  }
  for (const text of ['', '{', 'x'.repeat(32768), 'x'.repeat(32769)]) {
    const outcome = await model.review(text, 'conductor-a', 'rsv-00000001', 1000);
    assert.equal(outcome.reviewable, false); assert.deepEqual(outcome.rows, []); checks += 2;
  }
  const ready = await model.review(fixtures.held.text, 'conductor-a', 'rsv-00000001', 1000);
  assert.equal(ready.reviewable, true); assert.equal(ready.rows.length, 22); checks += 2;
  return { job, checks, producerTransitions: transitions, clientOperations: operations.length * 4,
    maxRenderedRows: 22, maxSuppliedCharacters: 32769, standaloneBurners: 0, nativeBrowsers: 0,
    complete: true, invariantsAfterEveryOperation: true };
}
module.exports = { group };
