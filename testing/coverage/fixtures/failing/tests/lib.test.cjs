'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { double } = require('../lib.cjs');

test('the module is fully covered by a passing test', () => {
  assert.equal(double(2), 4);
});

test('a failing test that must make the gate fail even though coverage is 100 percent', () => {
  assert.equal(double(2), 5);
});
