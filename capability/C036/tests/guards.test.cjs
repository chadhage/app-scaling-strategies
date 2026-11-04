'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { capturedGate } = require('./support.cjs');
const attribution = require('..\\attribution.js');
async function changed(change) {
  const gate = await capturedGate();
  const candidate = gate.getEvidence('fictional-complete');
  change(candidate);
  const result = await gate.attachText(JSON.stringify(candidate));
  assert.equal(gate.snapshot().attachedRecords, 0);
  assert.equal(gate.snapshot().metrics.currentAttributedTierRecords, 0);
  return result;
}
for (const field of ['runId', 'userId', 'leaseId', 'contextId', 'fixtureNamespace', 'fixtureScope',
  'epoch', 'epochVersion', 'stateSha256', 'attemptId', 'requestId', 'evidenceId', 'tier',
  'observedTick', 'ordinal', 'complete', 'actions', 'stamp']) {
  test(`missing own ${field} stays HOLD, never completed from another field`, async () => {
    const result = await changed((c) => { delete c.observations[0][field]; });
    assert.equal(result.outcome, 'held');
    assert.equal(result.code, 'INCOMPLETE_REQUIRED_OBSERVATION');
    assert.equal(result.fixtureScopeVerified, false);
  });
}
for (const field of ['runId', 'userId', 'leaseId', 'contextId', 'epoch', 'epochVersion',
  'stateSha256', 'requestId', 'complete']) {
  test(`null ${field} stays explicitly unobserved`, async () => {
    assert.equal((await changed((c) => { c.observations[0][field] = null; })).outcome, 'held');
  });
}
for (const [field, value] of [
  ['runId', 1], ['userId', false], ['leaseId', {}], ['contextId', []], ['epoch', '3'],
  ['epochVersion', '1'], ['observedTick', 102.5], ['ordinal', true], ['complete', 'true']
]) {
  test(`wrong typed ${field} rejects before attribution`, async () => {
    assert.equal((await changed((c) => { c.observations[0][field] = value; })).code, 'EVIDENCE_FIELD_TYPE');
  });
}
for (const [field, value, code] of [
  ['fixtureNamespace', 'test-other', 'FIXTURE_NAMESPACE_MISMATCH'],
  ['contextId', 'fictional-C036-context-002', 'CONTEXT_MISMATCH'],
  ['requestId', 'fictional-C036-request-002', 'REQUEST_CONTEXT_MISMATCH'],
  ['stateSha256', '0'.repeat(64), 'STATE_STAMP_MISMATCH'],
  ['epochVersion', 2, 'EPOCH_VERSION_MISMATCH'],
  ['observedTick', 108, 'FUTURE_OBSERVATION'],
  ['evidenceId', 'fictional-C036-evidence-999', 'EVIDENCE_ID_MISMATCH']
]) {
  test(`known wrong ${field} rejects`, async () => {
    assert.equal((await changed((c) => { c.observations[0][field] = value; })).code, code);
  });
}
for (const field of ['eligibleVerdict', 'expectedContext', 'provenance', 'authenticatedIdentity', 'leaseOwner']) {
  test(`caller ${field} cannot become current-context eligibility`, async () => {
    assert.equal((await changed((c) => { c[field] = { eligible: true }; })).code, 'CLOSED_EVIDENCE_SCHEMA');
  });
}
test('source claims of identity, native correlation or lease authority are not trusted', async () => {
  for (const field of ['authenticatedIdentityVerified', 'nativeCorrelationVerified', 'leaseAuthority']) {
    assert.equal((await changed((c) => { c.source[field] = true; })).code, 'CALLER_PROVENANCE_NOT_TRUSTED');
  }
});
test('profile, label, health or HTTP 200 cannot fill missing correlation fields', async () => {
  const result = await changed((c) => {
    delete c.observations[0].userId;
    c.observations[0].health = 'healthy';
    c.observations[0].profile = { displayName: 'fictional label', id: 'fictional-C036-user-001' };
  });
  assert.equal(result.outcome, 'rejected');
  assert.equal(result.code, 'UNEXPECTED_OBSERVATION_FIELD');
  assert.equal((await changed((c) => { delete c.observations[0].runId; })).outcome, 'held');
});
test('top-level missing original/scope/context provenance holds without guessing', async () => {
  for (const field of ['fixtureScope', 'originalAttempt', 'source', 'observations']) {
    assert.equal((await changed((c) => { delete c[field]; })).outcome, 'held');
  }
});
test('partial nested request context and stamp stays HOLD', async () => {
  assert.equal((await changed((c) => { delete c.observations[0].actions[0].requestId; })).outcome, 'held');
  assert.equal((await changed((c) => { delete c.observations[1].stamp.deploymentStamp; })).outcome, 'held');
  assert.equal((await changed((c) => { c.observations[2].complete = false; })).outcome, 'held');
});
for (const [name, change, code] of [
  ['tier order', (c) => c.observations.reverse(), 'EVIDENCE_ID_MISMATCH'],
  ['response before request', (c) => c.observations[0].actions.reverse(), 'CLOSED_ACTION_SCHEMA'],
  ['request from other context', (c) => { c.observations[1].actions[0].requestId = 'fictional-other'; }, 'REQUEST_RESPONSE_ORDER_OR_CONTEXT'],
  ['stamp wrong type', (c) => { c.observations[0].stamp.implementationVersion = 1; }, 'STAMP_FIELD_TYPE'],
  ['extra tier stamp claim', (c) => { c.observations[0].stamp.identityVerified = true; }, 'CLOSED_TIER_STAMP'],
  ['extra response', (c) => c.observations[2].actions.push(c.observations[2].actions[1]), 'CLOSED_ACTION_OBSERVATION'],
  ['more than three tiers', (c) => c.observations.push(c.observations[0]), 'BOUNDED_TIER_OBSERVATIONS_REQUIRED'],
  ['duplicate other attempt record', (c) => { c.observations[1] = structuredClone(c.observations[0]); }, 'EVIDENCE_ID_MISMATCH']
]) {
  test(`${name} rejects without partial metrics`, async () => assert.equal((await changed(change)).code, code));
}
test('historical source byte/stamp changes cannot forge a current eligible observation', async () => {
  const gate = await capturedGate();
  const candidate = gate.getEvidence('saved-closed-unlinked');
  candidate.savedTrace.source.savedDom.rawSha256 = '0'.repeat(64);
  assert.equal((await gate.attachText(JSON.stringify(candidate))).code, 'SOURCE_PROVENANCE_MISMATCH');
  assert.equal(gate.snapshot().metrics.currentAttributedTierRecords, 0);
});
test('missing historical actions never become complete native observations', async () => {
  const gate = await capturedGate();
  const candidate = gate.getEvidence('saved-held-unlinked');
  candidate.savedTrace.snapshot.fullJourneyQualified = true;
  assert.equal((await gate.attachText(JSON.stringify(candidate))).code, 'QUALIFICATION_CLAIM_FORBIDDEN');
  assert.equal(gate.snapshot().attachedRecords, 0);
});
for (const [name, input, code] of [
  ['empty JSON', '', 'REQUIRED_JSON'], ['malformed JSON', '{', 'INVALID_JSON'],
  ['duplicate JSON keys', '{"schemaVersion":1,"schemaVersion":1}', 'DUPLICATE_FIELD'],
  ['escaped duplicate keys', '{"runId":1,"run\\u0049d":2}', 'DUPLICATE_FIELD'],
  ['unsafe integer', '{"schemaVersion":9007199254740993}', 'UNSAFE_NUMBER_LITERAL'],
  ['rounded decimal', '{"schemaVersion":1.0000000000000001}', 'UNSAFE_NUMBER_LITERAL'],
  ['negative zero', '{"epoch":-0}', 'UNSAFE_NUMBER_LITERAL']
]) {
  test(`${name} rejects before the actual private transition`, async () => {
    const gate = await capturedGate();
    assert.equal((await gate.attachText(input)).code, code);
    assert.equal(gate.snapshot().metrics.currentAttributedTierRecords, 0);
  });
}
test('byte bounds, strict UTF-8 and byte-input type are enforced', async () => {
  const gate = await capturedGate();
  assert.equal((await gate.attachBytes(Buffer.from([0xc3, 0x28]))).code, 'INVALID_UTF8');
  assert.equal((await gate.attachBytes(Buffer.alloc(attribution.MAX_BYTES + 1))).code, 'EVIDENCE_OVERSIZE');
  assert.equal((await gate.attachText(' '.repeat(attribution.MAX_BYTES + 1))).code, 'EVIDENCE_OVERSIZE');
  assert.equal((await gate.attachBytes('not bytes')).code, 'EVIDENCE_BYTES_REQUIRED');
  assert.equal(gate.snapshot().attachedRecords, 0);
});
test('valid actual UTF-8 bytes pass the same guarded fictional transition', async () => {
  const gate = await capturedGate();
  const bytes = Buffer.from(JSON.stringify(gate.getEvidence('fictional-complete')), 'utf8');
  assert.equal((await gate.attachBytes(bytes)).outcome, 'attached');
  assert.equal(gate.snapshot().metrics.currentAttributedTierRecords, 3);
});
test('inherited/accessor/hidden/symbol objects cannot enter via the JSON-only public surface', async () => {
  const gate = await capturedGate();
  let getterCalls = 0;
  const getter = Object.defineProperty({}, 'runId', { enumerable: true, get() { getterCalls++; return 'synthetic-run-001'; } });
  const hidden = Object.defineProperty({}, 'epoch', { value: 3 });
  for (const input of [Object.create({ eligible: true }), getter, hidden, { [Symbol('verdict')]: true }, []]) {
    assert.equal((await gate.attachText(input)).code, 'JSON_TEXT_REQUIRED');
  }
  assert.equal(getterCalls, 0);
  assert.equal(gate.snapshot().attachedRecords, 0);
});
test('unknown evidence and caller expected-context/eligible arguments never authorize attachment', async () => {
  const gate = await capturedGate();
  assert.throws(() => gate.getEvidence('arbitrary-profile'), { code: 'UNKNOWN_EVIDENCE_ID' });
  await assert.rejects(attribution.open({ epoch: 3, eligible: true }), { code: 'NO_CALLER_EXPECTED_CONTEXT' });
  assert.equal((await gate.attachText(JSON.stringify(gate.getEvidence('fictional-complete')), { eligible: true })).code, 'NO_CALLER_CONTEXT_OR_VERDICT');
  assert.equal(gate.snapshot().attachedRecords, 0);
});
