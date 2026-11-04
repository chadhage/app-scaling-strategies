'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { newScratch, duplicates, fresh, bytes, runId } = require('./process-harness.cjs');
const { makeState } = require('..\\..\\C015\\contract.cjs');

test('concurrent fresh duplicate processes produce one intended immutable publication, not painted counters', { timeout: 300000 }, async (t) => {
  const scratch = newScratch();
  let processes = [];
  let retainedFileSha256;
  try {
    processes = await duplicates(scratch);
    assert.equal(new Set(processes.map((item) => item.value.pid)).size, 2);
    for (const observed of processes) assert.equal(observed.exitCode, 0, observed.stderr);
    const winners = processes.filter((item) => item.value.disposition === 'published');
    assert.equal(winners.length, 1, 'Exactly one actual C015 publication receipt must exist.');
    for (const observed of processes.filter((item) => item !== winners[0])) {
      const result = observed.value;
      assert.equal(result.publicationPerformed === true, false);
      if (result.outcome === 'positive') {
        assert.equal(result.code, 'MATCHING_LOCAL_ACK');
        assert.equal(result.observation.source, 'C015.restore');
        assert.deepEqual(result.acknowledgment, winners[0].value.acknowledgment);
      } else {
        assert.ok(['negative', 'unknown'].includes(result.outcome));
        assert.equal(result.acknowledgment, null);
      }
    }
    retainedFileSha256 = bytes(scratch);
    assert.equal(Object.keys(retainedFileSha256).length, 1);
    const file = scratch.target(path.join(runId, 'epoch-001.json'));
    const actual = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(actual.state, makeState(runId, 1));
    assert.deepEqual(actual.acknowledgment, winners[0].value.acknowledgment);
    assert.equal(actual.state.record.acknowledgedUnits, 1);
    const confirmation = fresh(scratch, 'apply', 0);
    processes.push(confirmation);
    const marker = scratch.target('writer.lock');
    if (fs.existsSync(marker)) {
      assert.equal(confirmation.value.outcome, 'unknown');
      assert.equal(confirmation.value.code, 'HOLD_UNOBSERVED');
      assert.equal(confirmation.value.acknowledgment, null);
    } else {
      assert.equal(confirmation.value.code, 'MATCHING_LOCAL_ACK');
      assert.deepEqual(confirmation.value.acknowledgment, actual.acknowledgment);
    }
    assert.deepEqual(bytes(scratch), retainedFileSha256);
  } finally {
    await scratch.cleanup();
    t.diagnostic(JSON.stringify({ namespace: scratch.namespace, processes, retainedFileSha256,
      actualIntendedEffect: 'one immutable epoch-001, acknowledgedUnits=1',
      markerReclaimedByCommand: false, exactOwnedScratchCleaned: true }));
  }
});
