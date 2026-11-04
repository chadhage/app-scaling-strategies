'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const stub = require('./classifier.initial.snapshot.cjs');

for (const id of ['modeled-cancel-request', 'modeled-missing-terminal']) {
  test(`initial stub must not pass ${id}`, async () => {
    assert.equal((await stub.inspect(id)).decision, 'HOLD');
  });
}
