'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { restore } = require('..\\..\\C015\\store.cjs');
const { FixtureError } = require('..\\..\\C015\\contract.cjs');
const { RecoveryConsole } = require('..\\recovery.js');

test('a REAL C015 missing-state failure cannot be accepted as a recovery or discarded', async () => {
  let failure;
  try {
    await restore(`test-${randomUUID()}`, 'synthetic-run-001');
    assert.fail('The missing unique fixture must never restore successfully.');
  } catch (error) {
    assert.ok(error instanceof FixtureError);
    assert.equal(error.code, 'STATE_MISSING');
    failure = {
      schemaVersion: 1, kind: 'C019-typed-failure',
      error: { source: 'C015', name: 'C015FixtureError', code: error.code },
      context: { runId: 'synthetic-run-001', epoch: null, pendingStep: null },
      priorAcknowledgment: null, provenance: 'actual-C015-API',
    };
  }
  const console = new RecoveryConsole();
  const observed = console.observe(failure);
  assert.equal(observed.state.status, 'failed',
    'A genuine observed failure must remain failed; no uninspected or success-shaped fallback.');
  assert.equal(observed.state.failure.error.code, 'STATE_MISSING');
  const before = observed.state.history.length;
  const rejected = console.dispatch('accept-success', observed.state.revision, { restored: true });
  assert.equal(rejected.accepted, false, 'Fabricated recovery must be rejected, never accepted.');
  assert.equal(rejected.state.failure.error.code, 'STATE_MISSING');
  assert.equal(rejected.state.recoveryConfirmed, false);
  assert.ok(rejected.state.history.length > before, 'Rejected actions must preserve and append history.');
});
