'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const lesson = require('./model.js');

test('recording a valid fictional candidate changes phase without certifying readiness', () => {
  const state = lesson.execute(lesson.createState(), {
    type: 'prepare', fixture: 'healthy', token: 'v2',
  });
  assert.equal(state.phase, 'prepared');
});
