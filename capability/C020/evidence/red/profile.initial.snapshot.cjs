'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const subject = require(process.env.C020_TEST_SUBJECT
  ? path.resolve(__dirname, process.env.C020_TEST_SUBJECT)
  : path.join(__dirname, '..', 'profiles.cjs'));

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
}
