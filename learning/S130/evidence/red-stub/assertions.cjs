'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const model = require('./model.js');

test('an explicit typed trace load advances to loaded without certifying a journey', () => {
  const initial = model.createState();
  const state = model.execute(initial, { type: 'load', presetId: 'multi-compatible', version: 'v2' });
  assert.equal(state.phase, 'loaded');
  assert.equal(state.runs.length, 0);
  assert.equal(initial.phase, 'empty');
});
