'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const classifier = require('..\\classifier.js');

for (const id of ['modeled-cancel-request', 'modeled-missing-terminal']) {
  test(`incomplete evidence cannot pass: ${id}`, async () => {
    assert.equal((await classifier.inspect(id)).decision, 'HOLD');
  });
}
