'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = __dirname;
const repo = path.resolve(root, '..', '..');
const commit = process.argv[2];
assert.match(commit || '', /^[0-9a-f]{40}$/, 'Supply this card exact full publication commit.');
const git = (args) => execFileSync('git', ['--no-pager', ...args], { cwd: repo });
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const committed = (relative) => git(['show', `${commit}:learning/S131/${relative}`]);
const sealBytes = committed('evidence/source-hashes.json');
assert.equal(sha(sealBytes), sha(fs.readFileSync(path.join(root, 'evidence', 'source-hashes.json'))));
const seal = JSON.parse(sealBytes);
const changes = git(['diff-tree', '--no-commit-id', '--name-only', '-r', commit]).toString().trim().split(/\r?\n/);
assert.ok(changes.length > 0 && changes.every((file) => file.startsWith('learning/S131/')), 'No unowned publication paths.');
const message = git(['log', '-1', '--format=%B', commit]).toString();
assert.match(message, /^\[A-S131\]\[S\]/);
assert.match(message, /Co-authored-by: Copilot <223556219\+Copilot@users\.noreply\.github\.com>/);
const checks = [];
for (const entry of seal.files) {
  const bytes = committed(entry.path);
  const canonical = entry.normalization === 'raw-preserved'
    ? fs.readFileSync(path.join(root, ...entry.path.split('/')))
    : Buffer.from(fs.readFileSync(path.join(root, ...entry.path.split('/'))).toString('utf8').replace(/\r\n/g, '\n'));
  assert.equal(sha(bytes), entry.canonicalSha256, `${entry.path}: canonical committed bytes`);
  assert.equal(sha(canonical), entry.canonicalSha256, `${entry.path}: separate local canonical representation`);
  assert.equal(git(['rev-parse', `${commit}:learning/S131/${entry.path}`]).toString().trim(), entry.canonicalGitBlob, `${entry.path}: Git blob`);
  checks.push({ path: entry.path, rawSha256: entry.rawSha256, committedSha256: sha(bytes), normalization: entry.normalization });
}
const rawSeal = JSON.parse(committed('evidence/raw-evidence-hashes.json'));
for (const entry of rawSeal.files) assert.equal(sha(committed(entry.path)), entry.rawSha256, `${entry.path}: raw proof preserved in Git`);
console.log(JSON.stringify({
  cardId: 'A-S131', commit, readOnly: true, scopedPaths: changes.length,
  canonicalSourceChecks: checks.length, rawEvidenceChecks: rawSeal.files.length,
  rawAndCanonicalNotConflated: true, checks, passed: true,
}, null, 2));
