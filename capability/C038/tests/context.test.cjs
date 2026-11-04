'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { captured, fixtureSubject } = require('./support.cjs');
const sources = require('../sources.cjs');
test('actual current accepted C036 DF7 and C015 public restore are read-only and separate from fictional inventory', async () => {
  const verified = sources.checkImports();
  assert.equal(verified.directAcceptedSources, 10);
  const gates = sources.readGates();
  assert.equal(sources.assertGates(gates), true);
  assert.equal(gates.prerequisites.find((item) => item.id === 'C036').publication.commit,
    'df7a4e1f4f07d834f17edd8f816bb2b5d166ae6e');
  const session = await require('../readiness.js').open();
  const context = session.snapshot();
  assert.equal(context.ownerContextOrigin, 'actual-C015-public-restore-read-only');
  assert.equal(context.currentC015Association.fixtureNamespace, 'synthetic-restart-v1');
  assert.equal(context.currentC015Association.runId, 'synthetic-run-001');
  assert.equal(context.currentC015Association.epoch, 3);
  assert.equal(context.currentC015Association.epochVersion, 1);
  assert.match(context.currentC015Association.stateSha256, /^[0-9a-f]{64}$/);
  assert.equal(context.c036ScopeIsFictionalNotInstanceInventory, true);
  const result = await session.inspectText(JSON.stringify(session.getEvidence('single-probe')));
  assert.equal(result.syntheticPoolReady, false);
  assert.equal(session.snapshot().history.length, 1);
});
test('literal consent and six exact independent acceptance gates fail closed on mutation', () => {
  const baseline = sources.readGates();
  for (const change of [
    (value) => { value.C001LocalConsent = 'true'; },
    (value) => { value.C015FixtureApproval = false; },
    (value) => { value.card.kano = 'D'; },
    (value) => { value.card.technicalEntryGate = 'C034'; },
    (value) => { value.ownedPaths.push('capability\\C036'); },
    (value) => { value.prerequisites[0].accepted = 'true'; },
    (value) => { value.prerequisites[0].publication.commit = '0'.repeat(40); },
    (value) => { value.prerequisites[1] = value.prerequisites[0]; }
  ]) {
    const copy = structuredClone(baseline);
    change(copy);
    assert.throws(() => sources.assertGates(copy));
  }
  assert.throws(() => sources.checkImports({ expected: true }), /NO_SOURCE_OVERRIDES/);
  assert.throws(() => sources.readGates('other-ledger'), /NO_AUTHORITY_OVERRIDES/);
});
test('simulated unavailable owner cannot fall back to a previously ready result', async () => {
  let unavailable = false;
  const subject = fixtureSubject(async () => {
    if (unavailable) throw new Error('test-only unavailable public reader');
    return structuredClone(captured.context);
  });
  const session = await subject.open();
  assert.equal((await session.inspectText(JSON.stringify(session.getEvidence('complete')))).syntheticPoolReady, true);
  unavailable = true;
  const result = await session.inspectText(JSON.stringify(session.getEvidence('later-fresh')));
  assert.equal(result.syntheticPoolReady, false);
  assert.equal(result.action, 'HOLD');
  assert.equal(session.snapshot().history[0].syntheticPoolReady, true);
  assert.equal(session.snapshot().lastResult.syntheticPoolReady, false);
});
test('simulated changed owner epoch is checked by unchanged C036, not adopted from candidate', async () => {
  let changed = false;
  const subject = fixtureSubject(async () => {
    const value = structuredClone(captured.context);
    if (changed) value.receipt.state.epoch = 2;
    return value;
  });
  const session = await subject.open();
  const candidate = session.getEvidence('complete');
  changed = true;
  const result = await session.inspectText(JSON.stringify(candidate));
  assert.equal(result.syntheticPoolReady, false);
  assert.equal(result.action, 'HOLD');
  assert.equal(result.code, 'OWNER_CONTEXT_UNAVAILABLE');
});
test('internal source-read denial and public expected-context overrides cannot authorize work', async () => {
  let deny = false;
  const subject = fixtureSubject(undefined, async () => {
    if (deny) throw Object.assign(new Error('source denied'), { code: 'TEST_ONLY_SOURCE_DENIED' });
  });
  await assert.rejects(() => subject.open({ context: captured.context }), /NO_CALLER_EXPECTED_CONTEXT/);
  const session = await subject.open();
  deny = true;
  const result = await session.inspectText(JSON.stringify(session.getEvidence('complete')));
  assert.equal(result.code, 'TEST_ONLY_SOURCE_DENIED');
  assert.equal(result.syntheticPoolReady, false);
});
