'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const path = require('node:path');
const upload = require(process.env.C024_TEST_SUBJECT || path.join(__dirname, '..', 'upload.js'));
const { getProfileV2 } = require(path.resolve('capability', 'C020', 'profiles.cjs'));
const fixtureId = 'C024-synthetic-001-r1';
const ids = ['part-001', 'part-002', 'part-003', 'part-004'];
const actualBytes = Uint8Array.from({ length: 256 }, (_, index) => (index * 37 + 11) % 256);
const expected = createHash('sha256').update(actualBytes).digest('hex');
function started() { return upload.createUpload({ fixtureId }); }
function allParts(handle) {
  for (const id of [...ids].reverse()) upload.acceptPart(handle, id, upload.partBytes(id));
}

test('immutable fixture metadata reuses the actual unchanged C020 catalog', () => {
  const profile = getProfileV2({ profileId: 'synthetic-001' });
  assert.equal(upload.manifest.fixtureRevision, 'C024-r1');
  assert.equal(upload.manifest.profileId, profile.profile.id);
  assert.equal(upload.manifest.source.apiContract, profile.apiContract);
  assert.deepEqual(upload.manifest.source.stamp, profile.stamp);
  assert.equal(upload.manifest.byteCount, 256);
  assert.deepEqual(upload.manifest.partIds, ids);
  assert.equal(upload.manifest.expectedSha256, expected);
});

test('out-of-order acceptance records explicit IDs and identical duplicates add no bytes', () => {
  const handle = started();
  upload.acceptPart(handle, 'part-003', upload.partBytes('part-003'));
  upload.acceptPart(handle, 'part-001', upload.partBytes('part-001'));
  const observation = upload.acceptPart(handle, 'part-001', upload.partBytes('part-001'));
  assert.deepEqual(observation.acceptedPartIds, ['part-001', 'part-003']);
  assert.deepEqual(observation.arrivalOrder, ['part-003', 'part-001']);
  assert.equal(observation.acceptedBytes, 128);
  assert.equal(observation.duplicate, true);
});

test('missing accepted parts reject completion rather than imply success', async () => {
  const handle = started();
  upload.acceptPart(handle, 'part-001', upload.partBytes('part-001'));
  await assert.rejects(upload.completeUpload(handle, { partIds: ids, expectedSha256: expected }),
    { code: 'MISSING_PARTS' });
});

test('same-object pause and resume observes retained accepted and missing IDs', () => {
  const handle = started();
  for (const id of ['part-002', 'part-004']) upload.acceptPart(handle, id, upload.partBytes(id));
  assert.equal(upload.pauseUpload(handle).status, 'paused');
  const observation = upload.resumeUpload(handle);
  assert.deepEqual(observation.acceptedPartIds, ['part-002', 'part-004']);
  assert.deepEqual(observation.missingPartIds, ['part-001', 'part-003']);
  assert.equal(observation.acceptedBytes, 128);
  assert.equal(observation.resumeCount, 1);
  assert.equal(observation.resumeScope, 'same-memory-object-only');
});

test('completion hashes the actual assembled synthetic bytes independently', async () => {
  const handle = started();
  allParts(handle);
  const receipt = await upload.completeUpload(handle, { partIds: ids, expectedSha256: expected });
  assert.equal(receipt.actualSha256, expected);
  assert.equal(receipt.expectedSha256, expected);
  assert.deepEqual(receipt.orderedPartIds, ids);
  assert.equal(receipt.byteCount, 256);
  const assembled = upload.readCompletedBytes(handle);
  assert.deepEqual(assembled, actualBytes);
  assert.equal(createHash('sha256').update(assembled).digest('hex'), receipt.actualSha256);
});
