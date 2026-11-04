'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const source = require('..\\source.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const [commit, tag, ...extra] = process.argv.slice(2);
assert.equal(extra.length, 0);
assert.match(commit, /^[0-9a-f]{40}$/);
assert.equal(tag, `kanban/C029/${commit.slice(0, 12)}`);
function git(args, options = {}) {
  return execFileSync('git', ['--no-pager', ...args], {
    cwd: repository, timeout: 15000, maxBuffer: 8 * 1024 * 1024,
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], ...options
  });
}
const changed = git(['diff-tree', '--no-commit-id', '--name-only', '-r', commit]).toString('utf8').trim().split('\n');
assert.ok(changed.length > 0);
assert.ok(changed.every((file) => file.startsWith('capability/C029/')), 'No foreign commit paths permitted.');
const paths = git(['ls-tree', '-r', '--name-only', commit, '--', 'capability\\C029']).toString('utf8').trim().split('\n');
const input = paths.map((file) => `${commit}:${file}`).join('\n') + '\n';
const batch = git(['cat-file', '--batch'], { input });
let offset = 0;
const ownRawCanonicalBytes = paths.map((file) => {
  const end = batch.indexOf(10, offset);
  const match = /^[0-9a-f]{40} blob (\d+)$/.exec(batch.subarray(offset, end).toString('ascii'));
  assert.ok(match && end >= offset);
  const length = Number(match[1]);
  const blob = batch.subarray(end + 1, end + 1 + length);
  offset = end + length + 2;
  assert.equal(batch[offset - 1], 10);
  assert.equal(blob.length, length);
  const raw = source.readFile(file.replaceAll('/', '\\'), 8 * 1024 * 1024);
  assert.deepEqual(raw, blob, `Own actual working raw bytes must equal published canonical bytes: ${file}`);
  return {
    path: file.replaceAll('/', '\\'), rawSha256: source.hash(raw), publishedGitSha256: source.hash(blob),
    rawEqualsGit: true,
    crlfToLfTextSha256: /\.(?:md|js|cjs|json|css|html|ps1|feature)$/.test(file) ? source.hash(source.normalize(raw)) : null
  };
});
assert.equal(offset, batch.length);
assert.equal(git(['cat-file', '-t', tag]).toString('utf8').trim(), 'tag');
assert.equal(git(['rev-parse', `${tag}^{}`]).toString('utf8').trim(), commit);
const body = git(['show', '-s', '--format=%B', commit]).toString('utf8');
assert.match(body, /^\[C029\]\[D\]/);
assert.match(body, /Co-authored-by: Copilot <223556219\+Copilot@users\.noreply\.github\.com>/);
const refs = git(['ls-remote', 'origin', 'refs/heads/main', `refs/tags/${tag}`, `refs/tags/${tag}^{}`])
  .toString('utf8').trim().split('\n').map((line) => line.split(/\s+/));
const remoteMain = refs.find((entry) => entry[1] === 'refs/heads/main')?.[0];
const remoteTagObject = refs.find((entry) => entry[1] === `refs/tags/${tag}`)?.[0];
const remotePeeledTag = refs.find((entry) => entry[1] === `refs/tags/${tag}^{}`)?.[0];
assert.match(remoteMain, /^[0-9a-f]{40}$/);
assert.match(remoteTagObject, /^[0-9a-f]{40}$/);
assert.equal(remotePeeledTag, commit);
git(['merge-base', '--is-ancestor', commit, remoteMain]);
const seal = JSON.parse(fs.readFileSync(path.join(root, 'evidence-index.json'), 'utf8'));
const historical = source.checkHistorical();
console.log(JSON.stringify({
  commit, tag, remoteMain, remoteTagObject, remotePeeledTag, annotatedTag: true, remoteAncestryVerified: true,
  ownedOnlyCommit: true, changedPaths: changed, ownRawCanonicalBytes,
  proofCounts: seal.proofCounts, sealedFiles: seal.files.length,
  exactSourceFiles: historical.imports.length,
  historicalRawCanonicalSources: historical.imports,
  publicationCurrentAuthorizationSeparateFromHistoricalProof: true
}));
