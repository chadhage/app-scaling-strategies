'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { filteredBlob, rawBlob, rootTextFiles, git } = require('./record.cjs');

test('owned lesson text and attributes preserve the same exact bytes in canonical Git publication and LF checkout', () => {
  const files = rootTextFiles();
  assert.equal(files.length, 14);
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(__dirname, file));
    const logical = `learning/S149/${file}`;
    assert.equal(filteredBlob(bytes, logical), rawBlob(bytes), `${file}: working bytes must equal canonical Git bytes.`);
    assert.equal((bytes.toString('utf8').match(/\r\n/g) || []).length, 0, `${file}: explicit checkout LF must match proof hashes.`);
    const attributes = git('check-attr', 'eol', '--', logical).toString('utf8');
    assert.match(attributes, /eol: lf/);
  }
});
