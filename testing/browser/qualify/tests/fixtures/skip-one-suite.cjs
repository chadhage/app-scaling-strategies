'use strict';

// Fixture suite for the requalification runner: one test names the browser, one is skipped on a condition
// that is true on every machine (FIXTURE_NEVER_SET is never set), the way a "needs the browser" guard would skip.
const test = require('node:test');

test('names the browser', (t) => {
  t.diagnostic(`Real Chromium ${process.env.FIXTURE_BROWSER_VERSION}; fixture session`);
});
test('needs something this machine does not have', { skip: !process.env.FIXTURE_NEVER_SET }, () => {
  throw new Error('would fail if it ran');
});
