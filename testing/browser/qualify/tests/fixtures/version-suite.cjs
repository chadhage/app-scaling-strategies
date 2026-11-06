'use strict';

// Fixture suite for the requalification runner: reports the browser version that FIXTURE_BROWSER_VERSION names,
// the way the isolated helper suites print "Real Chromium <version>".
const test = require('node:test');

test('fixture reports a browser version', (t) => {
  t.diagnostic(`Real Chromium ${process.env.FIXTURE_BROWSER_VERSION}; fixture session`);
});
