'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const list = (directory = root) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? list(path.join(directory, entry.name))
    : [path.relative(root, path.join(directory, entry.name))]);

test('owned raw bytes and canonical Git-source integrity match the sealed exact content index', () => {
  const index = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'integrity.json'), 'utf8'));
  assert.deepEqual(index.excludes, ['evidence\\integrity.json']);
  const listed = index.files.map((item) => item.file).sort();
  const actual = list().filter((file) => file !== 'evidence\\integrity.json').sort();
  assert.deepEqual(actual, listed);
  for (const item of index.files) {
    const absolute = path.resolve(root, item.file);
    assert.ok(absolute.startsWith(`${root}${path.sep}`));
    const data = fs.readFileSync(absolute);
    assert.ok(['raw', 'canonical-lf'].includes(item.mode));
    const qualified = item.mode === 'raw'
      ? data : Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
    assert.equal(qualified.length, item.bytes, item.file);
    assert.equal(crypto.createHash('sha256').update(qualified).digest('hex'), item.sha256, item.file);
  }
});
