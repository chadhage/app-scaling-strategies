'use strict';

// Fixture suite for the requalification runner: two passing tests; with FIXTURE_BROWSER_VERSION set the second one
// prints the line the isolated helper suites print ("Real Chromium <version>"), otherwise the suite is silent.
const assert = require('node:assert/strict');
const test = require('node:test');

test('first fixture passes', () => assert.ok(true));
test('second fixture passes', (t) => {
  assert.equal(1, 1);
  if (process.env.FIXTURE_BROWSER_VERSION) t.diagnostic(`Real Chromium ${process.env.FIXTURE_BROWSER_VERSION}; fixture session`);
});
