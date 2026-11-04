'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeState } = require('..\\contract.cjs');
const { newScratch } = require('./scratch.cjs');

const root = path.resolve(__dirname, '..');
test('fresh exited writers and a new reader retain the exact acknowledged epoch state on disk', async (t) => {
  const scratch = newScratch();
  const namespace = scratch.namespace;
  const expected = makeState('synthetic-run-001', 2);
  try {
    const firstProcess = scratch.child('write', expected.runId, 1);
    const secondProcess = scratch.child('write', expected.runId, 2);
    const readerProcess = scratch.child('read', expected.runId);
    for (const observed of [firstProcess, secondProcess, readerProcess]) assert.equal(observed.exitCode, 0, observed.stderr);
    const first = firstProcess.value;
    const second = secondProcess.value;
    const reader = readerProcess.value;
    assert.deepEqual(reader.state, expected, 'A fresh process must restore the actual persisted epoch, not an in-memory or synthetic fallback.');
    assert.equal(first.acknowledged, true);
    assert.equal(second.acknowledged, true);
    assert.equal(reader.restored, true);
    assert.notEqual(first.pid, second.pid);
    assert.notEqual(second.pid, reader.pid);
    assert.notEqual(reader.pid, process.pid);
    assert.deepEqual(reader.acknowledgment, second.acknowledgment);
    assert.deepEqual(reader.history.map((entry) => entry.epoch), [1, 2]);
    const persisted = path.join(root, 'test-scratch', namespace, expected.runId, 'epoch-002.json');
    assert.deepEqual(JSON.parse(fs.readFileSync(persisted, 'utf8')).state, expected);
    t.diagnostic(JSON.stringify({
      observation: 'real-fresh-process-state-restored', writerPids: [first.pid, second.pid],
      readerPid: reader.pid, state: reader.state, acknowledgment: reader.acknowledgment,
      history: reader.history, persistedBytes: fs.statSync(persisted).size,
    }));
  } finally {
    await scratch.cleanup();
  }
});

test('a fresh reader does not fabricate a run or initialize missing disk state', async () => {
  const scratch = newScratch();
  try {
    await scratch.mkdir('');
    const before = fs.readdirSync(scratch.location.root);
    const reader = scratch.child('read');
    assert.equal(reader.exitCode, 1);
    assert.equal(reader.value.code, 'STATE_MISSING');
    assert.equal(reader.value.restored, false);
    assert.deepEqual(fs.readdirSync(scratch.location.root), before);
  } finally {
    await scratch.cleanup();
  }
});

test('separate synthetic runs retain independent epochs and all prior acknowledged fields', async () => {
  const scratch = newScratch();
  try {
    for (const [runId, epoch] of [['synthetic-run-001', 1], ['synthetic-run-001', 2], ['synthetic-run-002', 1]]) {
      const observed = scratch.child('write', runId, epoch);
      assert.equal(observed.exitCode, 0, observed.stderr);
    }
    const a = scratch.child('read', 'synthetic-run-001');
    const b = scratch.child('read', 'synthetic-run-002');
    assert.equal(a.exitCode, 0, a.stderr);
    assert.equal(b.exitCode, 0, b.stderr);
    assert.deepEqual(a.value.state, makeState('synthetic-run-001', 2));
    assert.deepEqual(b.value.state, makeState('synthetic-run-002', 1));
    assert.equal(a.value.writesPerformed, 0);
    assert.equal(b.value.writesPerformed, 0);
    const stale = scratch.child('write', 'synthetic-run-001', 2);
    assert.equal(stale.exitCode, 1);
    assert.equal(stale.value.code, 'STALE_EPOCH');
    assert.deepEqual(scratch.child('read').value.state, makeState('synthetic-run-001', 2));
  } finally {
    await scratch.cleanup();
  }
});
