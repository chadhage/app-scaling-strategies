'use strict';

// U006 import pins (test tooling): the U005 and U004 files that U006 consumes read-only are pinned in imports.json by raw, LF and
// git-blob SHA-256 together with the accepted commit and tag; everything is recomputed here against the files and against git
// (object reads only: never the index, HEAD or the working tree of git).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const lifecycleRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(lifecycleRoot, '..', '..', '..');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const crlfToLf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');

function git(args) {
  const env = { ...process.env };
  for (const name of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) delete env[name];
  return spawnSync('git', ['-C', repoRoot, ...args], { env, maxBuffer: 64 * 1024 * 1024, windowsHide: true, timeout: 60000 });
}

function readImports(file = path.join(lifecycleRoot, 'imports.json')) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Problems found: files that changed, bytes that differ from the published commit, tags that do not resolve to their commit.
function verifyImports(imports, { root = repoRoot, checkGit = true } = {}) {
  const problems = [];
  if (imports.schema !== 'U006-source-pins/1') problems.push('unknown schema');
  for (const file of imports.files) {
    let bytes = null;
    try {
      bytes = fs.readFileSync(path.join(root, file.path));
    } catch {
      problems.push(`${file.path}: missing`);
    }
    if (bytes) {
      if (sha256(bytes) !== file.rawSha256) problems.push(`${file.path}: raw bytes changed`);
      if (sha256(crlfToLf(bytes)) !== file.crlfToLfSha256) problems.push(`${file.path}: LF bytes changed`);
    }
    if (file.crlfToLfSha256 !== file.acceptedGitSha256) problems.push(`${file.path}: LF pin differs from the git pin`);
    if (checkGit) {
      const accepted = imports.accepted[file.card];
      const blob = git(['cat-file', 'blob', `${accepted.commit}:${file.path.replace(/\\/g, '/')}`]);
      if (blob.status !== 0) problems.push(`${file.path}: not in commit ${accepted.commit}`);
      else if (sha256(blob.stdout) !== file.acceptedGitSha256) problems.push(`${file.path}: the published blob differs from the pin`);
    }
  }
  if (checkGit) {
    for (const [card, accepted] of Object.entries(imports.accepted)) {
      const tag = git(['rev-parse', `${accepted.tag}^{commit}`]);
      if (tag.status !== 0 || tag.stdout.toString().trim() !== accepted.commit) problems.push(`${card}: tag ${accepted.tag} does not resolve to ${accepted.commit}`);
    }
  }
  return problems;
}

module.exports = { lifecycleRoot, repoRoot, sha256, crlfToLf, git, readImports, verifyImports };
