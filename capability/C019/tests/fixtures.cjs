'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { newScratch } = require('..\\..\\C015\\tests\\scratch.cjs');
const { persist } = require('..\\..\\C015\\store.cjs');
const { makeState, makePersisted, canonical, FixtureError } = require('..\\..\\C015\\contract.cjs');
const { inspect, projectError } = require('..\\inspect.cjs');
const { RecoveryConsole } = require('..\\recovery.js');
const types = require('..\\errors.js');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

const cases = Object.freeze([
  { id: 'missing-state', label: 'Missing selected state', code: 'STATE_MISSING', setup: false },
  { id: 'missing-run', label: 'Missing second run (not the first run)', code: 'STATE_MISSING', runId: 'synthetic-run-002' },
  { id: 'wrong-run', label: 'Rejected unknown run; run context unknown', code: 'UNKNOWN_RUN_ID', runId: 'unknown-synthetic-run' },
  { id: 'held-partial', label: 'Process exited during partial write; publication unobserved', code: 'HOLD_UNOBSERVED', fault: 'after-partial-write' },
  { id: 'held-flushed', label: 'Process exited after staging flush; publication unobserved', code: 'HOLD_UNOBSERVED', fault: 'after-flush' },
  { id: 'held-published', label: 'Process exited after publication before acknowledgment', code: 'HOLD_UNOBSERVED', fault: 'after-publish' },
  { id: 'corrupt-json', label: 'Owned malformed epoch; no previous-state fallback', code: 'CORRUPT_JSON', corruption: 'json' },
  { id: 'digest-mismatch', label: 'Owned state digest mismatch', code: 'STATE_DIGEST', corruption: 'digest' },
  { id: 'ack-mismatch', label: 'Owned acknowledgment mismatch', code: 'ACKNOWLEDGMENT_MISMATCH', corruption: 'ack' },
  { id: 'history-gap', label: 'Owned epoch gap; previous acknowledgment retained', code: 'HISTORY_GAP', corruption: 'gap' },
  { id: 'stale-epoch', label: 'Rejected retry of an acknowledged epoch', code: 'STALE_EPOCH', action: 'setup' },
  { id: 'invalid-epoch', label: 'Rejected string epoch; no numeric coercion', code: 'UNKNOWN_EPOCH', action: 'invalid-epoch' },
  { id: 'invalid-shape', label: 'Rejected additional input field', code: 'CLOSED_SCHEMA', action: 'invalid-shape' },
]);

async function observeCase(config) {
  const scratch = newScratch();
  assert.equal(fs.existsSync(scratch.location.root), false, 'The unique namespace must not already exist.');
  const processes = [];
  function child(action, runId = 'synthetic-run-001', epoch, fault) {
    const args = [path.join(__dirname, 'fixture-worker.cjs'), action, scratch.namespace, runId];
    if (epoch !== undefined) args.push(epoch);
    if (fault !== undefined) args.push(fault);
    const result = spawnSync(process.execPath, args, { timeout: 90000, maxBuffer: 1024 * 1024, windowsHide: true });
    scratch.trackChild(runId);
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    const output = result.status === 0 ? result.stdout : result.stderr;
    const value = JSON.parse(output.toString('utf8').trim().split(/\r?\n/).at(-1));
    const observed = { action, pid: value.pid, exitCode: result.status, value,
      stdout: result.stdout, stderr: result.stderr };
    processes.push(observed);
    return observed;
  }
  let record;
  try {
    const baseline = config.setup === false ? null : child('setup', 'synthetic-run-001', '1');
    if (baseline) {
      assert.equal(baseline.exitCode, 0);
      assert.equal(baseline.value.acknowledged, true);
      assert.equal(baseline.value.regularFileFlushes, 2);
    }
    const ackPath = baseline ? scratch.target('synthetic-run-001\\epoch-001.json') : null;
    const before = ackPath ? fs.readFileSync(ackPath) : null;
    let operation = null;
    const runId = config.runId === undefined ? 'synthetic-run-001' : config.runId;
    const pendingEpoch = config.fault || config.corruption ? (config.corruption === 'gap' ? 3 : 2)
      : config.action === 'setup' ? 1 : null;
    const context = { runId, epoch: pendingEpoch,
      pendingStep: baseline ? baseline.value.state.record.pendingStep : null };
    const prior = baseline ? baseline.value.acknowledgment : null;

    if (config.fault) {
      operation = child('fault', runId, '2', config.fault);
      assert.equal(operation.exitCode, 86);
      assert.equal(operation.value.code, 'FAIL_BEFORE_ACK');
      assert.equal(operation.value.stage, config.fault);
      assert.equal(operation.value.acknowledged, false);
      assert.equal(operation.stdout.length, 0, 'Fault process must not emit an acknowledgment.');
    } else if (config.corruption) {
      const epoch = config.corruption === 'gap' ? 3 : 2;
      const candidate = makePersisted(makeState(runId, epoch), baseline.value.stateSha256);
      let bytes;
      if (config.corruption === 'json') bytes = Buffer.from('{"formatVersion":1, malformed}\r\n');
      else {
        if (config.corruption === 'digest') candidate.stateSha256 = '0'.repeat(64);
        if (config.corruption === 'ack') candidate.acknowledgment.epoch = 1;
        bytes = Buffer.from(canonical(candidate) + '\r\n');
      }
      const relative = `synthetic-run-001\\epoch-00${epoch}.json`;
      assert.equal(fs.existsSync(scratch.target(relative)), false, 'Corruption fixtures never overwrite acknowledged files.');
      await scratch.writeBytes(relative, bytes);
    } else if (config.action) {
      operation = config.action === 'setup' ? child('setup', runId, '1') : child(config.action, runId);
      assert.equal(operation.exitCode, 1);
      assert.equal(operation.value.code, config.code);
      assert.equal(operation.value.errorType, 'C015FixtureError');
    }

    let apiFailure;
    let failedProcess;
    if (config.action) {
      try {
        const candidate = config.action === 'setup' ? makeState(runId, 1)
          : config.action === 'invalid-epoch' ? { ...makeState(runId, 1), epoch: '2' }
            : { ...makeState(runId, 1), unexpected: true };
        await persist(scratch.namespace, candidate);
        assert.fail('The real invalid or stale C015 write must reject before any mutation.');
      } catch (error) {
        assert.ok(error instanceof FixtureError);
        assert.equal(error.code, config.code);
        apiFailure = projectError(error, context, prior);
      }
      failedProcess = operation;
    } else {
      failedProcess = child('read', runId);
      assert.equal(failedProcess.exitCode, 1);
      assert.equal(failedProcess.value.errorType, 'C015FixtureError');
      apiFailure = await inspect(scratch.namespace, context, prior);
    }
    assert.equal(failedProcess.value.code, config.code);
    assert.equal(failedProcess.value.acknowledged, false);
    assert.equal(failedProcess.value.restored, false);
    assert.equal(apiFailure.kind, 'C019-typed-failure');
    assert.equal(apiFailure.error.code, config.code);
    assert.equal(apiFailure.error.name, 'C015FixtureError');
    assert.deepEqual(apiFailure.context, {
      runId: types.runIds.includes(runId) ? runId : null,
      epoch: pendingEpoch, pendingStep: context.pendingStep,
    });
    const console = new RecoveryConsole('actual-read-only');
    const state = console.observe(apiFailure).state;
    assert.equal(state.status, config.code === 'HOLD_UNOBSERVED' ? 'held-unobserved' : 'failed');
    assert.equal(state.recoveryConfirmed, false);
    assert.deepEqual(state.failure.priorAcknowledgment, prior);
    const after = ackPath ? fs.readFileSync(ackPath) : null;
    if (before) assert.deepEqual(after, before, 'Earlier acknowledged bytes must remain exact through all failures.');
    const ownedFiles = [];
    for (const target of scratch.files.keys()) {
      if (fs.existsSync(target)) {
        const bytes = fs.readFileSync(target);
        ownedFiles.push({ relative: path.relative(scratch.location.root, target), bytes });
      }
    }
    record = {
      id: config.id, label: config.label, expectedCode: config.code,
      namespace: scratch.namespace, apiFailure, processes,
      previousAcknowledgmentExists: before !== null,
      acknowledgedBytesBefore: before, acknowledgedBytesAfter: after,
      acknowledgedSha256Before: before === null ? null : sha(before),
      acknowledgedSha256After: after === null ? null : sha(after),
      acknowledgmentBytesPreserved: before === null ? null : before.equals(after),
      testFault: config.fault === undefined ? null : config.fault,
      explicitlyOwnedCorruption: config.corruption === undefined ? null : config.corruption,
      ownedFiles, recoveryConfirmed: false, writesAuthorizedByRecovery: false,
      passed: true, cleaned: false,
    };
  } finally {
    await scratch.cleanup();
    assert.equal(fs.existsSync(scratch.location.root), false, 'Only tracked files and empty owned namespace directories are cleaned.');
    if (record) record.cleaned = true;
  }
  return record;
}

module.exports = Object.freeze({ cases, observeCase });
