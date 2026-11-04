'use strict';

const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { root, inventory, dependencies } = require('./provenance.cjs');
const before = inventory();
const importedBefore = dependencies();
const result = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
  path.join(__dirname, 'publisher-wrapper.ps1'), '-Action', 'Inspect'],
{ encoding: 'utf8', timeout: 240000, maxBuffer: 65536, windowsHide: true });
assert.ifError(result.error);
assert.equal(result.status, 0);
const boundary = JSON.parse(result.stdout);
assert.equal(boundary.branch, 'main');
assert.equal(boundary.authority.approved, true);
assert.equal(boundary.ownedStagedFiles.length, 0);
assert.equal(boundary.ownedLocalTags.length, 0);
assert.equal(boundary.ownedRemoteTags.length, 0);
assert.deepEqual(inventory(), before);
assert.deepEqual(dependencies(), importedBefore);
process.stdout.write('C019_BOUNDARY_RECORD=' + JSON.stringify({
  schemaVersion: 1, cardId: 'C019', workerId: 'worker-C019', capturedAtUtc: new Date().toISOString(),
  ...boundary, ownFilesUnchanged: Object.keys(before).length,
  dependencyFilesUnchanged: Object.keys(importedBefore).length,
  qualifiedC019Publication: false, commit: null, tag: null, remotePeeledTag: null, remoteAncestry: null,
  publisherMutexClosed: true, sourceAndEvidenceReadOnly: true, originalUnitCredits: 0,
  scope: 'same-original-C019-publisher-metadata-only; runtime/errors/actions/old proof unchanged',
  surface: path.relative(root, path.join(root, 'index.html')),
}) + '\n');
