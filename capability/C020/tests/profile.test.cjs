'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const subject = require(path.join(__dirname, '..', 'profiles.cjs'));
const contract = require(path.join(__dirname, '..', 'contract.js'));

const expectedProfiles = [
  {
    id: 'synthetic-001',
    displayName: 'Avery Example',
    email: 'avery@example.invalid',
    preferences: { locale: 'en-GB', theme: 'dark', topics: ['scaling', 'versions'] }
  },
  {
    id: 'synthetic-002',
    displayName: 'Jordan Sample',
    email: 'jordan@example.invalid',
    preferences: { locale: 'fr-FR', theme: 'light', topics: [] }
  }
];

function unchangedOldConsumer(response) {
  assert.equal(response.apiContract, 'getProfile/1');
  const { id, displayName, email, preferences } = response.profile;
  assert.equal(typeof id, 'string');
  assert.equal(typeof displayName, 'string');
  assert.equal(typeof email, 'string');
  return `${id}|${displayName}|${email}|${preferences.locale}|${preferences.theme}|${preferences.topics.join(',')}`;
}

for (const [implementation, getProfile] of [
  ['v1', subject.getProfileV1], ['v2', subject.getProfileV2]
]) {
  for (const profile of expectedProfiles) {
    test(`${implementation} preserves ${profile.id} with the unchanged getProfile/1 consumer`, () => {
      const response = getProfile({ profileId: profile.id });
      assert.equal(response.apiContract, 'getProfile/1');
      assert.deepEqual(response.profile, profile);
      assert.equal(unchangedOldConsumer(response), unchangedOldConsumer({ apiContract: 'getProfile/1', profile }));
    });
  }

  test(`${implementation} returns deeply frozen, independently allocated profiles and stamps`, () => {
    const first = getProfile({ profileId: 'synthetic-001' });
    const second = getProfile({ profileId: 'synthetic-001' });
    for (const value of [first, first.profile, first.profile.preferences, first.profile.preferences.topics, first.stamp]) {
      assert.equal(Object.isFrozen(value), true);
    }
    assert.notEqual(first.profile, second.profile);
    assert.notEqual(first.profile.preferences, second.profile.preferences);
    assert.notEqual(first.profile.preferences.topics, second.profile.preferences.topics);
    assert.notEqual(first.stamp, second.stamp);
    assert.notEqual(first.profile, contract.profiles[0]);
    assert.throws(() => { first.profile.displayName = 'Changed'; }, TypeError);
    assert.throws(() => { first.profile.preferences.locale = 'Changed'; }, TypeError);
    assert.throws(() => { first.profile.preferences.topics.push('Changed'); }, TypeError);
    assert.throws(() => { first.stamp.deploymentStamp = 'forged'; }, TypeError);
    assert.throws(() => { first.stamp.implementationVersion = '999'; }, TypeError);
    const wireCopy = JSON.parse(JSON.stringify(first));
    wireCopy.profile.preferences.topics.push('client-local-only');
    assert.deepEqual(getProfile({ profileId: 'synthetic-001' }), second);
  });

  test(`${implementation} accepts an explicit frozen or null-prototype request without mutating it`, () => {
    const request = Object.freeze({ profileId: 'synthetic-002' });
    assert.equal(getProfile(request).profile.id, 'synthetic-002');
    const nullPrototype = Object.assign(Object.create(null), request);
    assert.equal(getProfile(nullPrototype).profile.id, 'synthetic-002');
    assert.deepEqual(Object.keys(request), ['profileId']);
  });

  for (const [name, request, code = 'INVALID_REQUEST'] of [
    ['missing request', undefined], ['null request', null], ['array', []], ['string', 'synthetic-001'],
    ['missing ID', {}], ['undefined ID', { profileId: undefined }, 'INVALID_PROFILE_ID'],
    ['blank ID', { profileId: '' }, 'INVALID_PROFILE_ID'],
    ['numeric ID', { profileId: 1 }, 'INVALID_PROFILE_ID'],
    ['whitespace ID', { profileId: ' synthetic-001' }, 'INVALID_PROFILE_ID'],
    ['trailing newline ID', { profileId: 'synthetic-001\n' }, 'INVALID_PROFILE_ID'],
    ['unknown ID', { profileId: 'synthetic-999' }, 'UNKNOWN_PROFILE'],
    ['implementation override', { profileId: 'synthetic-001', implementation: 'v2' }],
    ['version override', { profileId: 'synthetic-001', implementationVersion: '999' }],
    ['deployment override', { profileId: 'synthetic-001', deploymentStamp: 'forged' }],
    ['nested stamp override', { profileId: 'synthetic-001', stamp: { implementationVersion: '999' } }],
    ['contract override', { profileId: 'synthetic-001', apiContract: 'getProfile/999' }],
    ['symbol property', { profileId: 'synthetic-001', [Symbol('stamp')]: 'forged' }],
    ['inherited fields', Object.create({ profileId: 'synthetic-001' })],
    ['own ID with custom prototype', Object.assign(Object.create({ stamp: 'forged' }), { profileId: 'synthetic-001' })],
    ['nonenumerable ID', Object.defineProperty({}, 'profileId', { value: 'synthetic-001' })]
  ]) {
    test(`${implementation} rejects ${name} without a healthy default`, () => {
      assert.throws(() => getProfile(request), (error) => {
        assert.equal(error.name, 'FixtureError');
        assert.equal(error.code, code);
        assert.equal(error.status, code === 'UNKNOWN_PROFILE' ? 404 : 400);
        assert.equal(Object.hasOwn(error, 'profile'), false);
        return true;
      });
    });
  }

  test(`${implementation} rejects accessor input without invoking it`, () => {
    let reads = 0;
    const request = Object.defineProperty({}, 'profileId', { enumerable: true, get() { reads++; return 'synthetic-001'; } });
    assert.throws(() => getProfile(request), { code: 'INVALID_REQUEST' });
    assert.equal(reads, 0);
  });
}

test('both implementations preserve every profile while differing only in server-owned version stamps', () => {
  for (const profile of expectedProfiles) {
    const v1 = subject.getProfileV1({ profileId: profile.id });
    const v2 = subject.getProfileV2({ profileId: profile.id });
    assert.deepEqual(v1.profile, v2.profile);
    assert.notEqual(v1.profile, v2.profile);
    assert.equal(v1.apiContract, v2.apiContract);
    assert.equal(v1.stamp.implementation, 'v1');
    assert.equal(v2.stamp.implementation, 'v2');
    assert.equal(v1.stamp.implementationVersion, '1.0.0');
    assert.equal(v2.stamp.implementationVersion, '2.0.0');
    assert.equal(v1.stamp.deploymentStamp, 'C020-loopback-v1-r1');
    assert.equal(v2.stamp.deploymentStamp, 'C020-loopback-v2-r1');
    assert.equal(v1.stamp.deploymentKind, 'local-fixture-label-not-cloud');
    assert.equal(v2.stamp.dataKind, 'synthetic');
    assert.equal(unchangedOldConsumer(v1), unchangedOldConsumer(v2));
  }
});

test('source catalog and exported stamps are deeply immutable', () => {
  assert.equal(Object.isFrozen(subject), true);
  assert.equal(Object.isFrozen(contract), true);
  assert.equal(Object.isFrozen(contract.profiles), true);
  assert.equal(Object.isFrozen(contract.profiles[0].preferences.topics), true);
  assert.equal(Object.isFrozen(contract.stamps.v2), true);
  assert.throws(() => { contract.profiles[0].preferences.topics[0] = 'changed'; }, TypeError);
  assert.throws(() => { contract.stamps.v2.implementationVersion = 'changed'; }, TypeError);
  assert.deepEqual(contract.profiles, expectedProfiles);
});

test('interleaved caller-local mutations never leak to either implementation', async () => {
  const results = await Promise.all(Array.from({ length: 40 }, async (_, index) => {
    const getProfile = index % 2 ? subject.getProfileV1 : subject.getProfileV2;
    const profile = expectedProfiles[index % expectedProfiles.length];
    const response = getProfile({ profileId: profile.id });
    const localCopy = JSON.parse(JSON.stringify(response));
    localCopy.profile.preferences.theme = `caller-${index}`;
    return response.profile;
  }));
  results.forEach((profile, index) => assert.deepEqual(profile, expectedProfiles[index % expectedProfiles.length]));
});
