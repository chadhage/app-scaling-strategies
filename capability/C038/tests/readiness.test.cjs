'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { fixtureSession, inspect } = require('./support.cjs');
const model = require('../model.js');
const flags = require('../readiness.js').flags;
function nativeFalse(result) {
  for (const [key, value] of Object.entries(flags)) {
    assert.equal(value, false);
    assert.equal(result[key], false, key);
  }
}
test('one successful probe has coverage 1/6 and cannot create pool readiness', async () => {
  const result = await inspect('single-probe');
  assert.equal(result.decision, 'UNKNOWN');
  assert.equal(result.action, 'HOLD');
  assert.equal(result.syntheticPoolReady, false);
  assert.equal(result.freshReadyProbes, 1);
  assert.equal(result.expectedProbes, 6);
  assert.equal(result.coverage.filter((item) => item.status === 'UNKNOWN').length, 5);
  nativeFalse(result);
});
test('only the explicit complete compatible six-probe synthetic model is positive', async () => {
  const result = await inspect('complete');
  assert.equal(result.decision, 'CLOSED_SYNTHETIC_READY');
  assert.equal(result.syntheticPoolReady, true);
  assert.equal(result.freshReadyProbes, 6);
  assert.equal(new Set(result.coverage.map((item) => item.instanceId)).size, 2);
  assert.ok(result.coverage.every((item) => item.status === 'FRESH_READY' && item.ageTicks === 5));
  assert.equal(result.source.inventoryOrigin, 'literal-fictional-inventory-not-a-scan');
  nativeFalse(result);
});
for (const id of ['missing-inventory', 'missing-node', 'missing-dependency', 'missing-request',
  'missing-freshness', 'unknown-clock', 'future-timestamp', 'ambiguous-clock', 'partial',
  'unknown-state', 'missing-probe', 'missing-source', 'missing-epoch', 'status-only']) {
  test(`${id} is UNKNOWN/HOLD, never implicitly healthy`, async () => {
    const result = await inspect(id);
    assert.equal(result.decision, 'UNKNOWN');
    assert.equal(result.syntheticPoolReady, false);
    assert.equal(result.action, 'HOLD');
    assert.ok(result.missing.length > 0 || result.coverage.some((item) => item.status === 'UNKNOWN'));
    nativeFalse(result);
  });
}
test('one known failed dependency blocks readiness although all other probes pass', async () => {
  const result = await inspect('failed-node');
  assert.equal(result.decision, 'FAILED');
  assert.equal(result.syntheticPoolReady, false);
  assert.equal(result.freshReadyProbes, 5);
  assert.equal(result.coverage.at(-1).status, 'FAILED');
});
test('one stale node blocks readiness although all other probes pass', async () => {
  const result = await inspect('stale-node');
  assert.equal(result.decision, 'STALE');
  assert.equal(result.syntheticPoolReady, false);
  assert.equal(result.freshReadyProbes, 5);
  assert.equal(result.coverage.at(-1).ageTicks, 10);
});
test('measured declared TTL is fresh strictly before, stale at and after equality', async () => {
  const results = await Promise.all(['before-ttl', 'at-ttl', 'after-ttl'].map(inspect));
  assert.deepEqual(results.map((item) => item.decision), ['CLOSED_SYNTHETIC_READY', 'STALE', 'STALE']);
  assert.deepEqual(results.map((item) => item.coverage[0].ageTicks), [9, 10, 11]);
  assert.deepEqual(results.map((item) => item.clock.ttlTicks), [10, 10, 10]);
  assert.ok(results.every((item) => item.clock.nowTick === 100));
  assert.equal(model.clock.freshnessContract, '0 <= nowTick - observedTick < ttlTicks; equality is STALE');
  results.forEach(nativeFalse);
});
for (const id of ['duplicate-node', 'wrong-version', 'wrong-tier', 'wrong-context', 'old-epoch']) {
  test(`${id} cannot fill current coverage`, async () => {
    const result = await inspect(id);
    assert.equal(result.decision, 'UNKNOWN');
    assert.equal(result.syntheticPoolReady, false);
    assert.equal(result.rejected, true);
    assert.equal(result.freshReadyProbes, 0);
  });
}
test('failed, unknown and stale originals survive later fresh evidence without repair', async () => {
  const session = await fixtureSession();
  for (const id of ['failed-node', 'single-probe', 'stale-node']) {
    await session.inspectText(JSON.stringify(session.getEvidence(id)));
  }
  const originals = session.snapshot().history;
  assert.deepEqual(originals.map((item) => item.decision), ['FAILED', 'UNKNOWN', 'STALE']);
  const fresh = await session.inspectText(JSON.stringify(session.getEvidence('later-fresh')));
  assert.equal(fresh.syntheticPoolReady, true);
  assert.deepEqual(session.snapshot().history.slice(0, 3), originals);
  assert.ok(session.snapshot().history.every((item) => item.originalClientJourneyRepaired === false &&
    item.capacityScalingVerified === false && item.actualPoolReady === false));
});
test('same original replay cannot overwrite even a previously positive result', async () => {
  const session = await fixtureSession();
  const text = JSON.stringify(session.getEvidence('complete'));
  const original = await session.inspectText(text);
  const replay = await session.inspectText(text);
  assert.equal(original.syntheticPoolReady, true);
  assert.equal(replay.code, 'REPLAYED_ORIGINAL_ROUND');
  assert.equal(replay.syntheticPoolReady, false);
  assert.equal(session.snapshot().lastResult, replay);
  assert.equal(session.snapshot().history[0].syntheticPoolReady, true);
  assert.equal(session.snapshot().history.length, 2);
});
test('history limit refuses new work instead of dropping or resetting originals', async () => {
  const session = await fixtureSession();
  for (let index = 0; index < 10; index++) await session.inspectText('{}');
  const before = session.snapshot();
  const result = await session.inspectText(JSON.stringify(session.getEvidence('complete')));
  assert.equal(result.code, 'HISTORY_LIMIT_REACHED');
  assert.equal(result.syntheticPoolReady, false);
  assert.deepEqual(session.snapshot(), before);
  assert.equal(typeof session.reset, 'undefined');
});
test('results, expected inventory, histories and returned copies cannot mutate authority', async () => {
  const session = await fixtureSession();
  const copy = session.getEvidence('complete');
  copy.inventory.instances.pop();
  assert.equal(session.getEvidence('complete').inventory.instances.length, 2);
  const result = await session.inspectText(JSON.stringify(session.getEvidence('complete')));
  assert.throws(() => { result.coverage[0].status = 'FRESH_READY_OVERRIDE'; }, TypeError);
  assert.throws(() => { session.snapshot().history.pop(); }, TypeError);
  assert.throws(() => { model.inventory.instances[0].id = 'actual'; }, TypeError);
  assert.equal(session.snapshot().expectedInventory.instances.length, 2);
});
test('actual saved C034 originals remain unlinked, including failure/budget/unknown', async () => {
  const session = await fixtureSession();
  const closed = await session.inspectText(JSON.stringify(session.getEvidence('saved-closed-unlinked')));
  const held = await session.inspectText(JSON.stringify(session.getEvidence('saved-held-unlinked')));
  assert.equal(closed.code, 'ACTUAL_C034_HISTORY_UNLINKED_NOT_POOL_INVENTORY');
  assert.equal(held.decision, 'UNKNOWN');
  const classes = closed.historical.attempts.map((item) => item.classification);
  assert.ok(classes.includes('failed'));
  assert.ok(classes.includes('original-budget-exceeded'));
  assert.ok(classes.includes('unknown'));
  assert.ok(held.historical.attempts.some((item) => item.classification === 'partial-unknown'));
  assert.equal(closed.historical.originalRecordsAttributed, 0);
  assert.equal(closed.historicalSource.newLiveRunAttested, false);
  assert.equal(session.snapshot().c034ActualHistoryRemainsUnlinked, true);
  nativeFalse(closed);
});
test('an in-flight inspection has no parallel eligible-input adoption', async () => {
  const session = await fixtureSession();
  const first = session.inspectText(JSON.stringify(session.getEvidence('complete')));
  const second = await session.inspectText(JSON.stringify(session.getEvidence('later-fresh')));
  assert.equal(second.code, 'INSPECTION_BUSY');
  assert.equal(second.syntheticPoolReady, false);
  assert.equal((await first).syntheticPoolReady, true);
});
