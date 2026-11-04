'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const model = require('./model.js');

test('digest-pinned preparation does not imply initialization', () => {
  const state = model.next(model.createState('prepared', 'manual'), { action: 'prepare' });
  assert.equal(state.phase, 'prepared');
  assert.equal(state.initialized, false);
  assert.equal(state.production, 'teaching-v1');
});
