'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const model = require('./model.js');

test('shared slots consume one unchanged fictional compute pool after extra content', () => {
  let state = model.transition(model.initialState(), {
    type: 'compare', strategy: 'shared-slots', fixture: 'healthy',
  });
  assert.equal(model.project(state).phase, 'compared');
  assert.equal(model.project(state).totalComputeUnits, 24);
  state = model.transition(state, { type: 'add-placement' });
  const result = model.project(state);
  assert.equal(result.planCount, 1);
  assert.equal(result.workers, 2);
  assert.equal(result.totalComputeUnits, 24);
  assert.equal(result.fictionalCostUnits, 2);
  assert.equal(result.placements, 3);
});

test('separate plans provide two compute pools, not automatic fault-domain qualification', () => {
  const state = model.transition(model.initialState(), {
    type: 'compare', strategy: 'separate-plans', fixture: 'healthy',
  });
  const result = model.project(state);
  assert.equal(result.phase, 'compared');
  assert.equal(result.planCount, 2);
  assert.equal(result.totalComputeUnits, 48);
  assert.equal(result.computeIsolated, true);
  assert.equal(result.independentDependencies, false);
  assert.equal(result.independentFaultDomains, 'unverified');
});
