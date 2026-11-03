'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const api = require('../compatibility.js');
const { getProfileV1 } = require('../../C020/profiles.cjs');

const baseline = () => getProfileV1({ profileId: 'synthetic-001' });
const raw = () => JSON.parse(JSON.stringify(api.makeBreaking(baseline(), 'v1', 'synthetic-001')));
const readers = [api.newConsumer, api.adaptToOld];

for (const implementation of [undefined, null, '', 'v3', '2.0.0', 'getProfile/2', 'toString', '__proto__']) {
  test(`all operations reject explicit unknown implementation ${JSON.stringify(implementation)}`, () => {
    const candidate = raw();
    for (const operation of [
      () => api.makeBreaking(baseline(), implementation, 'synthetic-001'),
      () => api.rehearse(baseline(), implementation, 'synthetic-001'),
      () => api.parseCandidate(JSON.stringify(candidate), implementation, 'synthetic-001'),
      ...readers.map((reader) => () => reader(candidate, implementation, 'synthetic-001'))
    ]) assert.throws(operation, { code: 'UNKNOWN_IMPLEMENTATION' });
  });
}

for (const [id, code] of [
  [undefined, 'INVALID_PROFILE_ID'], [null, 'INVALID_PROFILE_ID'], ['', 'INVALID_PROFILE_ID'],
  [1, 'INVALID_PROFILE_ID'], [' synthetic-001', 'INVALID_PROFILE_ID'],
  ['synthetic-001\n', 'INVALID_PROFILE_ID'], ['synthetic-999', 'UNKNOWN_PROFILE']
]) {
  test(`all operations reject missing, malformed, or unknown profile ${JSON.stringify(id)}`, () => {
    const candidate = raw();
    for (const operation of [
      () => api.makeBreaking(baseline(), 'v1', id),
      () => api.rehearse(baseline(), 'v1', id),
      () => api.parseCandidate(JSON.stringify(candidate), 'v1', id),
      ...readers.map((reader) => () => reader(candidate, 'v1', id))
    ]) assert.throws(operation, { code });
  });
}

for (const version of ['getProfile/1', 'getProfile/3', '2.0.0', 'v2', '', null]) {
  test(`adapter and new consumer reject unsupported API contract ${JSON.stringify(version)}`, () => {
    const candidate = raw();
    candidate.apiContract = version;
    for (const reader of readers) {
      assert.throws(() => reader(candidate, 'v1', 'synthetic-001'), { code: 'CONTRACT_MISMATCH' });
    }
  });
}

for (const [name, mutate, code] of [
  ['missing contract', (value) => { delete value.apiContract; }, 'CONTRACT_MISMATCH'],
  ['extra envelope field', (value) => { value.ok = true; }, 'INVALID_ENVELOPE'],
  ['missing person', (value) => { delete value.person; }, 'INVALID_ENVELOPE'],
  ['missing provenance', (value) => { delete value.provenance; }, 'INVALID_ENVELOPE'],
  ['old field aliases', (value) => { value.person.id = value.person.key; }, 'INVALID_PROFILE'],
  ['missing name', (value) => { delete value.person.name; }, 'INVALID_PROFILE'],
  ['null contact', (value) => { value.person.contact = null; }, 'INVALID_PROFILE'],
  ['missing email', (value) => { delete value.person.contact.emailAddress; }, 'INVALID_PROFILE'],
  ['extra contact field', (value) => { value.person.contact.verified = true; }, 'INVALID_PROFILE'],
  ['null settings', (value) => { value.person.settings = null; }, 'INVALID_PROFILE'],
  ['extra setting', (value) => { value.person.settings.source = 'guess'; }, 'INVALID_PROFILE'],
  ['string interests', (value) => { value.person.settings.interests = 'scaling,versions'; }, 'INVALID_PROFILE'],
  ['non-string interest', (value) => { value.person.settings.interests[0] = 12; }, 'INVALID_PROFILE'],
  ['numeric key', (value) => { value.person.key = 1; }, 'INVALID_PROFILE'],
  ['unknown person', (value) => { value.person.key = 'synthetic-999'; }, 'PROFILE_MISMATCH'],
  ['other known person', (value) => { value.person.key = 'synthetic-002'; }, 'PROFILE_MISMATCH'],
  ['changed name', (value) => { value.person.name = 'Avery'; }, 'PROFILE_MISMATCH'],
  ['normalized email', (value) => { value.person.contact.emailAddress = 'AVERY@example.invalid'; }, 'PROFILE_MISMATCH'],
  ['changed locale', (value) => { value.person.settings.language = 'en-US'; }, 'PROFILE_MISMATCH'],
  ['changed theme', (value) => { value.person.settings.colorScheme = 'light'; }, 'PROFILE_MISMATCH'],
  ['reordered interests', (value) => { value.person.settings.interests.reverse(); }, 'PROFILE_MISMATCH'],
  ['dropped interest', (value) => { value.person.settings.interests.pop(); }, 'PROFILE_MISMATCH'],
  ['duplicated interest', (value) => { value.person.settings.interests.push('scaling'); }, 'PROFILE_MISMATCH'],
  ['null provenance', (value) => { value.provenance = null; }, 'PROVENANCE_MISMATCH'],
  ['forged revision', (value) => { value.provenance.fixtureRevision = 'C021-breaking-r2'; }, 'PROVENANCE_MISMATCH'],
  ['live observation claim', (value) => { value.provenance.mode = 'live'; }, 'PROVENANCE_MISMATCH'],
  ['real data claim', (value) => { value.provenance.dataKind = 'real'; }, 'PROVENANCE_MISMATCH'],
  ['unknown source contract', (value) => { value.provenance.sourceApiContract = 'getProfile/2'; }, 'PROVENANCE_MISMATCH'],
  ['missing source stamp', (value) => { delete value.provenance.sourceStamp; }, 'PROVENANCE_MISMATCH'],
  ['other implementation', (value) => { value.provenance.sourceStamp.implementation = 'v2'; }, 'PROVENANCE_MISMATCH'],
  ['forged version', (value) => { value.provenance.sourceStamp.implementationVersion = '999'; }, 'PROVENANCE_MISMATCH'],
  ['forged deployment', (value) => { value.provenance.sourceStamp.deploymentStamp = 'production'; }, 'PROVENANCE_MISMATCH'],
  ['cloud deployment claim', (value) => { value.provenance.sourceStamp.deploymentKind = 'azure'; }, 'PROVENANCE_MISMATCH'],
  ['unknown catalog', (value) => { value.provenance.sourceStamp.profileCatalogVersion = 'synthetic-profiles/2'; }, 'PROVENANCE_MISMATCH'],
  ['extra provenance', (value) => { value.provenance.adapterId = 'auto'; }, 'PROVENANCE_MISMATCH'],
  ['extra source stamp', (value) => { value.provenance.sourceStamp.authorized = true; }, 'PROVENANCE_MISMATCH']
]) {
  test(`both strict readers reject ${name} without an adapted or safe result`, () => {
    const candidate = raw();
    mutate(candidate);
    const before = JSON.stringify(candidate);
    for (const reader of readers) {
      assert.throws(() => reader(candidate, 'v1', 'synthetic-001'), { code });
      assert.equal(JSON.stringify(candidate), before);
    }
    assert.throws(() => api.parseCandidate(before, 'v1', 'synthetic-001'), { code });
  });
}

for (const [name, corrupt] of [
  ['cycle', (value) => { value.extra = value; }],
  ['sparse collection', (value) => { value.person.settings.interests = new Array(2); }],
  ['extra array property', (value) => { value.person.settings.interests.extra = true; }],
  ['symbol', (value) => { value[Symbol('extra')] = true; }],
  ['nonenumerable field', (value) => { Object.defineProperty(value, 'extra', { value: true }); }],
  ['undefined', (value) => { value.person.name = undefined; }],
  ['infinity', (value) => { value.person.name = Infinity; }],
  ['NaN', (value) => { value.person.name = NaN; }],
  ['bigint', (value) => { value.person.name = 1n; }],
  ['function', (value) => { value.person.name = () => 'Avery'; }],
  ['Date', (value) => { value.person.name = new Date(0); }],
  ['custom prototype', (value) => { Object.setPrototypeOf(value.person, { inherited: true }); }],
  ['oversized string', (value) => { value.person.name = 'x'.repeat(16385); }],
  ['oversized collection', (value) => { value.person.settings.interests = new Array(129).fill('x'); }],
  ['excessive depth', (value) => {
    let node = value;
    for (let index = 0; index < 14; index++) { node.extra = {}; node = node.extra; }
  }]
]) {
  test(`adapter and consumer reject non-JSON ${name}`, () => {
    const candidate = raw();
    corrupt(candidate);
    for (const reader of readers) {
      assert.throws(() => reader(candidate, 'v1', 'synthetic-001'), { code: 'INVALID_DATA' });
    }
  });
}

test('accessor input is rejected without executing getters at any nesting level', () => {
  for (const field of ['apiContract', 'person', 'provenance']) {
    const candidate = raw();
    let reads = 0;
    Object.defineProperty(candidate, field, { enumerable: true, get() { reads++; return {}; } });
    for (const reader of readers) assert.throws(() => reader(candidate, 'v1', 'synthetic-001'), { code: 'INVALID_DATA' });
    assert.equal(reads, 0);
  }
  const candidate = raw();
  let reads = 0;
  Object.defineProperty(candidate.person.settings.interests, '0', {
    enumerable: true, get() { reads++; return 'scaling'; }
  });
  assert.throws(() => api.adaptToOld(candidate, 'v1', 'synthetic-001'), { code: 'INVALID_DATA' });
  assert.equal(reads, 0);
});

test('null-prototype own-data records are accepted without trusting inherited identity or stamps', () => {
  const candidate = raw();
  Object.setPrototypeOf(candidate, null);
  Object.setPrototypeOf(candidate.person, null);
  assert.equal(api.adaptToOld(candidate, 'v1', 'synthetic-001').profile.id, 'synthetic-001');
  const inherited = Object.create(candidate);
  assert.throws(() => api.adaptToOld(inherited, 'v1', 'synthetic-001'), { code: 'INVALID_DATA' });
});

test('producer and matrix reject altered C020 baseline stamps, contracts, fields, and envelope', () => {
  for (const [mutate, code] of [
    [(value) => { value.apiContract = 'getProfile/2'; }, 'CONTRACT_MISMATCH'],
    [(value) => { value.stamp.implementationVersion = '2.0.0'; }, 'STAMP_MISMATCH'],
    [(value) => { value.stamp.deploymentStamp = 'production'; }, 'STAMP_MISMATCH'],
    [(value) => { value.profile.preferences.topics.reverse(); }, 'PROFILE_MISMATCH'],
    [(value) => { value.extra = true; }, 'INVALID_ENVELOPE']
  ]) {
    const candidate = JSON.parse(JSON.stringify(baseline()));
    mutate(candidate);
    assert.throws(() => api.makeBreaking(candidate, 'v1', 'synthetic-001'), { code });
    assert.throws(() => api.rehearse(candidate, 'v1', 'synthetic-001'), { code });
  }
});

test('JSON parser rejects missing, empty, whitespace, malformed, oversized, and noncontract candidates', () => {
  for (const text of [undefined, null, '', ' ', '{', 'x'.repeat(16385)]) {
    assert.throws(() => api.parseCandidate(text, 'v1', 'synthetic-001'), { code: 'INVALID_JSON' });
  }
  for (const text of ['null', 'true', '[]', '{}', '{"healthy":true}']) {
    assert.throws(() => api.parseCandidate(text, 'v1', 'synthetic-001'), { code: 'CONTRACT_MISMATCH' });
  }
  const candidate = api.parseCandidate(`  ${JSON.stringify(raw())}\n`, 'v1', 'synthetic-001');
  assert.equal(candidate.apiContract, 'getProfile/2');
  assert.equal(Object.isFrozen(candidate.person.settings.interests), true);
  assert.throws(() => api.parseCandidate('{"apiContract":"getProfile/3"}', 'v1', 'synthetic-001'), { code: 'CONTRACT_MISMATCH' });
});
