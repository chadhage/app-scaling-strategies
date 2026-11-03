'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const inspector = require('../inspector.js');
const { getProfileV1, getProfileV2 } = require('../profiles.cjs');

function response() { return JSON.parse(JSON.stringify(getProfileV2({ profileId: 'synthetic-001' }))); }

for (const id of ['synthetic-001', 'synthetic-002']) {
  test(`inspection verifies real v1/v2 values and unchanged old-consumer semantics for ${id}`, () => {
    const v1 = getProfileV1({ profileId: id });
    const v2 = getProfileV2({ profileId: id });
    const result = inspector.compare(v1, v2, id);
    assert.equal(result.verified, true);
    assert.equal(result.compatible, true);
    assert.equal(result.apiContract, 'getProfile/1');
    assert.deepEqual(inspector.oldConsumer(v1), inspector.oldConsumer(v2));
    assert.deepEqual(result.observations.map((observation) => observation.stamp.implementationVersion), ['1.0.0', '2.0.0']);
    assert.equal(Object.isFrozen(result.observations[0].stamp), true);
    assert.equal(Object.isFrozen(result.oldConsumer.preferences.topics), true);
  });
}

test('an unchanged old consumer does not interpret implementation versions as breaking contracts', () => {
  const candidate = response();
  const expected = inspector.oldConsumer(candidate);
  candidate.stamp.implementationVersion = 'a-future-implementation';
  candidate.stamp.deploymentStamp = 'not-a-real-observation';
  assert.deepEqual(inspector.oldConsumer(candidate), expected);
  assert.throws(() => inspector.inspect(candidate, 'v2', 'synthetic-001'), { code: 'STAMP_MISMATCH' });
});

for (const [name, mutate, code] of [
  ['missing stamp', (value) => { delete value.stamp; }, 'STAMP_MISMATCH'],
  ['forged implementation', (value) => { value.stamp.implementation = 'v1'; }, 'STAMP_MISMATCH'],
  ['forged implementation version', (value) => { value.stamp.implementationVersion = '999'; }, 'STAMP_MISMATCH'],
  ['forged deployment stamp', (value) => { value.stamp.deploymentStamp = 'production'; }, 'STAMP_MISMATCH'],
  ['missing version', (value) => { delete value.stamp.implementationVersion; }, 'STAMP_MISMATCH'],
  ['wrong catalog version', (value) => { value.stamp.profileCatalogVersion = 'unknown'; }, 'STAMP_MISMATCH'],
  ['cloud deployment claim', (value) => { value.stamp.deploymentKind = 'azure'; }, 'STAMP_MISMATCH'],
  ['real data claim', (value) => { value.stamp.dataKind = 'real'; }, 'STAMP_MISMATCH'],
  ['extra stamp field', (value) => { value.stamp.approved = true; }, 'STAMP_MISMATCH'],
  ['wrong API contract', (value) => { value.apiContract = 'getProfile/2'; }, 'CONTRACT_MISMATCH'],
  ['missing profile', (value) => { delete value.profile; }, 'PROFILE_MISMATCH'],
  ['wrong profile ID', (value) => { value.profile.id = 'synthetic-002'; }, 'PROFILE_MISMATCH'],
  ['changed name', (value) => { value.profile.displayName = 'Changed'; }, 'PROFILE_MISMATCH'],
  ['changed nested preferences', (value) => { value.profile.preferences.theme = 'changed'; }, 'PROFILE_MISMATCH'],
  ['changed collection', (value) => { value.profile.preferences.topics.reverse(); }, 'PROFILE_MISMATCH'],
  ['missing old-consumer field', (value) => { delete value.profile.email; }, 'PROFILE_MISMATCH'],
  ['unhealthy extra envelope field', (value) => { value.ok = false; }, 'INVALID_ENVELOPE']
]) {
  test(`inspection rejects ${name}`, () => {
    const candidate = response();
    mutate(candidate);
    assert.throws(() => inspector.inspect(candidate, 'v2', 'synthetic-001'), { code });
  });
}

test('inspection requires explicit known implementation and profile, without defaults', () => {
  for (const implementation of [undefined, null, '', 'v3', 'toString', '__proto__']) {
    assert.throws(() => inspector.inspect(response(), implementation, 'synthetic-001'), { code: 'UNKNOWN_IMPLEMENTATION' });
  }
  for (const id of [undefined, null, '', 'synthetic-999']) {
    assert.throws(() => inspector.inspect(response(), 'v2', id), { code: 'UNKNOWN_PROFILE' });
  }
  assert.throws(() => inspector.compare(getProfileV2({ profileId: 'synthetic-001' }), response(), 'synthetic-001'), { code: 'STAMP_MISMATCH' });
});

test('candidate parsing rejects invalid, empty, missing, oversized, and non-profile JSON', () => {
  for (const text of [undefined, null, '', '{', 'x'.repeat(16385)]) {
    assert.throws(() => inspector.parseCandidate(text, 'v2', 'synthetic-001'), { code: 'INVALID_JSON' });
  }
  for (const text of ['null', 'true', '[]', '{}', '{"healthy":true}']) {
    assert.throws(() => inspector.parseCandidate(text, 'v2', 'synthetic-001'));
  }
  assert.equal(inspector.parseCandidate(JSON.stringify(response()), 'v2', 'synthetic-001').verified, true);
});

test('inspection does not execute accessors or accept cycles, sparse arrays, symbols, or non-finite data', () => {
  let getterCalls = 0;
  const accessor = response();
  Object.defineProperty(accessor, 'stamp', { enumerable: true, get() { getterCalls++; return {}; } });
  const cyclic = response();
  cyclic.extra = cyclic;
  const sparse = response();
  sparse.profile.preferences.topics = new Array(2);
  const symbolic = response();
  symbolic[Symbol('extra')] = true;
  const infinity = response();
  infinity.extra = Infinity;
  const undefinedValue = response();
  undefinedValue.extra = undefined;
  for (const value of [accessor, cyclic, sparse, symbolic, infinity, undefinedValue]) {
    assert.throws(() => inspector.inspect(value, 'v2', 'synthetic-001'), { code: 'INVALID_DATA' });
  }
  assert.equal(getterCalls, 0);
});

test('the actual browser scripts expose frozen contracts and fail closed on missing dependency', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'contract.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'inspector.js'), 'utf8'), context);
  const browserResult = context.C020Inspector.compare(
    getProfileV1({ profileId: 'synthetic-002' }), getProfileV2({ profileId: 'synthetic-002' }), 'synthetic-002'
  );
  assert.equal(browserResult.compatible, true);
  assert.equal(Object.isFrozen(context.C020Contract.profiles[0].preferences.topics), true);
  assert.equal(Object.getOwnPropertyDescriptor(context, 'C020Inspector').writable, false);
  const missing = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'inspector.js'), 'utf8'), missing);
  assert.throws(() => missing.C020Inspector.inspect(response(), 'v2', 'synthetic-001'), { code: 'CONTRACT_UNAVAILABLE' });
});
