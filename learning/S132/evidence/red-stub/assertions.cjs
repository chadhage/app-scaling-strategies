'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const lesson = require('./model.js');

test('starting the original sign-in must retain a v1 start before cutover', () => {
  const result = lesson.execute(lesson.createState(), { type: 'start', scenarioId: 'compatible', budgetMs: 2000 });
  assert.equal(result.phase, 'started');
  assert.equal(result.active.trace.started.version, 'v1');
  assert.equal(result.active.trace.started.atMs, 0);
  assert.equal(result.active.budgetMs, 2000);
  assert.equal(result.history.length, 1);
});
