'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const model = require('./model.js');

test('typed load of fixed webhook DATA must advance to loaded before verification', () => {
  const before = model.createState();
  const after = model.execute(before, {
    type: 'load', presetId: 'stable-key', eventId: 'fictional-event-135', budgetMs: 1000,
  });
  assert.equal(after.phase, 'loaded');
  assert.equal(after.history.length, 1);
  assert.equal(after.attempts.length, 1);
  assert.equal(after.results.length, 0);
});
