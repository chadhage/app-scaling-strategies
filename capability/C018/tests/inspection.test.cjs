'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createInspector, checkObservation, maximumJournalEntries } = require('..\\inspection.js');
const { readFresh } = require('..\\process-reader.cjs');
const { FixtureError } = require('..\\..\\C015\\contract.cjs');
const { newFixture } = require('./fixture.cjs');

test('a real-read inspector clears wrong-ID and disconnected success, and rereads without erasing earlier failures', async (t) => {
  const fixture = newFixture();
  try {
    assert.equal(fixture.write('synthetic-run-001', 1).exitCode, 0);
    assert.equal(fixture.write('synthetic-run-001', 2).exitCode, 0);
    const inspector = createInspector((runId) => readFresh(fixture.namespace, runId));
    const first = await inspector.lookup('synthetic-run-001');
    assert.equal(first.current.state.record.pendingStep, 'finish');
    const reconnect = await inspector.reconnect();
    assert.deepEqual(reconnect.current.state, first.current.state);
    assert.notEqual(reconnect.current.pid, first.current.pid);
    const unknown = await inspector.lookup('synthetic-run-003');
    assert.equal(unknown.status, 'UNKNOWN');
    assert.equal(unknown.current, null);
    assert.equal(unknown.journal.at(-1).code, 'UNKNOWN_RUN_ID');
    assert.equal((await inspector.reconnect()).current, null);
    await inspector.lookup('synthetic-run-001');
    assert.equal(inspector.disconnect().current, null);
    const afterDisconnect = await inspector.reconnect();
    assert.equal(afterDisconnect.status, 'OBSERVED');
    assert.equal(afterDisconnect.current.state.epoch, 2);
    assert.equal(afterDisconnect.journal.some((entry) => entry.code === 'CONNECTION_UNKNOWN'), true);
    assert.equal(afterDisconnect.journal.some((entry) => entry.code === 'UNKNOWN_RUN_ID'), true);
    const reset = inspector.resetDisplay();
    assert.equal(reset.current, null);
    assert.equal(reset.selectedRunId, null);
    assert.equal(reset.journal.some((entry) => entry.code === 'UNKNOWN_RUN_ID'), true);
    assert.equal(reset.journal.some((entry) => entry.code === 'CONNECTION_UNKNOWN'), true);
    t.diagnostic(JSON.stringify({ observation: 'Node-unit-and-real-fresh-reader-inspector-not-browser-proof', firstPid: first.current.pid,
      reconnectPid: reconnect.current.pid, finalJournal: reset.journal }));
  } finally {
    await fixture.cleanup();
  }
});

test('explicit C015 error plumbing preserves every failed or held inspection through later success and reset; no disk corruption is injected', async (t) => {
  const fixture = newFixture();
  try {
    assert.equal(fixture.write('synthetic-run-001', 1).exitCode, 0);
    const actual = await readFresh(fixture.namespace, 'synthetic-run-001');
    const codes = ['STATE_MISSING', 'CORRUPT_JSON', 'STATE_DIGEST', 'ACKNOWLEDGMENT_MISMATCH',
      'HISTORY_GAP', 'HOLD_UNOBSERVED', 'CURRENT_CONSENT_UNAVAILABLE', 'STORAGE_ERROR'];
    let pendingError;
    const inspector = createInspector(async () => {
      if (pendingError) throw new FixtureError(pendingError, `Explicit unit error: ${pendingError}`, [{ code: pendingError }]);
      return actual;
    });
    for (const code of codes) {
      pendingError = code;
      const failed = await inspector.lookup('synthetic-run-001');
      assert.equal(failed.current, null);
      assert.equal(failed.journal.at(-1).code, code);
      assert.equal(failed.status, code === 'HOLD_UNOBSERVED' ? 'HOLD' : 'UNKNOWN');
    }
    pendingError = null;
    assert.equal((await inspector.reconnect()).status, 'OBSERVED');
    const cleared = inspector.resetDisplay();
    assert.deepEqual(cleared.journal.slice(0, codes.length).map((entry) => entry.code), codes);
    for (const mutate of [
      (value) => { value.state.epoch = 4; },
      (value) => { value.state.runId = 'synthetic-run-002'; },
      (value) => { value.state.schemaVersion = 2; },
      (value) => { value.state.record.pendingStep = 'none'; },
      (value) => { value.state.record.status = 'completed'; },
      (value) => { value.history.reverse(); value.history.push(value.history[0]); },
      (value) => { value.acknowledgment.epoch = 3; },
      (value) => { value.writesPerformed = 1; },
      (value) => { delete value.state.record; },
      (value) => { value.restored = 'true'; },
    ]) {
      const changed = structuredClone(actual);
      mutate(changed);
      assert.throws(() => checkObservation(changed, 'synthetic-run-001'), { code: 'INVALID_OBSERVATION' });
    }
    t.diagnostic(JSON.stringify({ observation: 'labelled-unit-only-error-plumbing', codes, retained: cleared.journal }));
  } finally {
    await fixture.cleanup();
  }
});

test('a pending older read cannot restore stale success after selection change or reset', async () => {
  let resolveRead;
  const inspector = createInspector(() => new Promise((resolve) => { resolveRead = resolve; }));
  const pending = inspector.lookup('synthetic-run-001');
  inspector.edit('synthetic-run-002');
  inspector.resetDisplay();
  resolveRead(null);
  const view = await pending;
  assert.equal(view.current, null);
  assert.equal(view.status, 'UNKNOWN');
  assert.equal(view.journal.some((entry) => entry.code === 'READ_SUPERSEDED'), true);
});

test('a full bounded journal holds without evicting any earlier unknown or accepting later success', async () => {
  const inspector = createInspector(async () => { throw new Error('No observation supplied.'); });
  for (let index = 0; index < maximumJournalEntries + 3; index++) await inspector.lookup(`unknown-${index}`);
  const view = inspector.snapshot();
  assert.equal(view.current, null);
  assert.equal(view.blocked, true);
  assert.equal(view.journal.length, maximumJournalEntries);
  assert.equal(view.journal[0].runId, 'unknown-0');
  assert.equal(view.journal.at(-1).code, 'INSPECTION_LIMIT');
});
