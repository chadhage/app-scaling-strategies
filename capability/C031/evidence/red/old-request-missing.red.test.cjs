'use strict';

// Increment RED (archived as run-2 before the fix): transition evidence that starts with a state at the old version,
// but never a request at the old version, must not count as an actual transition.
const test = require('node:test');
const assert = require('node:assert/strict');
const evaluator = require('..\\..\\evaluator.js');
const f = require('..\\..\\tests\\fixtures.cjs');

test('transition evidence without any request at the old version is not a complete transition', () => {
  const report = evaluator.evaluateFleet(f.fleet('red-increment', [
    f.client('m-1', [f.state(1, 5, f.OLD), f.request(2, 10, 'r2', f.NEW), f.ack(3, 14, 'r2', f.V2, 12), f.state(4, 20, f.NEW)])]));
  assert.equal(report.clients[0].classification, 'FAILED_OR_UNKNOWN');
  assert.equal(report.clients[0].reasonCodes[0], 'OLD_VERSION_REQUEST_MISSING');
  assert.equal(report.successRate.numerator, 0);
});
