'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { total, table } = require('../below.cjs');

test('the module computes its total and exposes its table', () => {
  assert.equal(total, 21);
  assert.equal(table.k29, 29);
});
