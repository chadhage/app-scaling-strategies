'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const test = require('node:test');
const { getArtifact } = require('../artifact.cjs');
const { DownloadSession, validateManifest, sha256, MAX_ATTEMPTS } = require('../download.js');

const original = getArtifact({ profileId: 'synthetic-001', version: 'r1' });
function observation(start = 0, end = 1023, artifact = original) {
  return {
    requestedRange: `bytes=${start}-${end}`, status: 206,
    headers: {
      etag: artifact.manifest.etag,
      'accept-ranges': 'bytes', 'content-type': 'application/octet-stream',
      'content-range': `bytes ${start}-${end}/${artifact.bytes.length}`,
      'content-length': String(end - start + 1),
      'x-c025-artifact-id': artifact.manifest.artifactId,
      'x-c025-artifact-version': artifact.manifest.artifactVersion,
      'x-c020-deployment-stamp': artifact.manifest.lineage.stamp.deploymentStamp
    }, bytes: new Uint8Array(artifact.bytes.subarray(start, end + 1))
  };
}

test('a pinned manifest is detached and no incomplete assembly exposes verified bytes or a fabricated hash', () => {
  const candidate = structuredClone(original.manifest);
  const session = new DownloadSession(candidate);
  candidate.sha256 = 'forged';
  const snapshot = session.snapshot();
  assert.equal(snapshot.manifest.sha256, original.manifest.sha256);
  assert.equal(snapshot.outcome, 'incomplete');
  assert.equal(snapshot.acceptedBytes, 0);
  assert.equal(snapshot.cursor, 0);
  assert.equal(snapshot.assembledSha256, null);
  assert.throws(() => session.verifiedBytes(), { code: 'NOT_VERIFIED' });
  assert.throws(() => { snapshot.manifest.lineage.stamp.deploymentStamp = 'forged'; }, TypeError);
});

test('out-of-order, duplicate and overlapping valid ranges expose real union coverage and first gap', async () => {
  const session = new DownloadSession(original.manifest);
  let state = await session.observe(observation(2048, 8191));
  assert.deepEqual(state.ranges, [{ start: 2048, end: 8191 }]);
  assert.equal(state.cursor, 0);
  assert.equal(state.acceptedBytes, 6144);
  state = await session.observe(observation(0, 1023));
  assert.equal(state.cursor, 1024);
  assert.deepEqual(state.ranges, [{ start: 0, end: 1023 }, { start: 2048, end: 8191 }]);
  state = await session.observe(observation(0, 1023));
  assert.equal(state.acceptedBytes, 7168);
  assert.equal(state.lastAttempt.newBytes, 0);
  state = await session.observe(observation(512, 2047));
  assert.equal(state.outcome, 'verified');
  assert.equal(state.acceptedBytes, 8192);
  assert.equal(state.cursor, null);
  assert.deepEqual(state.ranges, [{ start: 0, end: 8191 }]);
  assert.equal(state.assembledSha256, createHash('sha256').update(original.bytes).digest('hex'));
  assert.deepEqual(Buffer.from(session.verifiedBytes()), original.bytes);
  const copy = session.verifiedBytes();
  copy.fill(0);
  assert.deepEqual(Buffer.from(session.verifiedBytes()), original.bytes);
});

test('a conflicting overlap rejects atomically, including otherwise new tail bytes', async () => {
  const session = new DownloadSession(original.manifest);
  await session.observe(observation());
  const conflicting = observation(512, 1535);
  conflicting.bytes[0] ^= 255;
  const state = await session.observe(conflicting);
  assert.equal(state.lastAttempt.code, 'OVERLAP_CONFLICT');
  assert.equal(state.acceptedBytes, 1024);
  assert.equal(state.cursor, 1024);
  assert.deepEqual(state.ranges, [{ start: 0, end: 1023 }]);
});

for (const [name, mutate, code] of [
  ['200 version replacement', (value) => { value.status = 200; }, 'HTTP_200'],
  ['HTTP 416', (value) => { value.status = 416; }, 'HTTP_416'],
  ['HTTP 412', (value) => { value.status = 412; }, 'HTTP_412'],
  ['forged ETag', (value) => { value.headers.etag = '"forged"'; }, 'ARTIFACT_CHANGED'],
  ['missing ETag', (value) => { delete value.headers.etag; }, 'ARTIFACT_CHANGED'],
  ['other artifact', (value) => { value.headers['x-c025-artifact-id'] = 'C025:synthetic-002:r1'; }, 'ARTIFACT_CHANGED'],
  ['other version', (value) => { value.headers['x-c025-artifact-version'] = 'r2'; }, 'ARTIFACT_CHANGED'],
  ['other lineage', (value) => { value.headers['x-c020-deployment-stamp'] = 'forged'; }, 'ARTIFACT_CHANGED'],
  ['encoded body', (value) => { value.headers['content-encoding'] = 'gzip'; }, 'INVALID_REPRESENTATION'],
  ['wrong type', (value) => { value.headers['content-type'] = 'text/plain'; }, 'INVALID_REPRESENTATION'],
  ['missing range support', (value) => { delete value.headers['accept-ranges']; }, 'INVALID_REPRESENTATION'],
  ['wrong total', (value) => { value.headers['content-range'] = 'bytes 1024-2047/8193'; }, 'INVALID_CONTENT_RANGE'],
  ['missing content range', (value) => { delete value.headers['content-range']; }, 'INVALID_CONTENT_RANGE'],
  ['reversed content range', (value) => { value.headers['content-range'] = 'bytes 2047-1024/8192'; }, 'INVALID_CONTENT_RANGE'],
  ['wrong requested bounds', (value) => { value.requestedRange = 'bytes=2048-3071'; }, 'REQUEST_RANGE_MISMATCH'],
  ['invalid recorded request', (value) => { value.requestedRange = 'bytes=invalid'; }, 'REQUEST_RANGE_MISMATCH'],
  ['short actual body', (value) => { value.bytes = value.bytes.subarray(1); }, 'LENGTH_MISMATCH'],
  ['wrong declared length', (value) => { value.headers['content-length'] = '1023'; }, 'LENGTH_MISMATCH'],
  ['non-byte body', (value) => { value.bytes = Array.from(value.bytes); }, 'LENGTH_MISMATCH']
]) {
  test(`no new bytes accepted for ${name}`, async () => {
    const session = new DownloadSession(original.manifest);
    await session.observe(observation());
    const invalid = observation(1024, 2047);
    mutate(invalid);
    const state = await session.observe(invalid);
    assert.equal(state.outcome, 'rejected');
    assert.equal(state.lastAttempt.code, code);
    assert.equal(state.acceptedBytes, 1024);
    assert.equal(state.cursor, 1024);
    assert.equal(state.failures, 1);
    assert.equal(state.assembledSha256, null);
    assert.throws(() => session.verifiedBytes(), { code: 'NOT_VERIFIED' });
  });
}

test('suffix and open-ended response bounds agree with the recorded request', async () => {
  const session = new DownloadSession(original.manifest);
  const suffix = observation(7936, 8191);
  suffix.requestedRange = 'bytes=-256';
  assert.equal((await session.observe(suffix)).acceptedBytes, 256);
  const open = observation(0, 8191);
  open.requestedRange = 'bytes=0-';
  assert.equal((await session.observe(open)).outcome, 'verified');
});

test('complete but corrupt bytes compute a real wrong hash and remain rejected, never mixed success', async () => {
  const session = new DownloadSession(original.manifest);
  const corrupt = observation(0, 8191);
  corrupt.bytes[8191] ^= 1;
  const state = await session.observe(corrupt);
  assert.equal(state.acceptedBytes, 8192);
  assert.equal(state.cursor, null);
  assert.equal(state.outcome, 'rejected');
  assert.equal(state.verification, 'hash-mismatch');
  assert.equal(state.lastAttempt.code, 'HASH_MISMATCH');
  assert.equal(state.assembledSha256, createHash('sha256').update(corrupt.bytes).digest('hex'));
  assert.notEqual(state.assembledSha256, state.expectedSha256);
  assert.throws(() => session.verifiedBytes(), { code: 'NOT_VERIFIED' });
});

test('prior rejection and unknown attempts survive successful byte resume; later failures clear a success-shaped latest outcome', async () => {
  const session = new DownloadSession(original.manifest);
  await session.observe(observation());
  session.recordFailure('NETWORK_UNKNOWN', 'No HTTP response observed.', 'unknown');
  const other = getArtifact({ profileId: 'synthetic-001', version: 'r2' });
  await session.observe(observation(1024, 2047, other));
  const state = await session.observe(observation(1024, 8191));
  assert.equal(state.outcome, 'verified-with-failures');
  assert.equal(state.failures, 2);
  assert.deepEqual(state.attempts.filter((event) => event.outcome !== 'accepted').map((event) => event.code), ['NETWORK_UNKNOWN', 'ARTIFACT_CHANGED']);
  assert.deepEqual(Buffer.from(session.verifiedBytes()), original.bytes);
  const failedLater = session.recordFailure('HTTP_416', 'Unsatisfiable range.');
  assert.equal(failedLater.outcome, 'rejected');
  assert.equal(failedLater.verification, 'verified', 'Historical exact byte proof is distinct from the latest failed attempt.');
  assert.equal(failedLater.failures, 3);
});

test('missing SHA-256 support leaves complete coverage explicitly unknown', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    const session = new DownloadSession(original.manifest);
    const state = await session.observe(observation(0, 8191));
    assert.equal(state.outcome, 'unknown');
    assert.equal(state.lastAttempt.code, 'HASH_UNKNOWN');
    assert.equal(state.acceptedBytes, 8192);
    assert.equal(state.assembledSha256, null);
    assert.throws(() => session.verifiedBytes(), { code: 'NOT_VERIFIED' });
  } finally { Object.defineProperty(globalThis, 'crypto', descriptor); }
});

test('browser digest agrees with the independent Node SHA-256 oracle', async () => {
  const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
  assert.equal(await sha256(bytes), createHash('sha256').update(bytes).digest('hex'));
});

for (const [name, mutate] of [
  ['unknown contract', (value) => { value.apiContract = 'unknown'; }],
  ['real data label', (value) => { value.dataKind = 'real'; }],
  ['missing local scope', (value) => { delete value.localOnly; }],
  ['oversized bytes', (value) => { value.byteLength = 8193; }],
  ['zero bytes', (value) => { value.byteLength = 0; }],
  ['fractional bytes', (value) => { value.byteLength = 1.5; }],
  ['wrong ID', (value) => { value.artifactId = 'wrong'; }],
  ['unknown version', (value) => { value.artifactVersion = 'r3'; }],
  ['weak validator', (value) => { value.etag = `W/${value.etag}`; }],
  ['missing original digest', (value) => { delete value.sha256; }],
  ['missing lineage', (value) => { delete value.lineage; }],
  ['forged lineage profile', (value) => { value.lineage.profileId = 'synthetic-002'; }]
]) {
  test(`manifest rejects ${name}`, () => {
    const value = structuredClone(original.manifest);
    mutate(value);
    assert.throws(() => validateManifest(value), { code: 'INVALID_MANIFEST' });
  });
}

test('attempt history is bounded without silently deleting earlier failures', () => {
  const session = new DownloadSession(original.manifest);
  for (let i = 0; i < MAX_ATTEMPTS + 20; i++) session.recordFailure(`REJECT_${i}`, 'Retain this failed attempt.');
  const state = session.snapshot();
  assert.equal(state.attemptLimitReached, true);
  assert.equal(state.attempts.length, MAX_ATTEMPTS + 1);
  assert.equal(state.attempts[0].code, 'REJECT_0');
  assert.equal(state.lastAttempt.code, 'ATTEMPT_LIMIT');
  assert.equal(state.acceptedBytes, 0);
});

test('a final corrupt body at the attempt budget retains HASH_MISMATCH, not a generic limit replacement', async () => {
  const session = new DownloadSession(original.manifest);
  for (let i = 0; i < MAX_ATTEMPTS - 1; i++) session.recordFailure(`REJECT_${i}`, 'Earlier failure.');
  const corrupt = observation(0, 8191);
  corrupt.bytes[8191] ^= 1;
  const state = await session.observe(corrupt);
  assert.equal(state.lastAttempt.code, 'HASH_MISMATCH');
  assert.equal(state.lastAttempt.newBytes, 8192);
  assert.equal(state.attempts.length, MAX_ATTEMPTS);
  assert.equal(state.verification, 'hash-mismatch');
  assert.equal(state.acceptedBytes, 8192);
});

test('a final unavailable hash at the attempt budget retains UNKNOWN and the real accepted interval', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    const session = new DownloadSession(original.manifest);
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) session.recordFailure(`REJECT_${i}`, 'Earlier failure.');
    const state = await session.observe(observation(0, 8191));
    assert.equal(state.lastAttempt.code, 'HASH_UNKNOWN');
    assert.equal(state.outcome, 'unknown');
    assert.equal(state.lastAttempt.newBytes, 8192);
    assert.deepEqual(state.lastAttempt.acceptedRange, { start: 0, end: 8191 });
    assert.equal(state.attempts.length, MAX_ATTEMPTS);
    assert.equal(state.assembledSha256, null);
  } finally { Object.defineProperty(globalThis, 'crypto', descriptor); }
});
