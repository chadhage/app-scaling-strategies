'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const banner = require('./banner-expectations.cjs');
const repo = path.resolve(__dirname, '..', '..', '..');

test('all150 exact IDs have one source-pinned literal, with only S148 carrying one period', () => {
  for (let number = 1; number <= 150; number++) {
    const id = `S${String(number).padStart(3, '0')}`;
    const expected = id === 'S148' ? banner.S148_BANNER : banner.CANONICAL_BANNER;
    assert.equal(banner.expectedTrainingBanner(id, banner.SOURCE_COMMIT), expected);
    assert.doesNotThrow(() => banner.assertTrainingBanner(id, expected, banner.SOURCE_COMMIT));
  }
});

test('the exact S148 Git HTML blob is unchanged in the source and original reviewed publication', () => {
  const read = commit => execFileSync('git', ['--no-pager', 'show', `${commit}:learning/S148/index.html`],
    { cwd: repo, maxBuffer: 8388608 });
  const original = read('23594c59ea5de4ac2656b053c66dbcdd51c9af90');
  const pinned = read(banner.SOURCE_COMMIT);
  assert.deepEqual(pinned, original);
  assert.equal(createHash('sha256').update(pinned).digest('hex'),
    'ec2e3b1b09f986d2a2e4c43a1826c96707f197ade99a294bec67f4d6691bb711');
  assert.ok(pinned.toString('utf8').includes(`>${banner.S148_BANNER}</p>`));
});

for (const [name, id, actual, source] of [
  ['a period on S147', 'S147', banner.S148_BANNER, banner.SOURCE_COMMIT],
  ['a period on S149', 'S149', banner.S148_BANNER, banner.SOURCE_COMMIT],
  ['missing period on S148', 'S148', banner.CANONICAL_BANNER, banner.SOURCE_COMMIT],
  ['two periods on S148', 'S148', `${banner.S148_BANNER}.`, banner.SOURCE_COMMIT],
  ['leading whitespace', 'S148', ` ${banner.S148_BANNER}`, banner.SOURCE_COMMIT],
  ['trailing whitespace', 'S148', `${banner.S148_BANNER} `, banner.SOURCE_COMMIT],
  ['a newline on another ID', 'S001', `${banner.CANONICAL_BANNER}\n`, banner.SOURCE_COMMIT],
  ['extra text', 'S148', `${banner.S148_BANNER} extra`, banner.SOURCE_COMMIT],
  ['an unknown ID', 'S151', banner.CANONICAL_BANNER, banner.SOURCE_COMMIT],
  ['a workflow ID', 'W001', banner.CANONICAL_BANNER, banner.SOURCE_COMMIT],
  ['the earlier source', 'S148', banner.S148_BANNER, 'ebd7433ac143242ab633b52aff864bb2923dac2c']
]) {
  test(`exact banner guard rejects ${name}`, () => {
    assert.throws(() => banner.assertTrainingBanner(id, actual, source), assert.AssertionError);
  });
}
