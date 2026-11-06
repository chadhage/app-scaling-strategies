'use strict';

// Fixture suite (N4, mutant B10): the diagnostic line of a NESTED test is indented in the TAP output and is still a sighting.
const { describe, test } = require('node:test');

describe('group', () => {
  test('nested test', (t) => {
    t.diagnostic('Real Chromium 156.0.4314.58; nested session');
  });
});
