'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { triple } = require('../lib.cjs');

test('triple multiplies by three', () => {
  assert.equal(triple(2), 6);
});
