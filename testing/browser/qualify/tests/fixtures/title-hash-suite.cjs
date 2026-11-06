'use strict';

// Fixture suite (N4, mutant B10): the TITLE of this test contains "# Real Chromium <version>", which the TAP reporter prints after
// "ok 1 - ". It is not a diagnostic line, so it must not count as a browser sighting.
const test = require('node:test');

test('see # Real Chromium 156.0.4314.58 in the title', () => {});
