(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../C020/contract.js'));
  } else {
    Object.defineProperty(root, 'C024Upload', { value: factory(root.C020Contract) });
  }
}(globalThis, function (source) {
  'use strict';
  const manifest = Object.freeze({ fixtureRevision: null, profileId: null, source });
  function createUpload() { return Object.freeze({}); }
  function inspectUpload() {
    return { status: 'active', acceptedPartIds: [], arrivalOrder: [], acceptedBytes: 0 };
  }
  function partBytes() { return new Uint8Array(64); }
  function acceptPart() { return inspectUpload(); }
  function pauseUpload() { return inspectUpload(); }
  function resumeUpload() { return inspectUpload(); }
  async function completeUpload() { return { actualSha256: null }; }
  function readCompletedBytes() { return new Uint8Array(); }
  return Object.freeze({
    manifest, createUpload, inspectUpload, partBytes, acceptPart, pauseUpload,
    resumeUpload, completeUpload, readCompletedBytes
  });
}));
