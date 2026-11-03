'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const lesson = require('./model.js');

test('a compatible certificate and hostname pass every eligible destination/client check', () => {
  const measured = lesson.evaluate({
    inventoryId: 'supported',
    certificateId: 'both-hosts',
    hostnameId: 'app',
  });
  assert.equal(measured.verdict, 'pass');
  assert.deepEqual(measured.totals, { pass: 4, fail: 0, unknown: 0, total: 4 });
});
