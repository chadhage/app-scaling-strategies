'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { hash, readRegular } = require('../sources.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
assert.equal(process.argv.length, 3);
const commit = process.argv[2];
assert.match(commit, /^[0-9a-f]{40}$/);
const git = (args, input) => execFileSync('git', ['--no-pager', ...args], {
  cwd: repository, input, encoding: null, windowsHide: true,
  timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe']
});
const text = (args) => git(args).toString('utf8').trim();
const tag = `kanban/C038/${commit.slice(0, 12)}`;
assert.equal(text(['cat-file', '-t', `refs/tags/${tag}`]), 'tag');
assert.equal(text(['rev-parse', `refs/tags/${tag}^{}`]), commit);
const message = text(['show', '-s', '--format=%B', commit]);
assert.match(message, /^\[C038\]\[S\]/);
assert.match(message, /Co-authored-by: Copilot <223556219\+Copilot@users\.noreply\.github\.com>/);
const changed = text(['diff-tree', '--no-commit-id', '--name-only', '-r', commit]).split('\n').filter(Boolean);
assert.ok(changed.length > 0 && changed.every((file) => file.startsWith('capability/C038/')));
const remote = new Map(text(['ls-remote', 'origin', 'refs/heads/main', `refs/tags/${tag}`, `refs/tags/${tag}^{}`])
  .split('\n').map((line) => { const [oid, name] = line.split(/\s+/); return [name, oid]; }));
assert.equal(remote.get(`refs/tags/${tag}^{}`), commit);
assert.equal(remote.get(`refs/tags/${tag}`), text(['rev-parse', `refs/tags/${tag}`]));
assert.match(remote.get('refs/heads/main') || '', /^[0-9a-f]{40}$/);
git(['merge-base', '--is-ancestor', commit, remote.get('refs/heads/main')]);
const tree = git(['ls-tree', '-r', '-z', '--full-tree', commit, '--', path.join('capability', 'C038')])
  .toString('utf8').split('\0').filter(Boolean).map((line) => {
    const match = /^(100644) blob ([0-9a-f]{40})\t(capability\/C038\/[\s\S]+)$/.exec(line);
    assert.ok(match, line);
    return { oid: match[2], gitPath: match[3] };
  });
assert.ok(tree.length > 0);
const blobs = git(['cat-file', '--batch'], tree.map((entry) => entry.oid).join('\n') + '\n');
let offset = 0;
const files = tree.map((entry) => {
  const end = blobs.indexOf(10, offset);
  const header = /^([0-9a-f]{40}) blob (\d+)$/.exec(blobs.subarray(offset, end).toString('ascii'));
  assert.ok(header);
  assert.equal(header[1], entry.oid);
  const size = Number(header[2]);
  const canonical = blobs.subarray(end + 1, end + 1 + size);
  offset = end + size + 2;
  assert.equal(canonical.length, size);
  assert.equal(blobs[offset - 1], 10);
  const relative = entry.gitPath.replaceAll('/', path.sep);
  const raw = readRegular(relative, 32 * 1024 * 1024);
  const cleanObjectId = git(['hash-object', `--path=${relative}`, '--stdin'], raw).toString('ascii').trim();
  assert.equal(cleanObjectId, entry.oid, relative);
  return { path: relative, rawWorkingSha256: hash(raw), actualGitCanonicalSha256: hash(canonical),
    actualGitBlobOid: entry.oid, independentlyMeasuredCleanObjectId: cleanObjectId,
    rawEqualsGitCanonical: raw.equals(canonical) };
});
assert.equal(offset, blobs.length);
const actualHead = text(['rev-parse', 'HEAD']);
const proof = {
  cardId: 'C038', workerId: 'worker-C038', commit, tag,
  localAnnotatedTagObject: text(['rev-parse', `refs/tags/${tag}`]),
  remoteAnnotatedTagObject: remote.get(`refs/tags/${tag}`),
  actualRemotePeeledTag: remote.get(`refs/tags/${tag}^{}`),
  actualRemoteMain: remote.get('refs/heads/main'), actualHead,
  actualCommitIsRemoteAncestor: true, actualHeadEqualsRemote: actualHead === remote.get('refs/heads/main'),
  commitChangedOnlyOwnedPaths: true, changedFiles: changed.length,
  committedOwnedFiles: files.length, rawWorkingAndActualGitCanonicalMeasuredIndependently: true,
  rawEqualsCanonicalFiles: files.filter((entry) => entry.rawEqualsGitCanonical).length,
  nativeFlags: require('../readiness.js').flags,
  observedAtUtc: new Date().toISOString(), files
};
if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
  const directory = path.resolve(process.env.C038_CAPTURE_DIR || '');
  assert.equal(path.dirname(directory), path.join(root, 'evidence', 'raw'));
  assert.match(path.basename(directory), /^publication-[0-9a-f-]{36}$/);
  assert.equal(fs.realpathSync(directory), directory);
  assert.equal(actualHead, commit, 'Under Publisher the actual implementation must be the actual HEAD.');
  assert.equal(proof.actualHeadEqualsRemote, true);
  fs.writeFileSync(path.join(directory, 'published-proof.json'), `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
}
console.log(JSON.stringify({ cardId: proof.cardId, commit, tag, remotePeeledTag: proof.actualRemotePeeledTag,
  remoteMain: proof.actualRemoteMain, actualHead, annotated: true, ancestryVerified: true,
  committedOwnedFiles: files.length, rawEqualsCanonicalFiles: proof.rawEqualsCanonicalFiles,
  rawWorkingAndActualGitCanonicalMeasuredIndependently: true, commitChangedOnlyOwnedPaths: true }));
