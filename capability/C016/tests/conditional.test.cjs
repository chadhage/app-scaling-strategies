'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { newScratch, fresh, bytes } = require('./process-harness.cjs');
const { makeCommand, describeCommand } = require('..\\commands.cjs');

test('fresh submit and identical retry observe ONE actual epoch and matching acknowledgment', async (t) => {
  const scratch = newScratch();
  const processes = [];
  try {
    const first = fresh(scratch, 'apply', 0);
    processes.push(first);
    assert.equal(first.exitCode, 0, first.stderr);
    assert.equal(first.value.outcome, 'positive', 'A fresh submit must actually publish and acknowledge the intended local epoch.');
    assert.equal(first.value.disposition, 'published');
    const originalBytes = bytes(scratch);
    assert.equal(Object.keys(originalBytes).length, 1);
    const retry = fresh(scratch, 'apply', 0);
    const reader = fresh(scratch, 'read');
    processes.push(retry, reader);
    assert.equal(retry.value.disposition, 'idempotent-confirmed');
    assert.equal(retry.value.publicationPerformed, false);
    assert.deepEqual(retry.value.acknowledgment, first.value.acknowledgment);
    assert.deepEqual(reader.value.acknowledgment, first.value.acknowledgment);
    assert.equal(reader.value.state.epoch, 1);
    assert.equal(reader.value.state.record.acknowledgedUnits, 1);
    assert.notEqual(first.value.pid, retry.value.pid);
    assert.notEqual(retry.value.pid, reader.value.pid);
    assert.deepEqual(bytes(scratch), originalBytes);
  } finally {
    await scratch.cleanup();
    t.diagnostic(JSON.stringify({ namespace: scratch.namespace, processes, exactOwnedScratchCleaned: true }));
  }
});

test('actual epoch condition, different payload, closed fields and older matching history never advance incorrectly', async (t) => {
  const scratch = newScratch();
  const processes = [];
  const call = (...args) => { const result = fresh(scratch, ...args); processes.push(result); return result; };
  try {
    assert.equal(call('apply', 0).value.disposition, 'published');
    const firstBytes = bytes(scratch);
    const future = call('apply', 2);
    assert.equal(future.value.outcome, 'negative');
    assert.equal(future.value.code, 'EXPECTED_EPOCH_CONFLICT');
    assert.equal(future.value.acknowledgment, null);
    assert.equal(future.value.publicationPerformed, false);
    assert.equal(future.value.allowedRecovery, 'inspect-and-declare-next');
    assert.equal(call('apply', 1, 'different-payload').value.code, 'NON_SYNTHETIC_STATE');
    assert.equal(call('apply', 1, 'extra-field').value.code, 'CLOSED_SCHEMA');
    assert.deepEqual(bytes(scratch), firstBytes);
    const second = call('apply', 1);
    const third = call('apply', 2);
    assert.equal(second.value.disposition, 'published');
    assert.equal(third.value.disposition, 'published');
    const finalBytes = bytes(scratch);
    assert.equal(Object.keys(finalBytes).length, 3);
    assert.equal(finalBytes['001'], firstBytes['001']);
    const oldRetry = call('apply', 0);
    assert.equal(oldRetry.value.code, 'MATCHING_VERIFIED_HISTORY');
    assert.equal(oldRetry.value.acknowledgment, null, 'The latest-only C015 API must not be used to fabricate an older acknowledgment.');
    assert.equal(oldRetry.value.observation.observedEpoch, 3);
    assert.equal(oldRetry.value.observation.matchedEpoch, 1);
    assert.equal(call('apply', 2).value.code, 'MATCHING_LOCAL_ACK');
    const restored = call('read');
    assert.equal(restored.value.state.epoch, 3);
    assert.equal(restored.value.state.record.acknowledgedUnits, 3);
    assert.deepEqual(restored.value.history.map((item) => item.epoch), [1, 2, 3]);
    assert.deepEqual(bytes(scratch), finalBytes);
    const other = call('apply', 0, undefined, 'synthetic-run-002');
    assert.equal(other.value.disposition, 'published');
    assert.equal(other.value.acknowledgment.runId, 'synthetic-run-002');
    assert.deepEqual(bytes(scratch), finalBytes);
  } finally {
    await scratch.cleanup();
    t.diagnostic(JSON.stringify({ namespace: scratch.namespace, processes, exactOwnedScratchCleaned: true }));
  }
});

test('declarations reject unknown identity, arbitrary data and unsafe expected epochs without defaults', () => {
  const original = makeCommand('synthetic-run-001', 0);
  assert.deepEqual(describeCommand(original), describeCommand(structuredClone(original)));
  assert.notEqual(describeCommand(original).commandId, describeCommand(makeCommand('synthetic-run-002', 0)).commandId);
  for (const epoch of [-0, -1, 3, 0.5, '0', true, NaN, Infinity]) {
    assert.throws(() => makeCommand('synthetic-run-001', epoch), { code: 'EXPECTED_EPOCH_RANGE' });
  }
  assert.throws(() => makeCommand('unknown-run', 0), { code: 'UNKNOWN_RUN_ID' });
  for (const mutation of [
    (value) => { value.kind = 'delete'; },
    (value) => { value.schemaVersion = 2; },
    (value) => { value.candidate.epoch = 2; },
    (value) => { value.commandId = 'visitor-choice'; },
  ]) {
    const value = structuredClone(original);
    mutation(value);
    assert.throws(() => describeCommand(value));
  }
});

test('command input snapshot prevents mutation during asynchronous consent from changing the intended local effect', async (t) => {
  const scratch = newScratch();
  const processes = [];
  try {
    const observed = fresh(scratch, 'mutate-input', 0);
    processes.push(observed);
    assert.equal(observed.exitCode, 0, observed.stderr);
    assert.notEqual(observed.value.callerChangedTo.commandId, observed.value.declared.commandId);
    assert.equal(observed.value.result.commandId, observed.value.declared.commandId,
      'A pending command must keep its declared input identity, not publish the caller-mutated run.');
    assert.equal(observed.value.result.acknowledgment.runId, 'synthetic-run-001');
    const intended = fresh(scratch, 'read');
    const notIntended = fresh(scratch, 'read', undefined, undefined, 'synthetic-run-002');
    processes.push(intended, notIntended);
    assert.equal(intended.exitCode, 0);
    assert.equal(intended.value.state.epoch, 1);
    assert.equal(notIntended.exitCode, 1);
    assert.equal(notIntended.value.code, 'STATE_MISSING');
    assert.equal(Object.keys(bytes(scratch)).length, 1);
    assert.equal(Object.keys(bytes(scratch, 'synthetic-run-002')).length, 0);
  } finally {
    await scratch.cleanup();
    t.diagnostic(JSON.stringify({ namespace: scratch.namespace, processes, exactOwnedScratchCleaned: true }));
  }
});
