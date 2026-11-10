'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { COVERED } = require('./final-encoders.cjs');

test('the README encoding catalogue is generated from the exact encoder table used by the independent sweeps', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  const block = /<!-- encoders:begin -->\s*([^]*?)\s*<!-- encoders:end -->/.exec(text);
  assert.ok(block, 'the README has a generated encoding catalogue');
  assert.equal(block[1].trim(), Object.keys(COVERED).map((name) => `\`${name}\``).join(', '));
});
