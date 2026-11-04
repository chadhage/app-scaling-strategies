'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { makeState, maxBytes } = require('..\\contract.cjs');
const { persist } = require('..\\store.cjs');
const { newScratch } = require('./scratch.cjs');

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

for (const stage of ['after-partial-write', 'after-flush', 'after-publish']) {
  test(`real owned writer exits ${stage}; fresh restart holds without losing the prior acknowledged bytes`, async (t) => {
    const scratch = newScratch();
    try {
      const first = scratch.child('write', 'synthetic-run-001', 1);
      assert.equal(first.exitCode, 0, first.stderr);
      const oldPath = scratch.target('synthetic-run-001\\epoch-001.json');
      const before = fs.readFileSync(oldPath);
      const failing = scratch.child('fail', 'synthetic-run-001', 2, stage);
      assert.equal(failing.exitCode, 86);
      assert.equal(failing.stdout, '', 'No acknowledgment may precede completed durable publication.');
      assert.equal(failing.value.acknowledged, false);
      assert.equal(failing.value.stage, stage);
      const reader = scratch.child('read');
      assert.equal(reader.exitCode, 1);
      assert.equal(reader.value.code, 'HOLD_UNOBSERVED');
      assert.equal(reader.value.restored, false);
      assert.notEqual(first.value.pid, failing.value.pid);
      assert.notEqual(failing.value.pid, reader.value.pid);
      assert.deepEqual(fs.readFileSync(oldPath), before);
      const name = stage === 'after-publish' ? 'epoch-002.json' : 'pending-002.json';
      const unobserved = fs.readFileSync(scratch.target(`synthetic-run-001\\${name}`));
      if (stage === 'after-partial-write') assert.throws(() => JSON.parse(unobserved.toString('utf8')));
      else assert.deepEqual(JSON.parse(unobserved.toString('utf8')).state, makeState('synthetic-run-001', 2));
      t.diagnostic(JSON.stringify({
        observation: 'actual-fail-before-ack-and-fresh-reader-hold', stage,
        priorWriterPid: first.value.pid, failedWriterPid: failing.value.pid,
        freshReaderPid: reader.value.pid, exitCode: failing.exitCode,
        priorVerifiedSha256: sha(before), retainedSha256: sha(fs.readFileSync(oldPath)),
        unobservedFile: name, unobservedBytes: unobserved.length,
        readerCode: reader.value.code, noAcknowledgment: failing.stdout === '',
      }));
    } finally {
      await scratch.cleanup();
    }
  });
}

test('fresh readers reject real on-disk corruption, wrong types, duplicate fields, extra fields and oversize bytes', async (t) => {
  const scratch = newScratch();
  try {
    const first = scratch.child('write', 'synthetic-run-001', 1);
    assert.equal(first.exitCode, 0, first.stderr);
    const relative = 'synthetic-run-001\\epoch-001.json';
    const original = fs.readFileSync(scratch.target(relative));
    const originalJson = JSON.parse(original.toString('utf8'));
    const cases = [
      ['truncated', Buffer.from('{partial'), 'CORRUPT_JSON'],
      ['duplicate', Buffer.from(original.toString('utf8').replace('"formatVersion":1', '"formatVersion":1,"formatVersion":1')), 'CORRUPT_JSON'],
      ['oversize', Buffer.alloc(maxBytes + 1, 0x20), 'STATE_OVERSIZE'],
      ['wrong-version', { ...originalJson, formatVersion: '1' }, 'FILE_VERSION'],
      ['digest', { ...originalJson, stateSha256: '0'.repeat(64) }, 'STATE_DIGEST'],
      ['predecessor', { ...originalJson, previousStateSha256: 'a'.repeat(64) }, 'HISTORY_CHAIN'],
      ['extra-field', { ...originalJson, override: true }, 'CLOSED_SCHEMA'],
      ['wrong-ack-type', { ...originalJson, acknowledgment: { ...originalJson.acknowledgment, published: 'true' } }, 'ACKNOWLEDGMENT_MISMATCH'],
      ['extra-ack-field', { ...originalJson, acknowledgment: { ...originalJson.acknowledgment, extra: true } }, 'CLOSED_SCHEMA'],
      ['wrong-record-type', { ...originalJson, state: { ...originalJson.state, record: { ...originalJson.state.record, acknowledgedUnits: '1' } } }, 'NON_SYNTHETIC_STATE'],
      ['wrong-run', { ...originalJson, state: { ...originalJson.state, runId: 'real-user' } }, 'UNKNOWN_RUN_ID'],
    ];
    for (const [name, corrupted, code] of cases) {
      await scratch.writeBytes(relative, Buffer.isBuffer(corrupted) ? corrupted : Buffer.from(JSON.stringify(corrupted)));
      const reader = scratch.child('read');
      assert.equal(reader.exitCode, 1, name);
      assert.equal(reader.value.code, code, name);
      assert.equal(reader.value.restored, false, name);
      assert.equal(reader.value.acknowledged, false, name);
      // Explicit test-only restoration of saved bytes, not a runtime recovery API.
      await scratch.writeBytes(relative, original);
      assert.deepEqual(fs.readFileSync(scratch.target(relative)), original);
      t.diagnostic(JSON.stringify({ corruption: name, actualReaderPid: reader.value.pid, code, restored: false }));
    }
    assert.deepEqual(scratch.child('read').value.state, first.value.state);
  } finally {
    await scratch.cleanup();
  }
});

test('missing acknowledged history and unpublished staging state fail or hold rather than falling back', async () => {
  const scratch = newScratch();
  try {
    for (const epoch of [1, 2]) assert.equal(scratch.child('write', 'synthetic-run-001', epoch).exitCode, 0);
    await scratch.unlink('synthetic-run-001\\epoch-001.json');
    const missing = scratch.child('read');
    assert.equal(missing.exitCode, 1);
    assert.equal(missing.value.code, 'HISTORY_GAP');
    await scratch.writeBytes('synthetic-run-001\\pending-003.json', '{partial');
    const hold = scratch.child('read');
    assert.equal(hold.exitCode, 1);
    assert.equal(hold.value.code, 'HOLD_UNOBSERVED');
  } finally {
    await scratch.cleanup();
  }
});

test('an unknown real file and a directory posing as state cannot be acknowledged', async () => {
  const scratch = newScratch();
  try {
    assert.equal(scratch.child('write', 'synthetic-run-001', 1).exitCode, 0);
    await scratch.writeBytes('synthetic-run-001\\unknown.json', '{}');
    assert.equal(scratch.child('read').value.code, 'UNEXPECTED_FILE');
    await scratch.unlink('synthetic-run-001\\unknown.json');
    await scratch.unlink('synthetic-run-001\\epoch-001.json');
    await scratch.mkdir('synthetic-run-001\\epoch-001.json');
    assert.equal(scratch.child('read').value.code, 'UNSAFE_FILE');
  } finally {
    await scratch.cleanup();
  }
});

test('actual owned Windows junctions are rejected without following the target or writing through the link', async () => {
  const scratch = newScratch();
  try {
    await scratch.mkdir('synthetic-run-002');
    const targetBefore = fs.readdirSync(scratch.target('synthetic-run-002'));
    await scratch.junction('synthetic-run-002', 'synthetic-run-001');
    const reader = scratch.child('read');
    const writer = scratch.child('write', 'synthetic-run-001', 1);
    assert.equal(reader.exitCode, 1);
    assert.equal(writer.exitCode, 1);
    assert.equal(reader.value.code, 'UNSAFE_PATH');
    assert.equal(writer.value.code, 'UNSAFE_PATH');
    assert.deepEqual(fs.readdirSync(scratch.target('synthetic-run-002')), targetBefore);
  } finally {
    await scratch.cleanup();
  }
});

test('actual hard-linked state is rejected and only the explicitly created links are cleaned', async () => {
  const scratch = newScratch();
  try {
    assert.equal(scratch.child('write', 'synthetic-run-001', 1).exitCode, 0);
    await scratch.hardlink('synthetic-run-001\\epoch-001.json', 'synthetic-run-001\\unknown.json');
    const reader = scratch.child('read');
    assert.equal(reader.exitCode, 1);
    assert.equal(reader.value.code, 'UNSAFE_FILE');
  } finally {
    await scratch.cleanup();
  }
});

test('real file flush failure is an explicit storage error with no acknowledgment and a fresh reader hold', async () => {
  const scratch = newScratch();
  try {
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'store.cjs'), 'utf8');
    const module = { exports: {} };
    const load = new Function('require', 'module', 'process', 'Buffer', source);
    load((specifier) => {
      if (specifier === 'node:fs') return new Proxy(fs, {
        get(target, key) {
          if (key === 'fsyncSync') return () => { throw Object.assign(new Error('Explicit test-only flush failure'), { code: 'EIO' }); };
          return target[key];
        },
      });
      return specifier.startsWith('node:') ? require(specifier) : require(path.resolve(__dirname, '..', specifier));
    }, module, process, Buffer);
    await assert.rejects(module.exports.persist(scratch.namespace, makeState('synthetic-run-001', 1)), (error) =>
      error.code === 'STORAGE_ERROR' && error.details[0].code === 'EIO');
    scratch.trackChild('synthetic-run-001');
    const reader = scratch.child('read');
    assert.equal(reader.exitCode, 1);
    assert.equal(reader.value.code, 'HOLD_UNOBSERVED');
  } finally {
    scratch.trackChild('synthetic-run-001');
    await scratch.cleanup();
  }
});

test('fault controls, option accessors and malformed state cannot escape test scope or trigger writes', async () => {
  const scratch = newScratch();
  let getterCalled = false;
  try {
    await assert.rejects(persist('synthetic-restart-v1', makeState('synthetic-run-001', 1), { testFault: 'after-publish' }), { code: 'TEST_FAULT_SCOPE' });
    await assert.rejects(persist(scratch.namespace, makeState('synthetic-run-001', 1), { override: true }), { code: 'CLOSED_SCHEMA' });
    const options = {};
    Object.defineProperty(options, 'testFault', { enumerable: true, get() { getterCalled = true; return 'after-publish'; } });
    await assert.rejects(persist(scratch.namespace, makeState('synthetic-run-001', 1), options), { code: 'INVALID_JSON_DATA' });
    assert.equal(getterCalled, false);
    assert.equal(fs.existsSync(scratch.location.root), false);
    const state = makeState('synthetic-run-001', 1);
    state.record.status = 'not-synthetic';
    await assert.rejects(persist(scratch.namespace, state), { code: 'NON_SYNTHETIC_STATE' });
    assert.equal(fs.existsSync(scratch.location.root), false);
  } finally {
    await scratch.cleanup();
  }
});
