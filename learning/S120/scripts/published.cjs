'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { sha256, sources } = require('./evidence.cjs');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const revision = process.argv[2];
assert.equal(process.argv.length, 3, 'provide one exact implementation SHA; never use moving HEAD');
assert.match(revision || '', /^[0-9a-f]{40}$/);
function git(args, input) {
  const result = spawnSync('git', args, { cwd: repo, input, encoding: null, timeout: 15000 });
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
}
const changed = git(['diff-tree', '--no-commit-id', '--name-only', '-r', revision]).toString().trim().split(/\r?\n/);
assert.ok(changed.length && changed.every((file) => file.startsWith('learning/S120/')), 'implementation commit must change only owned paths');
const message = git(['show', '-s', '--format=%B', revision]).toString();
assert.match(message, /^\[A-S120\]\[S\]/);
assert.match(message, /Co-authored-by: Copilot <223556219\+Copilot@users\.noreply\.github\.com>/);
const entries = [];
for (const source of sources()) {
  const gitPath = `learning/S120/${source.path.split(path.sep).join('/')}`;
  const canonical = git(['show', `${revision}:${gitPath}`]);
  const canonicalBlob = git(['hash-object', `--path=${gitPath}`, '--stdin'], Buffer.from(source.base64, 'base64')).toString().trim();
  const publishedBlob = git(['rev-parse', `${revision}:${gitPath}`]).toString().trim();
  assert.equal(canonicalBlob, publishedBlob, `${gitPath}: canonical Git blob mismatch`);
  entries.push({ path: source.path, rawSha256: source.sha256, canonicalGitSha256: sha256(canonical), canonicalGitBlob: publishedBlob });
}
const evidenceFiles = git(['ls-tree', '-r', '--name-only', revision, '--', 'learning/S120/evidence']).toString().trim().split(/\r?\n/);
for (const file of evidenceFiles) {
  const working = fs.readFileSync(path.join(repo, ...file.split('/')));
  assert.deepEqual(git(['show', `${revision}:${file}`]), working, `${file}: historical raw evidence was normalized or changed`);
}
console.log(JSON.stringify({ cardId: 'A-S120', revision, scopeVerified: true, canonicalSourceCount: entries.length, rawEvidenceCount: evidenceFiles.length, entries }, null, 2));
