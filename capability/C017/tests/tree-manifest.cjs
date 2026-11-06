'use strict';

// Test tooling, not production code: the file tree of the first fix (commit 8e7046e9, tag kanban/C017/8e7046e98131) as a manifest of SHA-256 hashes.
// The evidence archives of the first fix (green-02, verify-green-02, coverage-02, the first seven REDs) pin the live files of that day; the second
// fix legitimately changed some of them, so their pins are recomputed against this manifest, which is itself anchored to git:
//   node capability\C017\tests\tree-manifest.cjs write    writes evidence\tree-8e7046e9.json once (never overwrites)
//   node capability\C017\tests\tree-manifest.cjs check    recomputes every hash from the git objects of that commit and compares (needs git: a verification
//                                                         command, not part of the hermetic suite)
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const COMMIT = '8e7046e981311267b967ae71120d17ace350a307';
const TAG = 'kanban/C017/8e7046e98131';
const file = path.join(root, 'evidence', 'tree-8e7046e9.json');
const git = (args, encoding = 'utf8') => execFileSync('git', args, { cwd: repo, encoding, maxBuffer: 1 << 28 });
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');

function fromGit() {
  const resolved = git(['rev-parse', `${TAG}^{commit}`]).trim();
  if (resolved !== COMMIT) throw new Error(`${TAG} resolves to ${resolved}`);
  const names = git(['ls-tree', '-r', '--name-only', COMMIT, '--', 'capability/C017']).split('\n').filter(Boolean).sort();
  const files = {};
  for (const name of names) {
    const bytes = git(['show', `${COMMIT}:${name}`], 'buffer');
    files[name] = { bytes: bytes.length, sha256: sha(bytes) };
  }
  return { schema: 'C017-tree/1', commit: COMMIT, tag: TAG, note: 'SHA-256 of every file under capability/C017 in the commit of the first fix (the namespace has .gitattributes "* -text": blob bytes equal file bytes).', files };
}

if (require.main === module) {
  const mode = process.argv[2];
  if (mode === 'write') {
    fs.writeFileSync(file, `${JSON.stringify(fromGit(), null, 1)}\n`, { flag: 'wx' });
  } else if (mode === 'check') {
    const expected = fromGit();
    const committed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const problems = [];
    for (const name of new Set([...Object.keys(expected.files), ...Object.keys(committed.files)])) {
      if (JSON.stringify(expected.files[name]) !== JSON.stringify(committed.files[name])) problems.push(`${name}: the manifest differs from git`);
    }
    console.log(JSON.stringify({ commit: COMMIT, files: Object.keys(expected.files).length, problems }, null, 2));
    process.exit(problems.length ? 1 : 0);
  } else {
    console.error('usage: tree-manifest.cjs write | check');
    process.exit(2);
  }
}

module.exports = Object.freeze({ COMMIT, TAG, file });
