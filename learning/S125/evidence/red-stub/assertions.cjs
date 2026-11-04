'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('./model.js');

test('nominal update records a candidate but keeps old routing until observed readiness', () => {
  const state = model.execute(model.createState(), { type: 'update', fixture: 'ready', version: 'v2' });
  assert.equal(state.phase, 'awaiting-readiness');
  assert.equal(state.candidate.revision, 'lesson-api--r2');
  assert.equal(state.readiness, 'unobserved');
  assert.equal(state.trafficResult, 'unobserved');
  assert.deepEqual(state.traffic, { old: 100, candidate: 0 });
  assert.equal(state.oldLifecycle, 'active');
  assert.equal(state.completed, false);
});
