'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readCurrent } = require('..\\current.cjs');
const { freshFixtureOwner } = require('./support.cjs');
const { checkImports, publisherAuthorized, checkPublisher } = require('..\\pins.cjs');

test('actual current public C015 receipt preserves its existing epoch 1..3 record and independent gates', async () => {
  const read = await readCurrent();
  const receipt = read.receipt;
  assert.equal(receipt.namespace, 'synthetic-restart-v1');
  assert.equal(receipt.state.runId, 'synthetic-run-001');
  assert.ok([1, 2, 3].includes(receipt.state.epoch));
  assert.equal(receipt.state.record.acknowledgedUnits, receipt.state.epoch);
  assert.equal(receipt.history.length, receipt.state.epoch);
  assert.equal(receipt.history.at(-1).stateSha256, receipt.stateSha256);
  assert.equal(receipt.writesPerformed, 0);
  assert.equal(read.nativeCorrelationVerified, false);
  assert.deepEqual(read.gates.cards.map((c) => c.id), ['C015', 'C034']);
  assert.ok(read.gates.cards.every((c) => c.state === 'Done' && c.accepted === true));
  await assert.rejects(readCurrent('caller-run'), { code: 'NO_CURRENT_CONTEXT_OVERRIDES' });
});

test('real public persist in a fresh C015 UUID advances epochs; stale inspection cannot attach', async () => {
  const owner = await freshFixtureOwner();
  let gate;
  try {
    assert.match(owner.namespace, /^test-[0-9a-f-]{36}$/);
    gate = await owner.openGate();
    const old = JSON.stringify(gate.getEvidence('fictional-complete'));
    assert.equal(gate.snapshot().currentExpectedContext.epoch, 1);
    assert.equal((await gate.inspectText(old)).outcome, 'fixture-verified');
    await owner.advance();
    const result = await gate.attachText(old);
    assert.equal(result.code, 'EPOCH_MISMATCH_OR_STALE');
    assert.equal(gate.snapshot().currentExpectedContext.epoch, 2);
    assert.equal(gate.snapshot().currentExpectedContext.record.acknowledgedUnits, 2);
    assert.equal(gate.snapshot().attachedRecords, 0);
    const current = JSON.stringify(gate.getEvidence('fictional-complete'));
    assert.equal((await gate.attachText(current)).outcome, 'attached');
    assert.equal(gate.snapshot().attachedRecords, 3);
    await owner.advance();
    const stale = await gate.attachText(current);
    assert.equal(stale.code, 'EPOCH_MISMATCH_OR_STALE');
    assert.equal(gate.snapshot().currentExpectedContext.epoch, 3);
    assert.equal(gate.snapshot().currentExpectedContext.record.acknowledgedUnits, 3);
    assert.equal(gate.snapshot().metrics.currentAttributedTierRecords, 0,
      'Previous epoch attachments must not count as current.');
    assert.equal(gate.snapshot().historicalAttachedContexts, 1);
    assert.equal(owner.trackedFiles().length, 3);
  } finally { await owner.cleanup(); }
  assert.equal(fs.existsSync(owner.root), false);
});

test('a known retained-demo/other-UUID observation cannot attach to a fresh actual fixture owner', async () => {
  const retained = await require('..\\attribution.js').open();
  const other = JSON.stringify(retained.getEvidence('fictional-complete'));
  const owner = await freshFixtureOwner();
  try {
    const gate = await owner.openGate();
    assert.equal((await gate.attachText(other)).code, 'FIXTURE_NAMESPACE_MISMATCH');
    const history = gate.getEvidence('saved-closed-unlinked');
    assert.equal((await gate.attachText(JSON.stringify(history))).code, 'STALE_DECLARED_FIXTURE_ASSOCIATION');
    assert.equal(gate.snapshot().metrics.currentAttributedTierRecords, 0);
  } finally { await owner.cleanup(); }
  assert.equal(fs.existsSync(owner.root), false);
});

test('current consent and unreadable actual fixture never use a previous-state success fallback', async () => {
  const owner = await freshFixtureOwner();
  const gate = await owner.openGate();
  const candidate = JSON.stringify(gate.getEvidence('fictional-complete'));
  await owner.cleanup();
  const result = await gate.attachText(candidate);
  assert.equal(result.outcome, 'rejected');
  assert.equal(gate.snapshot().currentExpectedContext, null);
  assert.equal(gate.snapshot().metrics.currentAttributedTierRecords, 0);
  assert.equal(fs.existsSync(owner.root), false);
});

test('current parent authorization, not a historical digest, pins the actual publisher', () => {
  const boundary = checkPublisher();
  assert.equal(boundary.actualSha256, boundary.currentParentAuthorization.publisherSha256);
  assert.equal(boundary.currentParentAuthorization.exactAddedClasses.C036, 'D');
  assert.equal(boundary.currentParentAuthorization.focusedGuardChecksPassed >= 41, true);
  const gates = {
    controllerId: boundary.controllerId, currentParentPublisherAuthorization: structuredClone(boundary.currentParentAuthorization)
  };
  assert.equal(publisherAuthorized(boundary.actualSha256, gates), true);
  assert.equal(publisherAuthorized('0'.repeat(64), gates), false);
  gates.currentParentPublisherAuthorization.exactAddedClasses.C036 = 'S';
  assert.equal(publisherAuthorized(boundary.actualSha256, gates), false);
  gates.currentParentPublisherAuthorization.exactAddedClasses.C036 = 'D';
  gates.currentParentPublisherAuthorization.approvedBy = 'caller';
  assert.equal(publisherAuthorized(boundary.actualSha256, gates), false);
});

test('raw CRLF, Git-canonical source and underlying saved provenance remain separately pinned', () => {
  const checked = checkImports();
  assert.equal(checked.direct.length, 16);
  assert.equal(checked.unchangedC034Underlying.length, 22);
  assert.ok(checked.direct.every((c) => /^[0-9a-f]{64}$/.test(c.rawSha256) &&
    /^[0-9a-f]{64}$/.test(c.acceptedGitSha256) && /^[0-9a-f]{64}$/.test(c.crlfToLfSha256)));
});

test('Node CLI accepts no paths, caller contexts, foreign operation or extra arguments', () => {
  const cli = path.resolve(__dirname, '..', 'cli.cjs');
  for (const args of [['attach', '..\\C015'], ['inspect', 'https://example.invalid'],
    ['context', 'caller-context'], ['write', 'fictional-complete'], ['attach', 'fictional-complete', 'eligible']]) {
    const run = spawnSync(process.execPath, [cli, ...args], { timeout: 10000, encoding: 'utf8', windowsHide: true });
    assert.equal(run.status, 2);
    const result = JSON.parse(run.stderr.trim());
    assert.equal(result.code, 'CLOSED_COMMAND_AND_EVIDENCE_ID_REQUIRED');
    assert.equal(result.attachedRecords, 0);
  }
});
