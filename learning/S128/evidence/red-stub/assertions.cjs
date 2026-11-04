'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('./model.js');

test('version-qualified GA and preview selectors independently pass inspection', () => {
  const baseline = model.createState();
  const inspected = model.transition(baseline, {
    action: 'inspect', gaSelector: 'build-1-only', previewSelector: 'build-2-only',
    routing: 'cohort-gateway', fixture: 'compatible',
  });
  assert.equal(inspected.topology.status, 'passed');
  assert.equal(inspected.traffic.status, 'unknown');
  assert.equal(inspected.journeys.status, 'unknown');
  assert.equal(inspected.authorization.status, 'unknown');
  assert.equal(baseline.history.length, 0);
});
