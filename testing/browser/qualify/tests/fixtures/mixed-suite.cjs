'use strict';

// Fixture suite for the requalification runner: two tests that print two different browser versions.
const test = require('node:test');

test('first browser', (t) => { t.diagnostic(`Real Chromium ${process.env.FIXTURE_BROWSER_VERSION}; first session`); });
test('second browser', (t) => { t.diagnostic(`Real Chromium ${process.env.FIXTURE_OTHER_VERSION}; second session`); });
