'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
function files(directory = root) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  }).sort();
}
function git(arguments_) {
  const run = spawnSync('git', ['--no-pager', ...arguments_], {
    cwd: repository, encoding: 'utf8', timeout: 20000, maxBuffer: 8 * 1024 * 1024
  });
  assert.equal(run.status, 0, run.stderr || run.error?.message);
  return run.stdout;
}
// Git attribute lookup needs repository-internal paths, not Windows filesystem separators.
function gitPath(file) { return path.relative(repository, file).split(path.sep).join('/'); }
function hashes(ownedFiles, noFilters) {
  return git(['hash-object', ...(noFilters ? ['--no-filters'] : []), '--',
    ...ownedFiles.map(gitPath)]).trim().split(/\r?\n/);
}
function prospective() {
  const owned = files();
  const actual = hashes(owned, true);
  const filtered = hashes(owned, false);
  const changed = owned.filter((_, index) => actual[index] !== filtered[index]).map((file) => path.relative(root, file));
  assert.deepEqual(changed, [], 'Git clean filters must preserve exact captured source and evidence bytes.');
  return owned.length;
}
function committed(commit) {
  assert.match(commit, /^[a-f0-9]{40}$/);
  const owned = files();
  const raw = hashes(owned, true);
  const expected = new Map(owned.map((file, index) => [
    gitPath(file), raw[index]
  ]));
  const observed = new Map(git(['ls-tree', '-r', '-z', commit, '--', gitPath(root)])
    .split('\0').filter(Boolean).map((line) => {
      const match = line.match(/^\d+ blob ([a-f0-9]{40})\t(.+)$/);
      assert.ok(match, line);
      return [match[2], match[1]];
    }));
  assert.deepEqual(observed, expected, 'Published commit must contain exactly the owned working bytes, including integrity inventory.');
  return owned.length;
}
if (require.main === module) {
  const commit = process.argv[2];
  console.log(commit
    ? `C024 published tree verified byte-for-byte: ${committed(commit)} files at ${commit}.`
    : `C024 Git clean filters preserve all ${prospective()} owned files.`);
}
module.exports = Object.freeze({ prospective, committed });
