(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../C020/contract.js'));
  } else {
    Object.defineProperty(root, 'C024Upload', { value: factory(root.C020Contract) });
  }
}(globalThis, function (source) {
  'use strict';
  if (source?.apiContract !== 'getProfile/1' || source.stamps?.v2?.dataKind !== 'synthetic') {
    throw new Error('The unchanged accepted C020 synthetic contract is required.');
  }
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  class FixtureError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'FixtureError';
      this.code = code;
    }
  }
  function reject(code, message) { throw new FixtureError(code, message); }
  const fixtureBytes = Uint8Array.from({ length: 256 }, (_, index) => (index * 37 + 11) % 256);
  const partIds = ['part-001', 'part-002', 'part-003', 'part-004'];
  const manifest = freeze({
    apiContract: 'C024-synthetic-multipart/1',
    fixtureId: 'C024-synthetic-001-r1',
    fixtureRevision: 'C024-r1',
    fixtureVersion: '1.0.0',
    tier: 'multipart-upload',
    deploymentStamp: 'C024-memory-r1',
    deploymentKind: 'local-fixture-label-not-cloud',
    dataKind: 'synthetic',
    storage: 'in-memory-only',
    profileId: source.profiles[0].id,
    source: { apiContract: source.apiContract, profile: source.profiles[0], stamp: source.stamps.v2 },
    byteFormula: '(index * 37 + 11) % 256; index = 0..255',
    byteCount: fixtureBytes.length,
    partIds,
    parts: partIds.map((id, index) => ({ id, offset: index * 64, byteCount: 64 })),
    expectedSha256: '3ef33734daae0e353f132ff5f3241d8f86ba81f851c0b9685149f079c16eb45b'
  });
  const sessions = new WeakMap();
  const typedLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'length').get;

  function fields(request, names, code) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      reject(code, 'Only the documented own data fields are accepted.');
    }
    const prototype = Object.getPrototypeOf(request);
    const descriptors = Object.getOwnPropertyDescriptors(request);
    if ((prototype !== Object.prototype && prototype !== null)
        || Reflect.ownKeys(descriptors).length !== names.length
        || names.some((name) => !descriptors[name]?.enumerable
          || !Object.hasOwn(descriptors[name], 'value'))) {
      reject(code, 'Extra fields, getters and inherited configuration are forbidden.');
    }
    return Object.fromEntries(names.map((name) => [name, descriptors[name].value]));
  }
  function stateFor(handle) {
    const state = handle && typeof handle === 'object' ? sessions.get(handle) : null;
    if (!state) reject('UNKNOWN_UPLOAD', 'Start this named fixture; a forged or discarded handle is not an upload.');
    return state;
  }
  function active(state) {
    if (state.status === 'paused') reject('UPLOAD_PAUSED', 'Resume the same retained memory object first.');
    if (state.status === 'hashing') reject('UPLOAD_BUSY', 'Final hashing is in progress.');
    if (state.status === 'complete') reject('UPLOAD_COMPLETE', 'This fixture is complete; reset to start another.');
  }
  function partFor(id) {
    const part = manifest.parts.find((candidate) => candidate.id === id);
    if (!part) reject('UNKNOWN_PART_ID', 'Only explicit part-001 through part-004 IDs belong to this fixture.');
    return part;
  }
  function createUpload(request) {
    const { fixtureId } = fields(request, ['fixtureId'], 'INVALID_START_REQUEST');
    if (fixtureId !== manifest.fixtureId) reject('UNKNOWN_FIXTURE', 'Only the explicitly named bounded synthetic fixture may start.');
    const handle = Object.freeze({ fixtureId });
    sessions.set(handle, {
      status: 'active', parts: new Map(), arrivalOrder: [], resumeCount: 0,
      lastResume: null, lastFailure: null, receipt: null, completedBytes: null
    });
    return handle;
  }
  function inspectUpload(handle) {
    const state = stateFor(handle);
    return freeze({
      fixtureId: manifest.fixtureId, fixtureRevision: manifest.fixtureRevision,
      dataKind: manifest.dataKind, storage: manifest.storage, status: state.status,
      acceptedPartIds: partIds.filter((id) => state.parts.has(id)),
      missingPartIds: partIds.filter((id) => !state.parts.has(id)),
      arrivalOrder: [...state.arrivalOrder],
      acceptedBytes: [...state.parts.values()].reduce((total, bytes) => total + bytes.length, 0),
      resumeCount: state.resumeCount, resumeScope: 'same-memory-object-only',
      lastResume: state.lastResume, lastFailure: state.lastFailure, receipt: state.receipt
    });
  }
  function partBytes(id) {
    const part = partFor(id);
    return fixtureBytes.slice(part.offset, part.offset + part.byteCount);
  }
  function acceptPart(handle, id, bytes) {
    const state = stateFor(handle);
    active(state);
    const part = partFor(id);
    let length;
    try { length = typedLength.call(bytes); } catch { length = -1; }
    if (Object.getPrototypeOf(bytes || {}) !== Uint8Array.prototype || length !== part.byteCount) {
      reject('INVALID_PART_BYTES', 'A part must be exactly 64 bounded synthetic Uint8Array bytes.');
    }
    const copy = new Uint8Array(part.byteCount);
    for (let index = 0; index < part.byteCount; index++) copy[index] = bytes[index];
    const previous = state.parts.get(id);
    const expected = previous || partBytes(id);
    if (copy.some((value, index) => value !== expected[index])) {
      reject(previous ? 'CONFLICTING_PART' : 'NON_SYNTHETIC_BYTES',
        'Bytes differ from this immutable synthetic part; accepted bytes have not changed.');
    }
    if (!previous) {
      state.parts.set(id, copy);
      state.arrivalOrder.push(id);
    }
    return freeze({ ...inspectUpload(handle), partId: id, duplicate: Boolean(previous) });
  }
  function pauseUpload(handle) {
    const state = stateFor(handle);
    active(state);
    state.status = 'paused';
    return inspectUpload(handle);
  }
  function resumeUpload(handle) {
    const state = stateFor(handle);
    if (state.status !== 'paused') reject('NOT_PAUSED', 'Only a paused same-memory fixture can resume.');
    state.status = 'active';
    state.resumeCount++;
    state.lastResume = freeze({
      acceptedPartIds: partIds.filter((id) => state.parts.has(id)),
      missingPartIds: partIds.filter((id) => !state.parts.has(id)),
      acceptedBytes: [...state.parts.values()].reduce((total, bytes) => total + bytes.length, 0),
      resumeCount: state.resumeCount, scope: 'same-memory-object-only'
    });
    return inspectUpload(handle);
  }
  function completionOrder(value) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
        || value.length > partIds.length) {
      reject('INVALID_COMPLETION_ORDER', 'Provide at most four explicit manifest part IDs.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== value.length + 1
        || Array.from({ length: value.length }, (_, index) => descriptors[index])
          .some((field) => !field?.enumerable || !Object.hasOwn(field, 'value'))) {
      reject('INVALID_COMPLETION_ORDER', 'Sparse arrays, getters and extra fields are forbidden.');
    }
    const order = Array.from({ length: value.length }, (_, index) => descriptors[index].value);
    order.forEach(partFor);
    if (new Set(order).size !== order.length) reject('DUPLICATE_PART_ID', 'Completion cannot list a part more than once.');
    if (order.length !== partIds.length) reject('MISSING_COMPLETION_IDS', 'Completion must name every manifest part.');
    if (order.some((id, index) => id !== partIds[index])) {
      reject('PART_ORDER_MISMATCH', 'Completion order must exactly match the manifest, not arrival order.');
    }
    return order;
  }
  async function completeUpload(handle, request) {
    const state = stateFor(handle);
    active(state);
    const fields_ = fields(request, ['partIds', 'expectedSha256'], 'INVALID_COMPLETION_REQUEST');
    const order = completionOrder(fields_.partIds);
    if (typeof fields_.expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(fields_.expectedSha256)) {
      reject('INVALID_HASH', 'Expected SHA-256 must be exactly 64 lowercase hexadecimal characters.');
    }
    if (partIds.some((id) => !state.parts.has(id))) {
      reject('MISSING_PARTS', 'Some actual parts have not been accepted; no final content hash exists.');
    }
    const assembled = new Uint8Array(manifest.byteCount);
    order.forEach((id, index) => assembled.set(state.parts.get(id), index * 64));
    state.status = 'hashing';
    state.lastFailure = null;
    try {
      if (typeof globalThis.crypto?.subtle?.digest !== 'function') {
        reject('DIGEST_UNAVAILABLE', 'Real Web Crypto SHA-256 is required; no synthetic success fallback exists.');
      }
      const digest = await globalThis.crypto.subtle.digest('SHA-256', assembled);
      if (!(digest instanceof ArrayBuffer) || digest.byteLength !== 32) {
        reject('DIGEST_FAILED', 'The SHA-256 operation returned an invalid digest.');
      }
      const actualSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (actualSha256 !== manifest.expectedSha256) {
        reject('CONTENT_HASH_MISMATCH', 'The actual assembled bytes do not match the pinned immutable fixture hash.');
      }
      if (actualSha256 !== fields_.expectedSha256) {
        reject('HASH_MISMATCH', 'The requested expected hash differs from the real final SHA-256; completion failed.');
      }
      state.receipt = freeze({
        fixtureId: manifest.fixtureId, fixtureRevision: manifest.fixtureRevision,
        dataKind: manifest.dataKind, storage: manifest.storage,
        orderedPartIds: order, byteCount: assembled.length, actualSha256,
        expectedSha256: manifest.expectedSha256, resumeCount: state.resumeCount,
        source: manifest.source, verification: 'actual-local-synthetic-bytes-only'
      });
      state.completedBytes = assembled;
      state.status = 'complete';
      return state.receipt;
    } catch (error) {
      state.status = 'active';
      state.receipt = null;
      state.completedBytes = null;
      const failure = error instanceof FixtureError ? error
        : new FixtureError('DIGEST_FAILED', 'The real SHA-256 operation failed; accepted parts remain in this memory object.');
      state.lastFailure = freeze({ code: failure.code, completed: false });
      throw failure;
    }
  }
  function readCompletedBytes(handle) {
    const state = stateFor(handle);
    if (state.status !== 'complete') reject('NOT_COMPLETE', 'There is no verified completed content to read.');
    return state.completedBytes.slice();
  }
  return Object.freeze({
    manifest, createUpload, inspectUpload, partBytes, acceptPart, pauseUpload,
    resumeUpload, completeUpload, readCompletedBytes
  });
}));
