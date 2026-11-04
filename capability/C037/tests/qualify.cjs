'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { hash, normalize, readRegular, checkImports } = require('..\\pins.cjs');
const repository = path.resolve(__dirname, '..', '..', '..');
function git(args, input) {
  return execFileSync('git', ['--no-pager', ...args], { cwd: repository, input,
    encoding: null, windowsHide: true, timeout: 30000, maxBuffer: 16777216, stdio: ['pipe', 'pipe', 'pipe'] });
}
function qualify(commit, tag) {
  assert.match(commit, /^[0-9a-f]{40}$/);
  assert.equal(tag, `kanban/C037/${commit.slice(0, 12)}`);
  assert.equal(git(['cat-file', '-t', `refs/tags/${tag}`]).toString().trim(), 'tag');
  assert.equal(git(['rev-parse', `${tag}^{}`]).toString().trim(), commit);
  const message = git(['log', '-1', '--format=%B', commit]).toString('utf8');
  assert.match(message, /^\[C037\]\[S\]/);
  assert.match(message, /Co-authored-by: Copilot <223556219\+Copilot@users\.noreply\.github\.com>/);
  const changed = git(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', commit]).toString('utf8').split('\0').filter(Boolean);
  assert.ok(changed.length > 0 && changed.every((file) => file.startsWith('capability/C037/')), 'Publication may change only the exact owned namespace.');
  const files = git(['ls-tree', '-r', '--name-only', '-z', commit, '--', 'capability/C037']).toString('utf8').split('\0').filter(Boolean);
  const batch = git(['cat-file', '--batch'], files.map((file) => `${commit}:${file}`).join('\n') + '\n');
  let offset = 0;
  const qualified = files.map((file) => {
    const end = batch.indexOf(10, offset);
    const match = /^[0-9a-f]{40} blob (\d+)$/.exec(batch.subarray(offset, end).toString('ascii'));
    assert.ok(end >= offset && match);
    const length = Number(match[1]);
    const blob = batch.subarray(end + 1, end + 1 + length);
    offset = end + length + 2;
    assert.equal(batch[offset - 1], 10);
    const raw = readRegular(file.replaceAll('/', '\\'), 16777216);
    const equal = raw.equals(blob);
    if (file.includes('/evidence/')) assert.equal(equal, true, 'Retained evidence bytes must be Git-exact, never text-normalized.');
    else assert.ok(equal || normalize(raw).equals(blob), 'Current source must equal published raw or explicitly LF-equivalent canonical bytes.');
    return { path: file.replaceAll('/', '\\'), rawSha256: hash(raw), gitCanonicalSha256: hash(blob),
      rawEqualsGit: equal, crlfToLfSha256: hash(normalize(raw)), currentPublishedBytesQualified: true };
  });
  assert.equal(offset, batch.length);
  const refs = git(['ls-remote', 'origin', 'refs/heads/main', `refs/tags/${tag}`, `refs/tags/${tag}^{}`]).toString('utf8').trim().split(/\r?\n/);
  const remoteMain = refs.find((line) => line.endsWith('\trefs/heads/main'))?.split(/\s+/)[0];
  const remoteAnnotatedTagObject = refs.find((line) => line.endsWith(`\trefs/tags/${tag}`))?.split(/\s+/)[0];
  const peeled = refs.find((line) => line.endsWith(`\trefs/tags/${tag}^{}`))?.split(/\s+/)[0];
  const localAnnotatedTagObject = git(['rev-parse', `refs/tags/${tag}`]).toString().trim();
  assert.match(remoteMain, /^[0-9a-f]{40}$/);
  assert.equal(remoteAnnotatedTagObject, localAnnotatedTagObject);
  assert.notEqual(remoteAnnotatedTagObject, commit);
  assert.equal(peeled, commit);
  git(['merge-base', '--is-ancestor', commit, remoteMain]);
  const dependencies = checkImports();
  return {
    cardId: 'C037', commit, tag, remoteMain, remotePeeledTag: peeled, remoteVerified: true,
    localAnnotatedTagObject, remoteAnnotatedTagObject,
    currentHead: git(['rev-parse', 'HEAD']).toString().trim(), publishedChangedPaths: changed.length,
    publishedOwnedFileCount: qualified.length, currentPublishedFileCount: qualified.length,
    currentRawGitDifferences: qualified.filter((entry) => !entry.rawEqualsGit).length,
    sourceAndEvidenceQualified: true, evidenceRawByteSubstitutions: 0,
    independentlyPinnedDependenciesVerified: dependencies.length, files: qualified,
    publicationPerformedByQualifier: false, stateMutexAcquired: false
  };
}
module.exports = Object.freeze({ qualify });
if (require.main === module) {
  if (process.argv.length !== 4) throw new Error('Exactly one already-published C037 commit and annotated tag required.');
  console.log(JSON.stringify(qualify(process.argv[2], process.argv[3])));
}
