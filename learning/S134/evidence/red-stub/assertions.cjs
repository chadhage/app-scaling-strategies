'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const lesson = require('./model.js');

test('loading response-loss DATA must retain the interruption and unknown first outcome', () => {
  const state = lesson.execute(lesson.createState(), {
    type: 'load',
    checkoutId: 'CHECKOUT-DEMO-01',
  });
  assert.equal(state.phase, 'lost');
  assert.equal(state.active.initial.interruption, 'response-lost');
  assert.equal(state.active.initial.effectOutcome, 'unknown');
  assert.equal(state.history.length, 1);
});
