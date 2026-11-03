'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const path = require('node:path');
const test = require('node:test');
const { getArtifact, parseRange } = require('../artifact.cjs');
const { getProfileV1, getProfileV2 } = require(path.join(__dirname, '..', '..', 'C020', 'profiles.cjs'));

test('immutable synthetic artifact is bounded, deterministic and really hashed', () => {
  const first = getArtifact({ profileId: 'synthetic-001', version: 'r1' });
  const second = getArtifact({ profileId: 'synthetic-001', version: 'r1' });
  assert.equal(first.manifest.byteLength, 8192, 'The fixture must supply bounded original bytes, not a NOT_IMPLEMENTED label.');
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(first.bytes.length, first.manifest.byteLength);
  assert.equal(createHash('sha256').update(first.bytes).digest('hex'), first.manifest.sha256);
  assert.equal(first.manifest.etag, `"sha256-${first.manifest.sha256}"`);
});

test('a range resumes at the first byte after the accepted inclusive interval', () => {
  assert.deepEqual(parseRange('bytes=0-1023', 8192), { start: 0, end: 1023, length: 1024 });
  assert.deepEqual(parseRange('bytes=1024-', 8192), { start: 1024, end: 8191, length: 7168 });
});

test('invalid and unsatisfiable ranges reject instead of silently serving success', () => {
  assert.throws(() => parseRange('bytes=9-1', 8192), { code: 'INVALID_RANGE' });
  assert.throws(() => parseRange('bytes=8192-', 8192), { code: 'RANGE_UNSATISFIABLE', status: 416 });
});

for (const profileId of ['synthetic-001', 'synthetic-002']) {
  for (const [version, provider] of [['r1', getProfileV1], ['r2', getProfileV2]]) {
    test(`${profileId}/${version} embeds the unchanged C020 provider, binary bytes and observable lineage`, () => {
      const { manifest, bytes } = getArtifact({ profileId, version });
      const prefix = JSON.parse(bytes.subarray(0, bytes.indexOf(10)).toString('utf8'));
      assert.deepEqual(prefix.fixture, provider({ profileId }));
      assert.equal(prefix.artifactId, manifest.artifactId);
      assert.deepEqual(manifest.lineage.stamp, provider({ profileId }).stamp);
      assert.equal(manifest.lineage.apiContract, 'getProfile/1');
      assert.equal(manifest.profileId, profileId);
      assert.equal(manifest.artifactVersion, version);
      assert.equal(manifest.dataKind, 'synthetic');
      assert.equal(manifest.localOnly, true);
      assert.equal(new Set(bytes.subarray(-256)).size, 256, 'The fixture is real binary, not a string-shaped range label.');
      assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
    });
  }
}

test('all four identities have distinct original hashes and isolated mutable byte copies', () => {
  const hashes = new Set();
  for (const profileId of ['synthetic-001', 'synthetic-002']) {
    for (const version of ['r1', 'r2']) hashes.add(getArtifact({ profileId, version }).manifest.sha256);
  }
  assert.equal(hashes.size, 4);
  const first = getArtifact({ profileId: 'synthetic-001', version: 'r1' });
  const original = Buffer.from(first.bytes);
  first.bytes.fill(0);
  assert.deepEqual(getArtifact({ profileId: 'synthetic-001', version: 'r1' }).bytes, original);
  assert.throws(() => { first.manifest.sha256 = 'forged'; }, TypeError);
  assert.throws(() => { first.manifest.lineage.stamp.deploymentStamp = 'forged'; }, TypeError);
});

for (const [input, expected] of [
  ['bytes=0-0', { start: 0, end: 0, length: 1 }],
  ['bytes=8191-', { start: 8191, end: 8191, length: 1 }],
  ['bytes=8000-9999', { start: 8000, end: 8191, length: 192 }],
  ['bytes=-256', { start: 7936, end: 8191, length: 256 }],
  ['bytes=-9999', { start: 0, end: 8191, length: 8192 }],
  ['bytes=0000-0001', { start: 0, end: 1, length: 2 }]
]) {
  test(`single-range bounds ${input}`, () => assert.deepEqual(parseRange(input, 8192), expected));
}

for (const input of [
  undefined, null, '', 'bytes=-', 'items=0-1', 'bytes=1-0', 'bytes=-1-3',
  'bytes=0-1,4-5', 'bytes=0-1,bytes=4-5', 'bytes=1.5-2', 'bytes=1e2-999',
  'bytes= 0-1', ' bytes=0-1', 'bytes=0-9007199254740992', 'bytes=9007199254740992-'
]) {
  test(`invalid range rejects ${JSON.stringify(input)}`, () => {
    assert.throws(() => parseRange(input, 8192), { code: 'INVALID_RANGE', status: 400 });
  });
}
for (const input of ['bytes=8192-', 'bytes=9999-99999', 'bytes=-0']) {
  test(`unsatisfiable range rejects ${input}`, () => {
    assert.throws(() => parseRange(input, 8192), { code: 'RANGE_UNSATISFIABLE', status: 416 });
  });
}
for (const total of [0, -1, 8193, NaN, 1.5, '8192']) {
  test(`invalid artifact length rejects ${total}`, () => assert.throws(() => parseRange('bytes=0-1', total), { code: 'INVALID_LENGTH' }));
}

test('direct fixture input rejects absent, inherited, extra, accessor and unknown identity fields', () => {
  for (const input of [null, undefined, [], {}, { profileId: 'synthetic-001' },
    { profileId: 'synthetic-001', version: 'r1', sha256: 'forged' },
    Object.create({ profileId: 'synthetic-001', version: 'r1' }),
    { get profileId() { throw new Error('must not evaluate'); }, version: 'r1' }]) {
    assert.throws(() => getArtifact(input), { code: 'INVALID_REQUEST' });
  }
  assert.throws(() => getArtifact({ profileId: '', version: 'r1' }), { code: 'INVALID_PROFILE_ID' });
  assert.throws(() => getArtifact({ profileId: 'synthetic-999', version: 'r1' }), { code: 'UNKNOWN_PROFILE', status: 404 });
  for (const version of ['r3', 'toString', '__proto__', null]) {
    assert.throws(() => getArtifact({ profileId: 'synthetic-001', version }), { code: 'UNKNOWN_VERSION', status: 404 });
  }
});
