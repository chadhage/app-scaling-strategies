'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { used } = require('../used.cjs');

test('used returns one', () => {
  assert.equal(used(), 1);
});
