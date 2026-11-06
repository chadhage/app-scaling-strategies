'use strict';

// Test tooling, not production code: the file tree of an earlier fix of this card as a manifest of SHA-256 hashes: the first fix (commit 8e7046e9, tag
// kanban/C017/8e7046e98131, evidence\tree-8e7046e9.json) and the second fix (commit 8832dac5, tag kanban/C017/8832dac542f6, evidence\tree-8832dac5.json).
// The evidence archives of an earlier fix (green-02, verify-green-02, coverage-02 and the first REDs; green-03, coverage-03 and the REDs of the second
// fix) pin the live files of the day they were made; a later fix legitimately changes some of them, so their pins are recomputed against the manifest of
// the commit they were made at, which is itself anchored to git:
//   node capability\C017\tests\tree-manifest.cjs write [8e7046e9|8832dac5]   writes evidence\tree-<short>.json once (never overwrites; default 8832dac5)
//   node capability\C017\tests\tree-manifest.cjs check [8e7046e9|8832dac5]   recomputes every hash from the git objects of that commit and compares (needs
//                                                                            git: a verification command, not part of the hermetic suite)
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const TREES = Object.freeze({
  '8e7046e9': { commit: '8e7046e981311267b967ae71120d17ace350a307', tag: 'kanban/C017/8e7046e98131', fix: 'first' },
  '8832dac5': { commit: '8832dac542f6767f102d18f2c22e3538b024900a', tag: 'kanban/C017/8832dac542f6', fix: 'second' },
});
const COMMIT = TREES['8e7046e9'].commit;
const TAG = TREES['8e7046e9'].tag;
const fileOf = (short) => path.join(root, 'evidence', `tree-${short}.json`);
const file = fileOf('8e7046e9');
const git = (args, encoding = 'utf8') => execFileSync('git', args, { cwd: repo, encoding, maxBuffer: 1 << 28 });
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');

function fromGit(short) {
  const { commit, tag, fix } = TREES[short];
  const resolved = git(['rev-parse', `${tag}^{commit}`]).trim();
  if (resolved !== commit) throw new Error(`${tag} resolves to ${resolved}`);
  const names = git(['ls-tree', '-r', '--name-only', commit, '--', 'capability/C017']).split('\n').filter(Boolean).sort();
  const files = {};
  for (const name of names) {
    const bytes = git(['show', `${commit}:${name}`], 'buffer');
    files[name] = { bytes: bytes.length, sha256: sha(bytes) };
  }
  return { schema: 'C017-tree/1', commit, tag, note: `SHA-256 of every file under capability/C017 in the commit of the ${fix} fix (the namespace has .gitattributes "* -text": blob bytes equal file bytes).`, files };
}

if (require.main === module) {
  const [mode, short = '8832dac5'] = process.argv.slice(2);
  if (!Object.hasOwn(TREES, short)) {
    console.error('usage: tree-manifest.cjs write | check [8e7046e9|8832dac5]');
    process.exit(2);
  }
  if (mode === 'write') {
    fs.writeFileSync(fileOf(short), `${JSON.stringify(fromGit(short), null, 1)}\n`, { flag: 'wx' });
  } else if (mode === 'check') {
    const expected = fromGit(short);
    const committed = JSON.parse(fs.readFileSync(fileOf(short), 'utf8'));
    const problems = [];
    for (const name of new Set([...Object.keys(expected.files), ...Object.keys(committed.files)])) {
      if (JSON.stringify(expected.files[name]) !== JSON.stringify(committed.files[name])) problems.push(`${name}: the manifest differs from git`);
    }
    console.log(JSON.stringify({ commit: TREES[short].commit, files: Object.keys(expected.files).length, problems }, null, 2));
    process.exit(problems.length ? 1 : 0);
  } else {
    console.error('usage: tree-manifest.cjs write | check [8e7046e9|8832dac5]');
    process.exit(2);
  }
}

module.exports = Object.freeze({ COMMIT, TAG, file, TREES, fileOf });
