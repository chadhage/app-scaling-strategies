'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { newScratch, fresh, bytes, runId } = require('./process-harness.cjs');
const { makeCommand, execute } = require('..\\commands.cjs');
const { evaluateApprovals, scopedApproval } = require('..\\..\\C015\\consent.cjs');
const approval = require('..\\..\\C001\\approved-contract.js').approval;
const { entry } = require('..\\conduct.cjs');
const { replay } = require('..\\journal.js');

test('actual lost stdout stays unknown after a fresh identical retry confirms existing matching acknowledgment', async (t) => {
  const scratch = newScratch();
  const processes = [];
  try {
    const original = fresh(scratch, 'lost-stdout', 0);
    processes.push(original);
    assert.equal(original.exitCode, 87);
    assert.equal(original.stdout, '');
    assert.equal(original.value.code, 'CLIENT_ACK_UNOBSERVED');
    assert.equal(original.value.acknowledged, false);
    const originalBytes = bytes(scratch);
    const retry = fresh(scratch, 'apply', 0);
    processes.push(retry);
    assert.equal(retry.value.code, 'MATCHING_LOCAL_ACK');
    assert.deepEqual(bytes(scratch), originalBytes);
    const before = entry(original, 1, 0);
    const after = replay([before, entry(retry, 2, 0)]);
    assert.deepEqual(after.entries[0], before);
    assert.equal(after.originalUserImpact, 'unknown');
    assert.equal(after.latestOutcome, 'positive');
    assert.deepEqual(after.unknownAttempts, [1]);
    assert.equal(after.entries[0].result.acknowledgment, null);
    assert.equal(after.entries[0].process.stderr, original.stderr);
    assert.ok(Object.isFrozen(after.entries[0].result));
    t.diagnostic(JSON.stringify({ journal: after }));
  } finally {
    await scratch.cleanup();
    t.diagnostic(JSON.stringify({ namespace: scratch.namespace, processes, exactOwnedScratchCleaned: true }));
  }
});

test('actual C015 partial, flushed and published unobserved states all hold without a previous matching receipt', { timeout: 600000 }, async (t) => {
  for (const stage of ['after-partial-write', 'after-flush', 'after-publish']) {
    const scratch = newScratch();
    const processes = [];
    try {
      const initial = fresh(scratch, 'apply', 0);
      processes.push(initial);
      assert.equal(initial.value.disposition, 'published');
      const firstBytes = bytes(scratch);
      const failed = fresh(scratch, 'c015-fault', 1, stage);
      processes.push(failed);
      assert.equal(failed.exitCode, 86);
      assert.equal(failed.value.stage, stage);
      assert.equal(failed.stdout, '');
      const marker = scratch.target('writer.lock');
      assert.equal(fs.existsSync(marker), true);
      const markerBefore = fs.readFileSync(marker);
      const olderRetry = fresh(scratch, 'apply', 0);
      const nextRetry = fresh(scratch, 'apply', 1);
      processes.push(olderRetry, nextRetry);
      for (const observed of [olderRetry, nextRetry]) {
        assert.equal(observed.value.outcome, 'unknown');
        assert.equal(observed.value.code, 'HOLD_UNOBSERVED');
        assert.equal(observed.value.acknowledgment, null);
        assert.equal(observed.value.observation, null);
        assert.equal(observed.value.allowedRecovery, 'operator-review-no-marker-reclamation');
      }
      assert.deepEqual(fs.readFileSync(marker), markerBefore);
      assert.equal(bytes(scratch)['001'], firstBytes['001']);
      assert.equal(fs.existsSync(scratch.target(path.join(runId, 'epoch-003.json'))), false);
      assert.equal(fs.existsSync(scratch.target(path.join(runId, 'epoch-002.json'))), stage === 'after-publish');
    } finally {
      await scratch.cleanup();
      t.diagnostic(JSON.stringify({ stage, namespace: scratch.namespace, processes, exactOwnedScratchCleaned: true }));
    }
  }
});

test('fresh corrupt-state inspection is unknown, missing precondition rejects and no implicit repair is performed', async (t) => {
  const scratch = newScratch();
  const processes = [];
  try {
    const missing = fresh(scratch, 'apply', 1);
    processes.push(missing);
    assert.equal(missing.value.code, 'EXPECTED_EPOCH_CONFLICT');
    assert.equal(fs.existsSync(scratch.location.root), false);
    processes.push(fresh(scratch, 'apply', 0));
    const file = path.join(runId, 'epoch-001.json');
    await scratch.writeBytes(file, Buffer.from('{"state":}\r\n'));
    const corruptedBytes = bytes(scratch);
    const refused = fresh(scratch, 'apply', 1);
    processes.push(refused);
    assert.equal(refused.value.outcome, 'unknown');
    assert.equal(refused.value.code, 'CORRUPT_JSON');
    assert.equal(refused.value.acknowledgment, null);
    assert.deepEqual(bytes(scratch), corruptedBytes);
  } finally {
    await scratch.cleanup();
    t.diagnostic(JSON.stringify({ namespace: scratch.namespace, processes, exactOwnedScratchCleaned: true }));
  }
});

test('unchanged callee requires literal and exact scoped consent; retained demo and unknown namespaces reject before IO', async () => {
  for (const supplied of [false, 'true', undefined]) {
    const C001 = { ...approval };
    const C015 = { ...scopedApproval };
    if (supplied === undefined) {
      delete C001.designAndLocalImplementationApproved;
      delete C015.approved;
    } else {
      C001.designAndLocalImplementationApproved = supplied;
      C015.approved = supplied;
    }
    await assert.rejects(evaluateApprovals({ C001, C015: scopedApproval }),
      { code: 'LOCAL_CONSENT_REQUIRED' });
    await assert.rejects(evaluateApprovals({ C001: approval, C015 }),
      { code: 'SCOPED_C015_APPROVAL_REQUIRED' });
  }
  await assert.rejects(evaluateApprovals({ C001: approval, C015: { ...scopedApproval, realUserData: true } }),
    { code: 'SCOPED_C015_APPROVAL_DRIFT' });
  for (const namespace of ['synthetic-restart-v1', '..\\C015', 'test-not-a-uuid']) {
    const result = await execute(namespace, makeCommand(runId, 0));
    assert.equal(result.outcome, 'negative');
    assert.equal(result.acknowledgment, null);
    assert.equal(result.publicationPerformed, false);
  }
  const wrongArgs = await execute('synthetic-restart-v1', makeCommand(runId, 0), { approved: true });
  assert.equal(wrongArgs.code, 'ARGUMENT_COUNT');
  assert.equal(wrongArgs.publicationPerformed, false);
});
