'use strict';

const assert = require('node:assert/strict');
const Stub = require('./red-model.stub.cjs');
const observed = Stub.decide(Stub.createState(), {
  scenario: 'slow-200', budgetMs: 1000, action: 'expand',
}).history.at(-1);
assert.equal(observed.acceptance, 'failure');
