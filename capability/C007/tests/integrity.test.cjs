'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const path = require('node:path');
const repo = path.resolve(__dirname, '..', '..', '..');
const pins = [
  ['C003', 'matrix-contract.js', '1583da90c1013ba95fdf268d6901f8a14bdf900a', '7fd8863acd4cfa800fbace13b1c2bdf6bbe85636872e71b9c01a3377592cccd1'],
  ['C003', 'matrix-data.js', '1583da90c1013ba95fdf268d6901f8a14bdf900a', 'f549b86b1730e19500b53d79716b72422aaf266ba6ba39558a546fc521e33ab5'],
  ['C005', 'catalog-contract.js', '219a2c0c20e095a1b8d5a8e66f19d8a3299b4329', '9a3d6cdcc41e58b6e559e7839967cac35fac383fcb55c697d03f39d4779d22b9'],
  ['C005', 'catalog-data.js', '219a2c0c20e095a1b8d5a8e66f19d8a3299b4329', '23a79f3203c06006d7b5bc1a17728d1a2d9c729b5e744dd4b4f2972b9c9a26bc']
];

test('all four shared providers match accepted commits after checkout line endings and retain their original worktree hashes', () => {
  for (const [card, name, commit, sha256] of pins) {
    const relative = path.join('capability', card, name);
    const bytes = readFileSync(path.join(repo, relative));
    const objectName = `${commit}:${relative.split(path.sep).join('/')}`;
    const accepted = execFileSync('git', ['--no-pager', 'show', objectName], { cwd: repo, maxBuffer: 1024 * 1024 });
    const normalizeHash = value => createHash('sha256').update(value.toString('utf8').replaceAll('\r\n', '\n')).digest('hex');
    assert.equal(normalizeHash(bytes), normalizeHash(accepted), relative);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256, relative);
  }
});

test('shared pinned-source builder reproduces the historical catalog without requiring evolving README parity', () => {
  const sharedSource = require('../../C005/catalog-source.cjs');
  const expected = sharedSource.buildCatalog();
  assert.deepEqual(require('../../C005/catalog-data.js'), expected);
  sharedSource.verifyLearningTargets(expected);
  assert.equal(expected.entries.length, 152);
});
