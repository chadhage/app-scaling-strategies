'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { cases, observeCase } = require('./fixtures.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { newScratch } = require('..\\..\\C015\\tests\\scratch.cjs');
const { persist } = require('..\\..\\C015\\store.cjs');
const { makeState, FixtureError } = require('..\\..\\C015\\contract.cjs');
const { inspect, projectError } = require('..\\inspect.cjs');
const { RecoveryConsole } = require('..\\recovery.js');

test('actual C015 public API/process errors, prior acknowledgment bytes and exact cleanup', { timeout: 600000 }, async (t) => {
  const namespaces = new Set();
  for (const config of cases) {
    await t.test(config.id, async () => {
      const actual = await observeCase(config);
      assert.equal(actual.apiFailure.error.code, config.code);
      assert.equal(actual.cleaned, true);
      assert.equal(actual.passed, true);
      assert.equal(actual.recoveryConfirmed, false);
      assert.equal(namespaces.has(actual.namespace), false);
      namespaces.add(actual.namespace);
      if (actual.previousAcknowledgmentExists) assert.equal(actual.acknowledgmentBytesPreserved, true);
      for (const process of actual.processes.filter((entry) => entry.exitCode !== 0)) {
        assert.equal(process.value.acknowledged, false);
        assert.equal(process.stdout.length, 0);
      }
    });
  }
  assert.equal(namespaces.size, cases.length);
});

test('a genuine good C015 read after STALE_EPOCH observes data without accepting false recovery', { timeout: 120000 }, async () => {
  const scratch = newScratch();
  let report;
  try {
    const child = spawnSync(process.execPath, [path.join(__dirname, 'fixture-worker.cjs'),
      'setup', scratch.namespace, 'synthetic-run-001', '1'],
    { timeout: 90000, maxBuffer: 65536, windowsHide: true });
    scratch.trackChild('synthetic-run-001');
    assert.ifError(child.error);
    assert.equal(child.status, 0);
    const setup = JSON.parse(child.stdout);
    const target = scratch.target('synthetic-run-001\\epoch-001.json');
    const before = fs.readFileSync(target);
    const context = { runId: 'synthetic-run-001', epoch: 1, pendingStep: setup.state.record.pendingStep };
    let failure;
    try {
      await persist(scratch.namespace, makeState('synthetic-run-001', 1));
      assert.fail('The actual stale retry must reject without an acknowledgment.');
    } catch (error) {
      assert.ok(error instanceof FixtureError);
      assert.equal(error.code, 'STALE_EPOCH');
      failure = projectError(error, context, setup.acknowledgment);
    }
    const console = new RecoveryConsole('actual-read-only');
    console.observe(failure);
    const retained = console.state;
    const read = await inspect(scratch.namespace, context, setup.acknowledgment);
    assert.equal(read.kind, 'C019-read-data');
    assert.equal(read.writesPerformed, 0);
    assert.deepEqual(read.acknowledgment, setup.acknowledgment);
    const result = console.dispatch('reinspect', console.state.revision, read);
    assert.equal(result.accepted, true, 'The bounded read step is allowed, not the failed write.');
    assert.equal(result.code, 'READ_DATA_NOT_RECOVERY');
    assert.equal(console.state.status, 'failed');
    assert.equal(console.state.failure.error.code, 'STALE_EPOCH');
    assert.equal(console.state.recoveryConfirmed, false);
    assert.equal(console.state.writesAuthorized, false);
    assert.deepEqual(console.state.failure, retained.failure);
    assert.deepEqual(console.state.history[0], retained.history[0]);
    assert.deepEqual(fs.readFileSync(target), before);
    report = {
      schemaVersion: 1, cardId: 'C019', namespace: scratch.namespace,
      setupPid: setup.pid, error: failure.error, context: failure.context,
      read, originalFailureStillPresent: true,
      acknowledgedBytesSha256: createHash('sha256').update(before).digest('hex'),
      acknowledgedBytesPreserved: true, recoveryConfirmed: false, cleaned: false,
    };
  } finally {
    await scratch.cleanup();
    assert.equal(fs.existsSync(scratch.location.root), false);
    if (report) {
      report.cleaned = true;
      process.stdout.write('C019_READ_AFTER_FAILURE_RECORD=' + JSON.stringify(report) + '\n');
    }
  }
});
