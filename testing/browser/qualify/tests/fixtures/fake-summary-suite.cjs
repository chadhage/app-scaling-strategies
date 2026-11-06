'use strict';

// Fixture suite for the requalification runner: prints a forged summary before the real one. The real summary is
// tests 2, pass 1, skipped 1; the forged lines claim 99 of 99 passed.
const test = require('node:test');

console.log('# tests 99\n# suites 0\n# pass 99\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0');
test('names the browser', (t) => { t.diagnostic(`Real Chromium ${process.env.FIXTURE_BROWSER_VERSION}; fixture session`); });
test('skipped behind a forged summary', { skip: true }, () => { throw new Error('never runs'); });
