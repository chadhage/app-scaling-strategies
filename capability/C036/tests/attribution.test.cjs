'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const attribution = require('..\\attribution.js');
const { capturedGate } = require('./support.cjs');
const text = (gate, id) => JSON.stringify(gate.getEvidence(id));

test('genuine wrong-run regression now blocks the actual private attachment and metric transition', async () => {
  const gate = await attribution.open();
  assert.equal(gate.snapshot().currentExpectedContext.contextOrigin, 'actual-C015-public-restore-read-only');
  const result = await gate.attachText(text(gate, 'wrong-run'));
  assert.equal(result.outcome, 'rejected');
  assert.equal(result.code, 'RUN_MISMATCH');
  assert.equal(result.blockedTransition, true);
  assert.equal(gate.snapshot().attachedRecords, 0);
  assert.equal(gate.snapshot().metrics.currentAttributedTierRecords, 0);
  assert.equal(gate.snapshot().history[0].code, 'RUN_MISMATCH');
});

test('actual current Node read gates three explicit fictional records; inspection alone cannot attach', async () => {
  const gate = await attribution.open();
  const candidate = text(gate, 'fictional-complete');
  const inspected = await gate.inspectText(candidate);
  assert.equal(inspected.outcome, 'fixture-verified');
  assert.equal(gate.snapshot().metrics.currentAttributedTierRecords, 0);
  const attached = await gate.attachText(candidate);
  assert.equal(attached.outcome, 'attached');
  assert.equal(attached.attributedRecords, 3);
  assert.equal(gate.snapshot().attachedRecords, 3);
  for (const result of [inspected, attached]) {
    assert.equal(result.fixtureScopeVerified, true);
    assert.equal(result.nativeCorrelationVerified, false);
    assert.equal(result.authenticatedIdentityVerified, false);
    assert.equal(result.leaseAuthority, false);
    assert.equal(result.liveRunAdopted, false);
    assert.equal(result.productionRuntimeValidated, false);
  }
  assert.equal(gate.snapshot().metrics.nativeAuthenticatedRecords, 0);
  assert.match(gate.snapshot().currentExpectedContext.association, /explicit fictional scope/);
  assert.equal(gate.snapshot().currentExpectedContext.record.acknowledgedUnits,
    gate.snapshot().currentExpectedContext.epoch);
});

for (const [id, expectedCount, expectedUnknown] of [
  ['saved-closed-unlinked', 6, 2], ['saved-held-unlinked', 2, 0]
]) {
  test(`actual unchanged ${id} never supplies missing authenticated correlation or current metrics`, async () => {
    const gate = await attribution.open();
    const result = await gate.attachText(text(gate, id));
    assert.equal(result.outcome, 'held');
    assert.equal(result.code, 'REQUIRED_CORRELATION_UNOBSERVED');
    assert.equal(result.historical.attempts.length, expectedCount);
    assert.equal(result.historical.attempts.filter((a) => a.classification === 'unknown').length, expectedUnknown);
    assert.match(result.historical.association, /declared-fixture-association-only/);
    assert.match(result.historical.replacement, /summary-only/);
    assert.equal(result.historical.originalRecordsAttributed, 0);
    assert.equal(gate.snapshot().metrics.currentAttributedTierRecords, 0);
    if (id === 'saved-closed-unlinked') {
      assert.equal(result.historical.attempts[2].classification, 'original-budget-exceeded');
      assert.equal(result.historical.attempts[3].classification, 'failed');
    } else {
      assert.equal(result.historical.attempts[1].classification, 'partial-unknown');
      assert.equal(result.historical.attempts[1].responses, 1);
    }
  });
}

test('replay rejects before attachment and snapshot/reset presentation cannot clear protection', async () => {
  const gate = await capturedGate();
  const candidate = text(gate, 'fictional-complete');
  assert.equal((await gate.attachText(candidate)).outcome, 'attached');
  const display = gate.snapshot();
  assert.throws(() => { display.history.length = 0; }, TypeError);
  assert.throws(() => { display.currentExpectedContext.epoch = 1; }, TypeError);
  assert.equal((await gate.attachText(candidate)).code, 'REPLAYED_EVIDENCE');
  assert.equal(gate.snapshot().attachedRecords, 3);
  assert.equal(gate.snapshot().history.length, 2);
  assert.equal(gate.snapshot().history[1].outcome, 'rejected');
});

for (const [id, code] of [
  ['wrong-user', 'USER_MISMATCH'], ['wrong-lease', 'LEASE_MISMATCH'],
  ['old-epoch', 'EPOCH_MISMATCH_OR_STALE'], ['wrong-tier', 'TIER_MISMATCH'],
  ['wrong-stamp', 'TIER_STAMP_MISMATCH'], ['stale', 'STALE_OBSERVATION'],
  ['newer-attempt', 'ORIGINAL_ATTEMPT_MISMATCH']
]) {
  test(`${id} blocks actual private attribution, not just a displayed verdict`, async () => {
    const gate = await capturedGate();
    const result = await gate.attachText(text(gate, id));
    assert.equal(result.outcome, 'rejected');
    assert.equal(result.code, code);
    assert.equal(gate.snapshot().attachedRecords, 0);
    assert.equal(gate.snapshot().metrics.currentAttributedTierRecords, 0);
  });
}

for (const id of ['partial', 'missing-correlation']) {
  test(`${id} holds without partial attachment or inferred identity`, async () => {
    const gate = await capturedGate();
    const result = await gate.attachText(text(gate, id));
    assert.equal(result.outcome, 'held');
    assert.ok(result.missing.length);
    assert.equal(gate.snapshot().metrics.currentAttributedTierRecords, 0);
    assert.equal(result.fixtureScopeVerified, false);
  });
}

test('known mismatch in a later tier still rejects when an earlier required field is missing', async () => {
  const gate = await capturedGate();
  const candidate = gate.getEvidence('fictional-complete');
  delete candidate.observations[0].userId;
  candidate.observations[2].runId = 'synthetic-run-002';
  const result = await gate.attachText(JSON.stringify(candidate));
  assert.equal(result.outcome, 'rejected');
  assert.equal(result.code, 'RUN_MISMATCH');
  assert.equal(gate.snapshot().attachedRecords, 0);
});

test('other/newer attempts after a legitimate attachment never increment current attribution', async () => {
  const gate = await capturedGate();
  await gate.attachText(text(gate, 'fictional-complete'));
  const result = await gate.attachText(text(gate, 'newer-attempt'));
  assert.equal(result.outcome, 'rejected');
  assert.equal(result.code, 'ORIGINAL_ATTEMPT_MISMATCH');
  assert.equal(gate.snapshot().metrics.currentAttributedTierRecords, 3);
  assert.equal(gate.snapshot().history.at(-1).outcome, 'rejected');
});

test('concurrent calls cannot race the single private attribution transition', async () => {
  const gate = await attribution.open();
  const candidate = text(gate, 'fictional-complete');
  const results = await Promise.all([gate.attachText(candidate), gate.attachText(candidate)]);
  assert.equal(results.filter((r) => r.outcome === 'attached').length, 1);
  assert.equal(results.filter((r) => r.code === 'INSPECTION_BUSY').length, 1);
  assert.equal(gate.snapshot().attachedRecords, 3);
});

test('bounded negative history refuses overflow rather than deleting failures', async () => {
  const gate = await capturedGate();
  for (let i = 0; i < attribution.HISTORY_LIMIT; i++) await gate.attachText(text(gate, 'wrong-run'));
  assert.equal((await gate.attachText(text(gate, 'fictional-complete'))).code, 'HISTORY_LIMIT');
  assert.equal(gate.snapshot().history.length, 16);
  assert.equal(gate.snapshot().history[0].code, 'RUN_MISMATCH');
  assert.equal(gate.snapshot().metrics.currentAttributedTierRecords, 0);
});
