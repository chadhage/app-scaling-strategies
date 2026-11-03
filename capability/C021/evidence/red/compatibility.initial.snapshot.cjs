'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..', '..');
const subject = require(process.env.C021_RED_SUBJECT
  ? path.resolve(__dirname, process.env.C021_RED_SUBJECT) : path.join(root, 'compatibility.js'));
const contract = require(path.join(root, '..', 'C020', 'contract.js'));
const inspector = require(path.join(root, '..', 'C020', 'inspector.js'));
const providers = require(path.join(root, '..', 'C020', 'profiles.cjs'));

function candidate(profile, implementation = 'v1') {
  return {
    apiContract: 'getProfile/2',
    person: {
      key: profile.id, name: profile.displayName,
      contact: { emailAddress: profile.email },
      settings: {
        language: profile.preferences.locale, colorScheme: profile.preferences.theme,
        interests: [...profile.preferences.topics]
      }
    },
    provenance: {
      fixtureRevision: 'C021-breaking-r1', mode: 'synthetic-local-contract-rehearsal',
      dataKind: 'synthetic', sourceApiContract: 'getProfile/1',
      sourceStamp: { ...contract.stamps[implementation] }
    }
  };
}

test('accepted C020 remains compatible through its actual unchanged old consumer', () => {
  assert.equal(subject.oldConsumer, inspector.oldConsumer);
  for (const profile of contract.profiles) {
    for (const provider of [providers.getProfileV1, providers.getProfileV2]) {
      const baseline = provider({ profileId: profile.id });
      assert.equal(baseline.apiContract, 'getProfile/1');
      assert.deepEqual(subject.oldConsumer(baseline), profile);
    }
  }
});

test('new synthetic contract is deliberately incompatible while retaining every semantic field', () => {
  for (const profile of contract.profiles) {
    for (const [implementation, provider] of [['v1', providers.getProfileV1], ['v2', providers.getProfileV2]]) {
      const raw = subject.makeBreaking(provider({ profileId: profile.id }), implementation, profile.id);
      assert.ok(raw, 'a real incompatible response must be produced');
      assert.deepEqual(raw, candidate(profile, implementation));
      assert.throws(() => inspector.oldConsumer(raw), { code: 'CONTRACT_MISMATCH' });
    }
  }
});

test('explicit adapter restores old semantics without pretending to be an unadapted C020 observation', () => {
  for (const profile of contract.profiles) {
    const adapted = subject.adaptToOld(candidate(profile), 'v1', profile.id);
    assert.ok(adapted, 'the explicit adapter must produce an output');
    assert.equal(adapted.apiContract, 'getProfile/1');
    assert.deepEqual(inspector.oldConsumer(adapted), profile);
    assert.equal(adapted.provenance.adapterId, 'C021/getProfile-2-to-1/r1');
    assert.equal(adapted.provenance.inputContract, 'getProfile/2');
    assert.deepEqual(adapted.provenance.sourceStamp, contract.stamps.v1);
    assert.throws(() => inspector.inspect(adapted, 'v1', profile.id), { code: 'STAMP_MISMATCH' });
  }
});

test('new consumer handles only the explicit new contract and preserves ordered and empty topics', () => {
  for (const profile of contract.profiles) {
    const consumed = subject.newConsumer(candidate(profile), 'v1', profile.id);
    assert.ok(consumed, 'the new consumer must read actual new-contract fields');
    assert.deepEqual(consumed, profile);
    const old = providers.getProfileV1({ profileId: profile.id });
    assert.throws(() => subject.newConsumer(old, 'v1', profile.id), { code: 'CONTRACT_MISMATCH' });
  }
});

test('unknown contract versions are rejected instead of guessed or passed through', () => {
  for (const apiContract of ['getProfile/1', 'getProfile/3', '', undefined]) {
    const raw = candidate(contract.profiles[0]);
    raw.apiContract = apiContract;
    assert.throws(() => subject.adaptToOld(raw, 'v1', 'synthetic-001'));
  }
});

test('rehearsal derives readable safe and breaking outcomes from actual consumers', () => {
  const baseline = providers.getProfileV2({ profileId: 'synthetic-001' });
  const result = subject.rehearse(baseline, 'v2', 'synthetic-001');
  assert.ok(result, 'a transition matrix must be evaluated');
  assert.deepEqual(result.outcomes.map(({ transition, outcome }) => [transition, outcome]), [
    ['baseline -> old', 'SAFE'],
    ['raw -> old', 'BREAKING'],
    ['raw -> new', 'SAFE'],
    ['adapted -> old', 'SAFE'],
    ['baseline -> new', 'BREAKING'],
    ['adapted -> new', 'BREAKING']
  ]);
  assert.deepEqual(result.oldSemantics, contract.profiles[0]);
  assert.deepEqual(result.newSemantics, result.oldSemantics);
  assert.deepEqual(result.adaptedSemantics, result.oldSemantics);
});
