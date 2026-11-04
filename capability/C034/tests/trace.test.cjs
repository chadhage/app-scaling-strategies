'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const trace = require('..\\trace.js');
const historical = require('..\\historical.cjs');
const providers = require('..\\..\\C020\\profiles.cjs');
const clone = (id = 'closed-history') => structuredClone(trace.getSavedTrace(id));
const inspect = (value, id = 'closed-history') => trace.inspectCandidate(JSON.stringify(value), id);
const error = (value, code) => { const result = inspect(value); assert.equal(result.valid, false); assert.equal(result.code, code); };

test('exact actually saved DOM decodes to unchanged saved actions, outcomes, context and C020 replies', () => {
  const original = historical.readHistorical();
  for (const observation of original.observations) {
    const saved = trace.getSavedTrace(observation.id);
    assert.deepEqual(saved.snapshot, observation.snapshot);
    assert.equal(trace.inspectSaved(observation.id).valid, true);
    assert.equal(saved.source.savedDom.rawSha256, observation.pin.rawSha256);
    assert.equal(saved.source.authenticatedIdentityAttested, false);
  }
  const saved = clone();
  const first = saved.snapshot.history[0];
  assert.deepEqual(first.acknowledgements, [
    providers.getProfileV1({ profileId: first.original.profileId }),
    providers.getProfileV2({ profileId: first.original.profileId })
  ]);
  assert.equal(first.acknowledgements[0].apiContract, first.acknowledgements[1].apiContract);
  assert.notEqual(first.acknowledgements[0].stamp.implementationVersion, first.acknowledgements[1].stamp.implementationVersion);
  assert.equal(saved.context.receipt.state.runId, 'synthetic-run-001');
  assert.equal(saved.context.receipt.state.epoch, 3);
  assert.equal(saved.context.receipt.state.record.completedStep, 'finish');
  assert.equal(saved.context.receipt.writesPerformed, 0);
  assert.equal(saved.context.association, 'declared-fixture-association-only-not-client-run-correlation');
});

test('original outcomes remain ordered; an observed late segment never restarts its budget', () => {
  const result = trace.inspectSaved('closed-history');
  assert.deepEqual(result.attempts.map((entry) => entry.classification),
    ['observed-local-segment', 'observed-local-segment', 'original-budget-exceeded', 'failed', 'unknown', 'unknown']);
  const late = result.attempts[2];
  assert.ok(late.elapsedMs >= late.original.budgetMs);
  assert.equal(late.deadline, late.startedAt + late.original.budgetMs);
  assert.deepEqual(late.observedVersions.map((entry) => [entry.implementationVersion, entry.apiContract]),
    [['1.0.0', 'getProfile/1'], ['2.0.0', 'getProfile/1']]);
  assert.equal(result.fullJourneyQualified, false);
  assert.equal(result.migrationQualified, false);
});

test('saved partial snapshot never invents an end, second version, response or recovery of an unknown original', () => {
  const partial = trace.inspectSaved('held-snapshot');
  const current = partial.attempts.at(-1);
  assert.equal(current.attemptId, 'synthetic-C033-attempt-2');
  assert.equal(current.classification, 'partial-unknown');
  assert.equal(current.endedAt, null);
  assert.equal(current.requests, 1);
  assert.equal(current.responses, 1);
  assert.deepEqual(current.observedVersions.map((entry) => entry.implementationVersion), ['1.0.0']);
  const closed = trace.inspectSaved('closed-history');
  assert.equal(closed.attempts.find((entry) => entry.attemptId === closed.replacementSummary.originalInterruptedId).classification, 'unknown');
  assert.equal(closed.attempts.some((entry) => entry.attemptId === closed.replacementSummary.replacementId), false);
  assert.equal(closed.attempts.length, 6, 'A replacement summary with seven retained attempts is not a seventh saved full trace.');
});

test('genuine RED objective is GREEN: acknowledgment before the actual request is rejected', () => {
  const value = clone();
  const index = value.snapshot.events.findIndex((entry) => entry.code === 'ACTUAL_READ_STARTED');
  [value.snapshot.events[index], value.snapshot.events[index + 1]] = [value.snapshot.events[index + 1], value.snapshot.events[index]];
  error(value, 'REQUEST_RESPONSE_ORDER');
});

test('duplicate, missing and wrong-implementation request/response actions cannot pass ordering', () => {
  for (const code of ['ACTUAL_READ_STARTED', 'ACTUAL_READ_ACKNOWLEDGED']) {
    const value = clone();
    const index = value.snapshot.events.findIndex((entry) => entry.code === code);
    value.snapshot.events.splice(index + 1, 0, structuredClone(value.snapshot.events[index]));
    error(value, 'REQUEST_RESPONSE_ORDER');
  }
  const missing = clone();
  missing.snapshot.events.splice(missing.snapshot.events.findIndex((entry) => entry.code === 'ACTUAL_READ_ACKNOWLEDGED'), 1);
  error(missing, 'REQUEST_RESPONSE_ORDER');
  const wrong = clone();
  wrong.snapshot.events.find((entry) => entry.code === 'ACTUAL_READ_ACKNOWLEDGED').implementation = 'v2';
  error(wrong, 'REQUEST_RESPONSE_ORDER');
});

test('terminal, history and claimed outcomes cannot erase missing, failed or unknown originals', () => {
  const early = clone();
  const index = early.snapshot.events.findIndex((entry) => entry.code === 'ACTUAL_READ_STARTED');
  early.snapshot.events[index] = { ...early.snapshot.events[index], code: 'TWO_READ_LOCAL_SEGMENT_OBSERVED', outcome: 'observed', replyCode: null };
  delete early.snapshot.events[index].implementation;
  delete early.snapshot.events[index].ordinal;
  error(early, 'TERMINAL_BEFORE_RESPONSES');
  const reordered = clone();
  reordered.snapshot.history.reverse();
  error(reordered, 'ORIGINAL_OUTCOME_ORDER');
  const repaired = clone();
  repaired.snapshot.history[5].outcome = 'observed';
  error(repaired, 'ORIGINAL_OUTCOME_ORDER');
  const duplicate = clone();
  duplicate.snapshot.history.push(structuredClone(duplicate.snapshot.history[5]));
  error(duplicate, 'DUPLICATE_ORIGINAL_ATTEMPT');
  const claimed = clone();
  claimed.valid = true;
  claimed.liveRunApproved = true;
  error(claimed, 'CLOSED_TRACE_SCHEMA');
});

test('monotonic times, original elapsed and original deadline must match exact observed actions', () => {
  const reverseTime = clone();
  reverseTime.snapshot.events[3].at = reverseTime.snapshot.events[2].at - 1;
  error(reverseTime, 'NON_MONOTONIC_TIME');
  const elapsed = clone();
  elapsed.snapshot.events[3].elapsedMs += 1;
  error(elapsed, 'ORIGINAL_ELAPSED_MISMATCH');
  const restarted = clone();
  restarted.snapshot.history[2].deadline += 1000;
  error(restarted, 'ORIGINAL_BUDGET_OR_TIMING_MISMATCH');
  const stale = clone();
  stale.snapshot.sampledAt = 0;
  error(stale, 'STALE_SNAPSHOT_TIME');
  const missingTime = clone();
  delete missingTime.snapshot.events[3].at;
  error(missingTime, 'CLOSED_ACTION');
});

test('exact C020 business values and stamps are required, not invented version or deployment labels', () => {
  for (const mutate of [
    (reply) => { reply.stamp.implementationVersion = 'preview'; },
    (reply) => { reply.stamp.deploymentStamp = 'Azure-production'; },
    (reply) => { reply.profile.displayName = 'Unobserved label'; },
    (reply) => { reply.apiContract = 'getProfile/2'; },
    (reply) => { reply.headers = { 'x-c020-implementation-version': '1.0.0' }; },
    (reply) => { delete reply.stamp; }
  ]) {
    const value = clone();
    mutate(value.snapshot.history[0].acknowledgements[0]);
    error(value, 'IMMUTABLE_C020_REPLY_MISMATCH');
  }
});

test('stale context, arbitrary source path/URL/header, rewritten identity and schema claims fail closed', () => {
  const context = clone();
  context.context.receipt.state.epoch = 2;
  error(context, 'CONTEXT_MISMATCH_OR_STALE');
  for (const field of ['path', 'url', 'headers', 'provenance', 'verified']) {
    const value = clone();
    value.source[field] = field === 'url' ? 'https://example.invalid/' : 'caller-owned';
    error(value, 'SOURCE_PROVENANCE_MISMATCH');
  }
  const identity = clone();
  identity.snapshot.history[0].attemptId = 'synthetic-C033-attempt-7';
  error(identity, 'ORIGINAL_CONTEXT_REQUIRED');
  const version = clone();
  version.traceFormat = 'C034-saved-client-trace/2';
  error(version, 'TRACE_VERSION');
  const missing = clone();
  delete missing.snapshot.history[0].endedAt;
  error(missing, 'CLOSED_ORIGINAL_RECORD');
});

test('inspection is immutable, repeatable and never adopts imported history as live authority', () => {
  const original = trace.canonical(trace.getSavedTrace('closed-history'));
  for (let index = 0; index < 3; index++) {
    const result = inspect(clone());
    assert.equal(result.valid, true);
    for (const field of ['liveRunAdopted', 'approvalAdopted', 'identityVerified', 'actualRunCorrelation',
      'migrationQualified', 'nativeTransportQualified', 'productionRuntimeValidated', 'fullJourneyQualified']) {
      assert.equal(result[field], false);
    }
  }
  assert.equal(trace.canonical(trace.getSavedTrace('closed-history')), original);
  assert.equal(Object.isFrozen(trace.getSavedTrace('closed-history').snapshot.history[0]), true);
  assert.equal(trace.inspectSaved('../C015').code, 'UNKNOWN_TRACE_ID');
  assert.equal(trace.inspectCandidate(JSON.stringify(clone()), 'held-snapshot').code, 'TRACE_ID_MISMATCH');
});
