'use strict';

// Fixture suite for the requalification runner: one passing and one failing test (the failing one names the browser when asked).
const assert = require('node:assert/strict');
const test = require('node:test');

test('first fixture passes', () => assert.ok(true));
test('second fixture fails', (t) => {
  if (process.env.FIXTURE_BROWSER_VERSION) t.diagnostic(`Real Chromium ${process.env.FIXTURE_BROWSER_VERSION}; fixture session`);
  assert.equal(1, 2);
});
