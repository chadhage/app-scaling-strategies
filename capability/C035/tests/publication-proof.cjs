'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const source = require('..\\source.cjs');
const evidence = require('./evidence.cjs');
const [commit, tag] = process.argv.slice(2);
assert.equal(process.argv.length, 4);
assert.match(commit, /^[0-9a-f]{40}$/);
assert.equal(tag, `kanban/C035/${commit.slice(0, 12)}`);
function git(...args) {
  return execFileSync('git', ['--no-pager', ...args], {
    cwd: source.repository, timeout: 60000, maxBuffer: 16 * 1024 * 1024,
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
}
const changed = git('diff-tree', '--no-commit-id', '--name-only', '-r', commit).toString('utf8').trim().split(/\r?\n/);
assert.ok(changed.length > 0);
assert.ok(changed.every((file) => file.startsWith('capability/C035/')));
const listed = git('ls-tree', '-r', '--name-only', commit, '--', 'capability\\C035').toString('utf8').trim().split(/\r?\n/);
const proofs = listed.map((file) => {
  const raw = source.readRegular(file.replaceAll('/', '\\'), 16 * 1024 * 1024);
  const canonical = git('show', `${commit}:${file}`);
  assert.ok(raw.equals(canonical), `Exact independently read owned working/Git bytes: ${file}`);
  const text = /\.(?:c?js|ps1|json|md|html|css|feature)$/.test(file) || /\/\.(?:gitattributes|gitignore)$/.test(file);
  return {
    path: file.replaceAll('/', '\\'), byteLength: raw.length,
    rawSha256: source.hash(raw), acceptedGitCanonicalSha256: source.hash(canonical),
    crlfToLfSha256: text ? source.hash(source.lf(raw)) : null, rawEqualsGitCanonical: true
  };
});
assert.equal(git('cat-file', '-t', tag).toString('utf8').trim(), 'tag');
assert.equal(git('rev-parse', `${tag}^{}`).toString('utf8').trim(), commit);
const message = git('show', '-s', '--format=%B', commit).toString('utf8');
assert.match(message, /^\[C035\]\[D\]/);
assert.match(message, /Co-authored-by: Copilot <223556219\+Copilot@users\.noreply\.github\.com>/);
const refs = git('ls-remote', 'origin', 'refs/heads/main', `refs/tags/${tag}`, `refs/tags/${tag}^{}`)
  .toString('utf8').trim().split(/\r?\n/).map((line) => line.split(/\s+/));
const remoteMain = refs.find((line) => line[1] === 'refs/heads/main')?.[0];
const peeled = refs.find((line) => line[1] === `refs/tags/${tag}^{}`)?.[0];
assert.match(remoteMain, /^[0-9a-f]{40}$/);
assert.equal(peeled, commit);
git('merge-base', '--is-ancestor', commit, remoteMain);
const proofCounts = evidence.checkIndex();
console.log(JSON.stringify({
  commit, tag, remoteMain, remotePeeledTag: peeled, remoteVerified: true, remoteAncestryVerified: true,
  annotatedTag: true, ownChangedFiles: changed.length, ownTrackedFiles: listed.length,
  independentOwnRawAndGitCanonicalProof: proofs,
  originalDependencyRawLfAndGitPins: source.imports().dependencies,
  proofCounts, actualUserMutationSuccess: false, acceptancePending: true,
  noStateReadUnderPublisher: true, sourceAndEvidenceWrites: 0
}));
