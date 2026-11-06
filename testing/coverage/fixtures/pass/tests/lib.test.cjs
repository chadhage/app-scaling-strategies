'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classify } = require('../lib.cjs');

test('classifies both sides', () => {
  assert.equal(classify(1), 'positive');
  assert.equal(classify(0), 'non-positive');
});
