'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const fixture = require('../upload.js');
const lineage = require('../manifest.json');
const profiles = require('../../C020/profiles.cjs');
const repository = path.resolve(__dirname, '..', '..', '..');
const ids = [...fixture.manifest.partIds];
const hash = fixture.manifest.expectedSha256;
const start = () => fixture.createUpload({ fixtureId: fixture.manifest.fixtureId });
const request = (partIds = ids, expectedSha256 = hash) => ({ partIds, expectedSha256 });
const all = (handle) => ids.forEach((id) => fixture.acceptPart(handle, id, fixture.partBytes(id)));
const view = (handle) => fixture.inspectUpload(handle);

test('real C020 v1/v2 metadata and pinned accepted file hashes are unchanged', () => {
  for (const getProfile of [profiles.getProfileV1, profiles.getProfileV2]) {
    const response = getProfile({ profileId: fixture.manifest.profileId });
    assert.deepEqual(response.profile, fixture.manifest.source.profile);
    assert.equal(response.apiContract, fixture.manifest.source.apiContract);
    assert.equal(response.stamp.profileCatalogVersion, fixture.manifest.source.stamp.profileCatalogVersion);
    assert.equal(response.stamp.fixtureRevision, 'C020-r1');
  }
  for (const entry of lineage.source.files) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(repository, entry.path))).digest('hex'), entry.sha256);
  }
  assert.equal(lineage.source.commit, '2dc471daab3ffa202d83aba2df443e280cad3656');
  assert.equal(lineage.kanoUnit, 'C024');
});

test('manifest, nested source metadata and part plans are immutable', () => {
  function frozen(value) {
    if (!value || typeof value !== 'object') return;
    assert.equal(Object.isFrozen(value), true);
    Object.values(value).forEach(frozen);
  }
  frozen(fixture.manifest);
  assert.throws(() => { fixture.manifest.parts[0].byteCount = 100; }, TypeError);
  assert.equal(fixture.manifest.source.stamp.deploymentKind, 'local-fixture-label-not-cloud');
  assert.equal(fixture.manifest.storage, 'in-memory-only');
});

test('UMD browser globals import the actual C020 contract without copying its API', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(repository, 'capability', 'C020', 'contract.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(repository, 'capability', 'C024', 'upload.js'), 'utf8'), context);
  const observed = vm.runInContext(`JSON.stringify((() => {
    const handle = C024Upload.createUpload({fixtureId: C024Upload.manifest.fixtureId});
    C024Upload.acceptPart(handle, 'part-002', C024Upload.partBytes('part-002'));
    return { manifest: C024Upload.manifest, view: C024Upload.inspectUpload(handle),
      sameSource: C024Upload.manifest.source.profile === C020Contract.profiles[0] };
  })())`, context);
  const value = JSON.parse(observed);
  assert.deepEqual(value.manifest, fixture.manifest);
  assert.deepEqual(value.view.acceptedPartIds, ['part-002']);
  assert.equal(value.sameSource, true);
});

for (const [label, value, code] of [
  ['missing', undefined, 'INVALID_START_REQUEST'],
  ['null', null, 'INVALID_START_REQUEST'],
  ['array', [], 'INVALID_START_REQUEST'],
  ['no fields', {}, 'INVALID_START_REQUEST'],
  ['unknown fixture', { fixtureId: 'not-authorized' }, 'UNKNOWN_FIXTURE'],
  ['extra field', { fixtureId: fixture.manifest.fixtureId, stamp: 'forged' }, 'INVALID_START_REQUEST'],
  ['inherited fields', Object.create({ fixtureId: fixture.manifest.fixtureId }), 'INVALID_START_REQUEST'],
  ['symbol override', { fixtureId: fixture.manifest.fixtureId, [Symbol('override')]: true }, 'INVALID_START_REQUEST']
]) {
  test(`start rejects ${label} without a default upload`, () => {
    assert.throws(() => fixture.createUpload(value), { code });
  });
}

test('request getters are rejected without executing them; null-prototype own records work', () => {
  let invoked = false;
  assert.throws(() => fixture.createUpload({ get fixtureId() { invoked = true; return fixture.manifest.fixtureId; } }),
    { code: 'INVALID_START_REQUEST' });
  assert.equal(invoked, false);
  const record = Object.assign(Object.create(null), { fixtureId: fixture.manifest.fixtureId });
  assert.equal(view(fixture.createUpload(record)).acceptedBytes, 0);
});

for (const id of ids) {
  test(`${id} is a bounded exact copy and public mutation cannot change the fixture`, () => {
    const part = fixture.partBytes(id);
    const offset = ids.indexOf(id) * 64;
    assert.equal(part.byteLength, 64);
    assert.deepEqual(part, Uint8Array.from({ length: 64 }, (_, index) => ((index + offset) * 37 + 11) % 256));
    part.fill(0);
    assert.notDeepEqual(fixture.partBytes(id), part);
  });
}

for (const id of [undefined, '', 'part-000', 'part-005', 'PART-001', 1, {}, 'part-999']) {
  test(`unknown part identity ${JSON.stringify(id)} cannot be accepted`, () => {
    const handle = start();
    assert.throws(() => fixture.partBytes(id), { code: 'UNKNOWN_PART_ID' });
    assert.throws(() => fixture.acceptPart(handle, id, new Uint8Array(64)), { code: 'UNKNOWN_PART_ID' });
    assert.deepEqual(view(handle).acceptedPartIds, []);
  });
}

for (const [label, bytes] of [
  ['null', null], ['array', new Array(64).fill(0)], ['short', new Uint8Array(63)],
  ['long', new Uint8Array(65)], ['other element type', new Uint16Array(64)],
  ['DataView', new DataView(new ArrayBuffer(64))], ['Buffer subclass', Buffer.alloc(64)],
  ['typed subclass', new (class extends Uint8Array {})(64)]
]) {
  test(`reject ${label} bytes without accepting arbitrary content`, () => {
    const handle = start();
    assert.throws(() => fixture.acceptPart(handle, ids[0], bytes), { code: 'INVALID_PART_BYTES' });
    assert.equal(view(handle).acceptedBytes, 0);
  });
}

test('shadowed length cannot hide oversized bytes and custom iteration is never used', () => {
  const large = new Uint8Array(1024);
  Object.defineProperty(large, 'length', { value: 64 });
  assert.throws(() => fixture.acceptPart(start(), ids[0], large), { code: 'INVALID_PART_BYTES' });
  const bounded = fixture.partBytes(ids[0]);
  bounded[Symbol.iterator] = () => { throw new Error('Untrusted iterator must not run.'); };
  assert.equal(fixture.acceptPart(start(), ids[0], bounded).acceptedBytes, 64);
});

test('non-fixture and conflicting bytes leave stored bytes and accepted IDs unchanged', () => {
  const handle = start();
  const bytes = fixture.partBytes(ids[0]);
  bytes[0] ^= 1;
  assert.throws(() => fixture.acceptPart(handle, ids[0], bytes), { code: 'NON_SYNTHETIC_BYTES' });
  const accepted = fixture.partBytes(ids[0]);
  fixture.acceptPart(handle, ids[0], accepted);
  accepted.fill(99);
  assert.throws(() => fixture.acceptPart(handle, ids[0], bytes), { code: 'CONFLICTING_PART' });
  const duplicate = fixture.acceptPart(handle, ids[0], fixture.partBytes(ids[0]));
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.acceptedBytes, 64);
  assert.deepEqual(duplicate.acceptedPartIds, [ids[0]]);
  assert.throws(() => duplicate.arrivalOrder.push('forged'), TypeError);
});

test('unknown, cloned and cross-session handles cannot inherit or forge acceptance', async () => {
  const handle = start();
  all(handle);
  const second = start();
  assert.equal(view(second).acceptedBytes, 0);
  for (const invalid of [null, {}, JSON.parse(JSON.stringify(handle)), 'C024-memory']) {
    assert.throws(() => view(invalid), { code: 'UNKNOWN_UPLOAD' });
    assert.throws(() => fixture.acceptPart(invalid, ids[0], fixture.partBytes(ids[0])), { code: 'UNKNOWN_UPLOAD' });
    assert.throws(() => fixture.pauseUpload(invalid), { code: 'UNKNOWN_UPLOAD' });
    assert.throws(() => fixture.resumeUpload(invalid), { code: 'UNKNOWN_UPLOAD' });
    await assert.rejects(fixture.completeUpload(invalid, request()), { code: 'UNKNOWN_UPLOAD' });
    assert.throws(() => fixture.readCompletedBytes(invalid), { code: 'UNKNOWN_UPLOAD' });
  }
});

test('pause blocks new acceptance and completion; resume preserves exact known memory observations', async () => {
  const handle = start();
  fixture.acceptPart(handle, ids[2], fixture.partBytes(ids[2]));
  fixture.pauseUpload(handle);
  assert.throws(() => fixture.acceptPart(handle, ids[0], fixture.partBytes(ids[0])), { code: 'UPLOAD_PAUSED' });
  await assert.rejects(fixture.completeUpload(handle, request()), { code: 'UPLOAD_PAUSED' });
  assert.throws(() => fixture.pauseUpload(handle), { code: 'UPLOAD_PAUSED' });
  const resumed = fixture.resumeUpload(handle);
  assert.deepEqual(resumed.lastResume, {
    acceptedPartIds: [ids[2]], missingPartIds: [ids[0], ids[1], ids[3]],
    acceptedBytes: 64, resumeCount: 1, scope: 'same-memory-object-only'
  });
  assert.throws(() => fixture.resumeUpload(handle), { code: 'NOT_PAUSED' });
  fixture.pauseUpload(handle);
  assert.equal(fixture.resumeUpload(handle).resumeCount, 2);
});

const sparse = new Array(4);
const getterOrder = [...ids];
Object.defineProperty(getterOrder, 0, { enumerable: true, get() { throw new Error('Getter must not run.'); } });
const extraOrder = Object.assign([...ids], { extra: 'forged' });
for (const [label, value, code] of [
  ['not an array', ids.join(','), 'INVALID_COMPLETION_ORDER'],
  ['five IDs', [...ids, ids[0]], 'INVALID_COMPLETION_ORDER'],
  ['missing ID', ids.slice(0, 3), 'MISSING_COMPLETION_IDS'],
  ['empty IDs', [], 'MISSING_COMPLETION_IDS'],
  ['duplicate ID', [ids[0], ids[0], ids[2], ids[3]], 'DUPLICATE_PART_ID'],
  ['unknown ID', [ids[0], ids[1], ids[2], 'part-999'], 'UNKNOWN_PART_ID'],
  ['empty hidden token', [ids[0], ids[1], '', ids[3]], 'UNKNOWN_PART_ID'],
  ['arrival order', [...ids].reverse(), 'PART_ORDER_MISMATCH'],
  ['sparse IDs', sparse, 'INVALID_COMPLETION_ORDER'],
  ['getter ID', getterOrder, 'INVALID_COMPLETION_ORDER'],
  ['extra ID metadata', extraOrder, 'INVALID_COMPLETION_ORDER']
]) {
  test(`completion rejects ${label} with all real parts still accepted`, async () => {
    const handle = start();
    all(handle);
    await assert.rejects(fixture.completeUpload(handle, request(value)), { code });
    assert.equal(view(handle).status, 'active');
    assert.equal(view(handle).receipt, null);
    assert.equal(view(handle).acceptedBytes, 256);
    assert.throws(() => fixture.readCompletedBytes(handle), { code: 'NOT_COMPLETE' });
  });
}

test('completion accepts only exact own request fields and never invokes overrides/getters', async () => {
  const handle = start();
  all(handle);
  for (const value of [undefined, null, [], {}, { ...request(), stamp: 'cloud' },
    { partIds: ids, get expectedSha256() { throw new Error('Getter must not run.'); } }]) {
    await assert.rejects(fixture.completeUpload(handle, value), { code: 'INVALID_COMPLETION_REQUEST' });
  }
});

for (const value of [undefined, '', hash.toUpperCase(), ` ${hash}`, hash.slice(0, 63), 123, null]) {
  test(`completion rejects malformed expected hash ${JSON.stringify(value)}`, async () => {
    const handle = start();
    all(handle);
    await assert.rejects(fixture.completeUpload(handle, { partIds: ids, expectedSha256: value }), { code: 'INVALID_HASH' });
    assert.equal(view(handle).receipt, null);
  });
}

test('wrong expected hash fails after real digest and may retry without losing accepted parts', async () => {
  const handle = start();
  all(handle);
  await assert.rejects(fixture.completeUpload(handle, request(ids, '0'.repeat(64))), { code: 'HASH_MISMATCH' });
  assert.deepEqual(view(handle).lastFailure, { code: 'HASH_MISMATCH', completed: false });
  assert.equal(view(handle).status, 'active');
  assert.equal(view(handle).acceptedBytes, 256);
  assert.throws(() => fixture.readCompletedBytes(handle), { code: 'NOT_COMPLETE' });
  const receipt = await fixture.completeUpload(handle, request());
  assert.equal(receipt.actualSha256, hash);
  assert.equal(view(handle).lastFailure, null);
});

async function withDigest(replacement, action) {
  const subtle = globalThis.crypto.subtle;
  const original = Object.getOwnPropertyDescriptor(subtle, 'digest');
  Object.defineProperty(subtle, 'digest', { value: replacement, configurable: true });
  try { await action(); } finally {
    if (original) Object.defineProperty(subtle, 'digest', original);
    else delete subtle.digest;
  }
}

for (const [label, replacement, code] of [
  ['unavailable', undefined, 'DIGEST_UNAVAILABLE'],
  ['rejected promise', async () => { throw new Error('Controlled local digest failure.'); }, 'DIGEST_FAILED'],
  ['invalid digest length', async () => new ArrayBuffer(31), 'DIGEST_FAILED'],
  ['wrong computed content hash', async () => new ArrayBuffer(32), 'CONTENT_HASH_MISMATCH']
]) {
  test(`real digest ${label} remains incomplete with no fabricated success fallback`, async () => {
    const handle = start();
    all(handle);
    await withDigest(replacement, async () => {
      await assert.rejects(fixture.completeUpload(handle, request()), { code });
    });
    assert.equal(view(handle).status, 'active');
    assert.equal(view(handle).receipt, null);
    assert.equal(view(handle).acceptedBytes, 256);
    assert.throws(() => fixture.readCompletedBytes(handle), { code: 'NOT_COMPLETE' });
    assert.equal((await fixture.completeUpload(handle, request())).actualSha256, hash);
  });
}

test('hashing locks mutable operations and snapshots explicit order before awaiting real digest', async () => {
  const handle = start();
  all(handle);
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const subtle = globalThis.crypto.subtle;
  const realDigest = subtle.digest.bind(subtle);
  await withDigest(async (...arguments_) => { await barrier; return realDigest(...arguments_); }, async () => {
    const order = [...ids];
    const pending = fixture.completeUpload(handle, request(order));
    order.reverse();
    assert.equal(view(handle).status, 'hashing');
    assert.throws(() => fixture.acceptPart(handle, ids[0], fixture.partBytes(ids[0])), { code: 'UPLOAD_BUSY' });
    assert.throws(() => fixture.pauseUpload(handle), { code: 'UPLOAD_BUSY' });
    await assert.rejects(fixture.completeUpload(handle, request()), { code: 'UPLOAD_BUSY' });
    release();
    const receipt = await pending;
    assert.deepEqual(receipt.orderedPartIds, ids);
  });
});

function permutations(values) {
  return values.length ? values.flatMap((id, index) =>
    permutations(values.filter((_, position) => position !== index)).map((tail) => [id, ...tail])) : [[]];
}
for (const order of permutations(ids)) {
  test(`all arrival permutations produce actual canonical bytes: ${order.join(' ')}`, async () => {
    const handle = start();
    for (const id of order) fixture.acceptPart(handle, id, fixture.partBytes(id));
    const receipt = await fixture.completeUpload(handle, request());
    const bytes = fixture.readCompletedBytes(handle);
    assert.deepEqual(bytes, Uint8Array.from({ length: 256 }, (_, index) => (index * 37 + 11) % 256));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), receipt.actualSha256);
    assert.equal(receipt.actualSha256, hash);
    assert.deepEqual(receipt.orderedPartIds, ids);
    assert.deepEqual(view(handle).arrivalOrder, order);
  });
}

test('completed receipt is immutable, read bytes are isolated copies and terminal writes fail', async () => {
  const handle = start();
  all(handle);
  const receipt = await fixture.completeUpload(handle, request());
  const copy = fixture.readCompletedBytes(handle);
  copy.fill(0);
  assert.notDeepEqual(fixture.readCompletedBytes(handle), copy);
  assert.throws(() => { receipt.actualSha256 = 'forged'; }, TypeError);
  assert.throws(() => receipt.orderedPartIds.reverse(), TypeError);
  assert.throws(() => fixture.acceptPart(handle, ids[0], fixture.partBytes(ids[0])), { code: 'UPLOAD_COMPLETE' });
  assert.throws(() => fixture.pauseUpload(handle), { code: 'UPLOAD_COMPLETE' });
  await assert.rejects(fixture.completeUpload(handle, request()), { code: 'UPLOAD_COMPLETE' });
  assert.equal(view(handle).receipt, receipt);
  assert.equal(createHash('sha256').update(fixture.readCompletedBytes(handle)).digest('hex'), hash);
});
