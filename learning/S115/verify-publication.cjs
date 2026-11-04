'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const repo = path.resolve(__dirname, '..', '..');
const revision = process.env.S115_GIT_REV;
assert.match(revision || '', /^[a-f0-9]{40}$/, 'Set S115_GIT_REV to the exact reported implementation commit; no skipped or guessed publication check');

function git(args) {
  const result = spawnSync('git', args, { cwd: repo });
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
}
const prefix = 'learning/S115/';
const indexPath = `${prefix}evidence/content-index.json`;
const index = JSON.parse(git(['show', `${revision}:${indexPath}`]).toString('utf8'));
assert.equal(index.cardId, 'A-S115');
const changed = git(['diff-tree', '--no-commit-id', '--name-only', '-r', revision])
  .toString('utf8').trim().split('\n').filter(Boolean);
assert.ok(changed.length > 0 && changed.every((name) => name.startsWith(prefix)),
  'implementation commit may change only learning/S115');
const tree = git(['ls-tree', '-r', '--name-only', revision, '--', 'learning/S115'])
  .toString('utf8').trim().split('\n').filter((name) => name && name !== indexPath).sort();
assert.deepEqual(index.files.map((file) => `${prefix}${file.path}`).sort(), tree);
for (const file of index.files) {
  const blob = git(['show', `${revision}:${prefix}${file.path}`]);
  assert.equal(blob.length, file.bytes, file.path);
  assert.equal(crypto.createHash('sha256').update(blob).digest('hex'), file.sha256, file.path);
}
console.log(JSON.stringify({
  cardId: 'A-S115', revision, passed: true, changedFiles: changed.length,
  indexedGitBlobs: index.files.length,
  rawByteFiles: index.files.filter((file) => file.mode === 'raw-bytes').length,
  canonicalLfFiles: index.files.filter((file) => file.mode === 'canonical-utf8-lf').length,
  indexBlobSha256: crypto.createHash('sha256').update(git(['show', `${revision}:${indexPath}`])).digest('hex'),
  readOnly: true, nativeProof: false,
}));
