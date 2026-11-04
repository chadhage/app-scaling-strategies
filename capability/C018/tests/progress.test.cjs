'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { newFixture } = require('./fixture.cjs');
const { reopen } = require('..\\reader.cjs');
const { readFresh } = require('..\\process-reader.cjs');
const { persist } = require('..\\..\\C015\\store.cjs');
const { makeState } = require('..\\..\\C015\\contract.cjs');

test('a fresh C018 process reopens actual prepared disk progress, not catalogue guesses', async (t) => {
  const fixture = newFixture();
  try {
    const writer = fixture.write('synthetic-run-001', 1);
    assert.equal(writer.exitCode, 0, writer.stderr);
    assert.equal(writer.value.acknowledged, true);
    const file = path.join(fixture.location.root, 'synthetic-run-001', 'epoch-001.json');
    const bytes = fs.readFileSync(file);
    const disk = JSON.parse(bytes);
    const reader = fixture.read('synthetic-run-001');
    assert.equal(reader.exitCode, 0, reader.stderr);
    assert.deepEqual(reader.value?.state?.record, disk.state.record,
      'Actual reopened progress must expose completed prepare and pending advance from the persisted run.');
    assert.deepEqual(reader.value.state, disk.state);
    assert.deepEqual(reader.value.acknowledgment, disk.acknowledgment);
    assert.equal(reader.value.state.epoch, 1);
    assert.equal(reader.value.writesPerformed, 0);
    assert.notEqual(reader.value.pid, writer.value.pid);
    assert.notEqual(reader.value.pid, process.pid);
    assert.deepEqual(fs.readFileSync(file), bytes);
    t.diagnostic(JSON.stringify({ writer: writer.value, freshReader: reader.value }));
  } finally {
    await fixture.cleanup();
    t.diagnostic(JSON.stringify({ namespace: fixture.namespace, exactCleanup: fixture.removed, namespaceAbsent: !fs.existsSync(fixture.location.root) }));
  }
});

test('both actual named runs retain exact prepared, running and completed fields through epochs 1..3 and fresh reconnect reads', async (t) => {
  const fixture = newFixture();
  const observed = [];
  try {
    for (const runId of ['synthetic-run-001', 'synthetic-run-002']) {
      for (const [epoch, status, completedStep, pendingStep] of [
        [1, 'prepared', 'prepare', 'advance'],
        [2, 'running', 'advance', 'finish'],
        [3, 'completed', 'finish', 'none'],
      ]) {
        const writer = fixture.write(runId, epoch);
        assert.equal(writer.exitCode, 0, writer.stderr);
        const file = path.join(fixture.location.root, runId, `epoch-00${epoch}.json`);
        const bytes = fs.readFileSync(file);
        const disk = JSON.parse(bytes);
        const reader = fixture.read(runId);
        assert.equal(reader.exitCode, 0, reader.stderr);
        const reconnected = await readFresh(fixture.namespace, runId);
        for (const receipt of [reader.value, reconnected]) {
          assert.equal(receipt.restored, true);
          assert.equal(receipt.writesPerformed, 0);
          assert.deepEqual(receipt.state, disk.state);
          assert.deepEqual(receipt.acknowledgment, disk.acknowledgment);
          assert.equal(receipt.stateSha256, disk.stateSha256);
          assert.deepEqual(receipt.state.record, { status, completedStep, pendingStep, acknowledgedUnits: epoch });
          assert.deepEqual(receipt.history.map((entry) => entry.epoch), Array.from({ length: epoch }, (_, index) => index + 1));
          assert.notEqual(receipt.pid, writer.value.pid);
          assert.notEqual(receipt.pid, process.pid);
        }
        assert.notEqual(reader.value.pid, reconnected.pid);
        assert.deepEqual(reader.value.state, reconnected.state);
        assert.deepEqual(fs.readFileSync(file), bytes);
        observed.push({ namespace: fixture.namespace, writer: writer.value, freshReader: reader.value, reconnectReader: reconnected });
      }
    }
    t.diagnostic(JSON.stringify({ observation: 'actual-disk-fields-for-both-named-runs-all-three-epochs', observed }));
  } finally {
    await fixture.cleanup();
    t.diagnostic(JSON.stringify({ namespace: fixture.namespace, exactCleanup: fixture.removed, namespaceAbsent: !fs.existsSync(fixture.location.root) }));
  }
});

test('fresh missing and wrong-ID reads create nothing and never fall back to a different known run', async (t) => {
  const fixture = newFixture();
  try {
    const missing = fixture.read('synthetic-run-001');
    assert.equal(missing.exitCode, 1);
    assert.equal(missing.value.code, 'STATE_MISSING');
    assert.equal(missing.value.restored, false);
    assert.equal(fs.existsSync(fixture.location.root), false);
    const writer = fixture.write('synthetic-run-002', 1);
    assert.equal(writer.exitCode, 0, writer.stderr);
    const wrongKnown = fixture.read('synthetic-run-001');
    assert.equal(wrongKnown.exitCode, 1);
    assert.equal(wrongKnown.value.code, 'STATE_MISSING');
    assert.equal(Object.hasOwn(wrongKnown.value, 'state'), false);
    for (const runId of ['', 'Synthetic-run-002', 'synthetic-run-003', '..\\synthetic-run-002']) {
      const unknown = fixture.read(runId);
      assert.equal(unknown.exitCode, 1);
      assert.equal(unknown.value.code, 'UNKNOWN_RUN_ID');
      assert.equal(unknown.value.restored, false);
    }
    for (const value of [undefined, null, false, 2, {}, ['synthetic-run-002'], new String('synthetic-run-002')]) {
      await assert.rejects(reopen(fixture.namespace, value), { code: 'UNKNOWN_RUN_ID' });
    }
    await assert.rejects(reopen(fixture.namespace), { code: 'INVALID_ARGUMENTS' });
    await assert.rejects(reopen(fixture.namespace, 'synthetic-run-002', 'extra'), { code: 'INVALID_ARGUMENTS' });
    for (const namespace of ['', '..\\C015', 'C015', 'test-not-a-uuid', null, true]) {
      await assert.rejects(readFresh(namespace, 'synthetic-run-002'), { code: 'UNKNOWN_FIXTURE_ID' });
    }
    assert.deepEqual(fs.readdirSync(fixture.location.root), ['synthetic-run-002']);
    t.diagnostic(JSON.stringify({ observation: 'actual-missing-and-unknown-reads', observed: fixture.observations }));
  } finally {
    await fixture.cleanup();
  }
});

test('actual C015 public fault setups hold on their exact remaining marker, including partial corrupt bytes, without stale success', async (t) => {
  for (const fault of ['after-partial-write', 'after-flush', 'after-publish']) {
    const fixture = newFixture();
    try {
      const writer = fixture.write('synthetic-run-001', 1);
      assert.equal(writer.exitCode, 0, writer.stderr);
      const firstFile = path.join(fixture.location.root, 'synthetic-run-001', 'epoch-001.json');
      const firstBytes = fs.readFileSync(firstFile);
      const interrupted = fixture.write('synthetic-run-001', 2, fault);
      assert.equal(interrupted.exitCode, 86);
      assert.equal(interrupted.value.code, 'FAIL_BEFORE_ACK');
      assert.equal(interrupted.value.acknowledged, false);
      assert.equal(fs.existsSync(path.join(fixture.location.root, 'writer.lock')), true);
      if (fault === 'after-partial-write') {
        const partial = fs.readFileSync(path.join(fixture.location.root, 'synthetic-run-001', 'pending-002.json'), 'utf8');
        assert.throws(() => JSON.parse(partial), SyntaxError);
      }
      const reader = fixture.read('synthetic-run-001');
      assert.equal(reader.exitCode, 1);
      assert.equal(reader.value.code, 'HOLD_UNOBSERVED');
      assert.equal(reader.value.restored, false);
      assert.equal(Object.hasOwn(reader.value, 'state'), false);
      assert.deepEqual(fs.readFileSync(firstFile), firstBytes);
      const repeated = fixture.read('synthetic-run-001');
      assert.equal(repeated.value.code, 'HOLD_UNOBSERVED');
      t.diagnostic(JSON.stringify({ observation: 'actual-public-C015-fault-and-fresh-hold', fault,
        namespace: fixture.namespace, setup: interrupted, freshReader: reader, repeatedReader: repeated }));
    } finally {
      await fixture.cleanup();
      t.diagnostic(JSON.stringify({ namespace: fixture.namespace, exactCleanup: fixture.removed, namespaceAbsent: !fs.existsSync(fixture.location.root) }));
    }
  }
});

test('C015 alone rejects new fields, wrong versions, types and impossible step order through its unchanged public API', async () => {
  const fixture = newFixture();
  const original = makeState('synthetic-run-001', 1);
  try {
    for (const [candidate, code] of [
      [{ ...original, progress: {} }, 'CLOSED_SCHEMA'],
      [{ ...original, schemaVersion: 2 }, 'STATE_VERSION_OR_SCOPE'],
      [{ ...original, epoch: '1' }, 'UNKNOWN_EPOCH'],
      [{ ...original, record: { ...original.record, pendingStep: 'none' } }, 'NON_SYNTHETIC_STATE'],
      [{ ...original, record: { ...original.record, completedStep: 'finish' } }, 'NON_SYNTHETIC_STATE'],
      [{ ...original, record: { ...original.record, extra: true } }, 'CLOSED_SCHEMA'],
      [{ ...original, envelope: { ...original.envelope, durationSeconds: 0 } }, 'INVALID_ENVELOPE'],
    ]) {
      await assert.rejects(persist(fixture.namespace, candidate), { code });
      assert.equal(fs.existsSync(fixture.location.root), false);
    }
  } finally {
    await fixture.cleanup();
  }
});
