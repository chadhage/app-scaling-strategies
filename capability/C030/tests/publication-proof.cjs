'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const [commit, tag, ...extra] = process.argv.slice(2);
assert.equal(extra.length, 0);
assert.match(commit, /^[0-9a-f]{40}$/);
assert.equal(tag, `kanban/C030/${commit.slice(0, 12)}`);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function git(args, options = {}) {
  return execFileSync('git', ['--no-pager', ...args], { cwd: repository, timeout: 30000,
    windowsHide: true, maxBuffer: 32 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...options });
}
const changed = git(['diff-tree', '--no-commit-id', '--name-only', '-r', commit]).toString('utf8').trim().split('\n');
assert.ok(changed.length > 0 && changed.every((file) => file.startsWith('capability/C030/')));
const paths = git(['ls-tree', '-r', '--name-only', commit, '--', 'capability\\C030']).toString('utf8').trim().split('\n');
const batch = git(['cat-file', '--batch'], { input: paths.map((file) => `${commit}:${file}`).join('\n') + '\n' });
let offset = 0;
const ownRawCanonicalBytes = paths.map((file) => {
  const end = batch.indexOf(10, offset);
  const match = end >= offset && /^[0-9a-f]{40} blob (\d+)$/.exec(batch.subarray(offset, end).toString('ascii'));
  assert.ok(match);
  const length = Number(match[1]);
  const blob = batch.subarray(end + 1, end + 1 + length);
  offset = end + length + 2;
  assert.equal(batch[offset - 1], 10);
  assert.equal(blob.length, length);
  const actual = path.join(repository, file.replaceAll('/', '\\'));
  assert.equal(fs.realpathSync(actual), actual);
  assert.equal(fs.lstatSync(actual).nlink, 1);
  const raw = fs.readFileSync(actual);
  assert.deepEqual(raw, blob, `Actual own working raw must equal published Git canonical bytes: ${file}`);
  return { path: file.replaceAll('/', '\\'), rawWorkingSha256: hash(raw), publishedGitCanonicalSha256: hash(blob), exactRawEqualsCanonical: true };
});
assert.equal(offset, batch.length);
assert.equal(git(['cat-file', '-t', tag]).toString('utf8').trim(), 'tag');
assert.equal(git(['rev-parse', `${tag}^{}`]).toString('utf8').trim(), commit);
const body = git(['show', '-s', '--format=%B', commit]).toString('utf8');
assert.match(body, /^\[C030\]\[D\]/);
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
// This verifier runs under Publisher: deliberately no state reader, preflight or browser call.
const exactSourceFiles = require('..\\source.cjs').checkImports();
const seal = JSON.parse(fs.readFileSync(path.join(root, 'evidence-index.json'), 'utf8'));
const detector = require('..\\detector.js');
console.log(JSON.stringify({
  commit, tag, remoteMain, remoteTagObject, remotePeeledTag, annotatedTag: true, remoteAncestryVerified: true,
  ownedOnlyCommit: true, changedPaths: changed, ownRawCanonicalBytes, publishedCanonicalFiles: paths.length,
  exactSourceFiles, proofCounts: seal.proofCounts, sealedEvidenceFiles: seal.files.length,
  sourceEffectCounts: detector.sourceIds.map((id) => {
    const observed = detector.inspectSource(id);
    assert.equal(observed.valid, true);
    return { id, decision: observed.decision, counts: observed.counts, currentCounts: observed.currentCounts };
  }),
  stateAcquiredUnderPublisher: false, mathematicalControlsAreNotActualBusinessReceipts: true,
  nativeAndProductionNode24Incomplete: true, parentAcceptanceRequired: true, extraCredits: 0
}));
